import { Prisma } from "@prisma/client";
import { db } from "./db";
import { writeAuditLog } from "./audit-service";
import {
  jakartaDayKey,
  REDEMPTION_DISCOUNT_PERCENT,
  STAMP_MINIMUM_TRANSACTION,
  STAMPS_PER_REDEMPTION,
  TRANSACTION_VOID_REASON_MAX_LENGTH,
  TRANSACTION_VOID_WINDOW,
} from "./business-rules";

export type TransactionOutcome = {
  result: "below-minimum" | "already-stamped" | "stamp-added";
  discountAmount: number;
};

export async function recordTransactionRecord({
  customerId,
  branchId,
  amount,
  useStampDiscount,
  stampOffered = true,
}: {
  customerId: string;
  branchId: string;
  amount: number;
  useStampDiscount: boolean;
  stampOffered?: boolean;
}): Promise<TransactionOutcome | null> {
  const now = new Date();
  const dayKey = jakartaDayKey(now);
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, active: true } });
    if (!customer || !customer.active) return null;

    const todaysStamp = await tx.stamp.findUnique({
      where: { customerId_activeDayKey: { customerId, activeDayKey: dayKey } },
      select: { id: true },
    });
    const redeemableStamps = useStampDiscount
      ? await tx.stamp.findMany({
          where: { customerId, redeemedAt: null, voidedAt: null, activeDayKey: { not: null } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: STAMPS_PER_REDEMPTION,
        })
      : [];
    const canRedeem = redeemableStamps.length === STAMPS_PER_REDEMPTION;
    const discountAmount = canRedeem
      ? Math.floor((amount * REDEMPTION_DISCOUNT_PERCENT) / 100)
      : 0;
    let redemptionId: string | null = null;
    if (canRedeem) {
      const redemption = await tx.redemption.create({
        data: {
          customerId,
          branchId,
          discountPercent: REDEMPTION_DISCOUNT_PERCENT,
          stampCount: STAMPS_PER_REDEMPTION,
          createdAt: now,
        },
      });
      redemptionId = redemption.id;
      const updatedStamps = await tx.stamp.updateMany({
        where: {
          id: { in: redeemableStamps.map(({ id }) => id) },
          redeemedAt: null,
          voidedAt: null,
        },
        data: { redeemedAt: now },
      });
      if (updatedStamps.count !== redeemableStamps.length) {
        throw new Error("Stamp redemption changed concurrently; transaction was not recorded.");
      }
      for (const stamp of redeemableStamps) {
        await tx.redemptionStamp.create({
          data: { redemptionId: redemption.id, stampId: stamp.id, createdAt: now },
        });
      }
    }

    const transaction = await tx.transaction.create({
      data: { customerId, branchId, amount, discountAmount, redemptionId, stampOffered, createdAt: now },
    });
    if (amount < STAMP_MINIMUM_TRANSACTION) return { result: "below-minimum", discountAmount };
    if (todaysStamp) return { result: "already-stamped", discountAmount };
    try {
      await tx.stamp.create({
        data: { customerId, transactionId: transaction.id, branchId, dayKey, activeDayKey: dayKey, createdAt: now },
      });
      return { result: "stamp-added", discountAmount };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const stamp = await tx.stamp.findUnique({
        where: { customerId_activeDayKey: { customerId, activeDayKey: dayKey } },
        select: { id: true },
      });
      if (!stamp) throw error;
      return { result: "already-stamped", discountAmount };
    }
  });
}

export type TransactionVoidOutcome =
  | "voided"
  | "not-found"
  | "already-voided"
  | "outside-window"
  | "stamp-already-redeemed"
  | "redemption-history-incomplete"
  | "invalid-reason";

export async function voidTransactionRecord({
  transactionId,
  userId,
  reason,
  now = new Date(),
}: {
  transactionId: string;
  userId: string;
  reason: string;
  now?: Date;
}): Promise<TransactionVoidOutcome> {
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > TRANSACTION_VOID_REASON_MAX_LENGTH) {
    return "invalid-reason";
  }

  return db.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: transactionId },
      include: {
        stamp: true,
        voidRecord: true,
        redemption: { include: { stamps: { include: { stamp: true } } } },
      },
    });
    if (!transaction) return "not-found";
    if (transaction.voidRecord) return "already-voided";
    if (TRANSACTION_VOID_WINDOW === "SAME_JAKARTA_DAY" && jakartaDayKey(transaction.createdAt) !== jakartaDayKey(now)) {
      return "outside-window";
    }
    if (transaction.stamp?.redeemedAt) return "stamp-already-redeemed";
    if (transaction.stamp?.voidedAt) return "already-voided";

    const redemption = transaction.redemption;
    const redeemedStamps = redemption?.stamps.map(({ stamp }) => stamp) ?? [];
    if (
      redemption &&
      (redemption.voidedAt ||
        redeemedStamps.length !== redemption.stampCount ||
        redeemedStamps.some((stamp) => stamp.redeemedAt === null || stamp.voidedAt !== null))
    ) {
      return "redemption-history-incomplete";
    }

    await tx.transactionVoid.create({
      data: { transactionId, userId, reason: normalizedReason, voidedAt: now },
    });
    await writeAuditLog(tx, {
      userId,
      action: "TRANSACTION_VOIDED",
      entity: "TRANSACTION",
      entityId: transactionId,
      branchId: transaction.branchId,
      summary: "Transaksi dibatalkan; alasan tersimpan pada catatan void.",
      createdAt: now,
    });

    if (redemption) {
      const restored = await tx.stamp.updateMany({
        where: {
          id: { in: redeemedStamps.map(({ id }) => id) },
          redeemedAt: { not: null },
          voidedAt: null,
        },
        data: { redeemedAt: null },
      });
      if (restored.count !== redeemedStamps.length) {
        throw new Error("Unable to restore all stamps for the voided redemption.");
      }
      await tx.redemption.update({ where: { id: redemption.id }, data: { voidedAt: now } });
    }

    if (transaction.stamp) {
      const voidedStamp = await tx.stamp.updateMany({
        where: { id: transaction.stamp.id, redeemedAt: null, voidedAt: null },
        data: { voidedAt: now, activeDayKey: null },
      });
      if (voidedStamp.count !== 1) {
        throw new Error("Unable to cancel the stamp for the voided transaction.");
      }
    }

    return "voided";
  });
}
