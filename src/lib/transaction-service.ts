import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  jakartaDayKey,
  REDEMPTION_DISCOUNT_PERCENT,
  STAMP_MINIMUM_TRANSACTION,
  STAMPS_PER_REDEMPTION,
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
}: {
  customerId: string;
  branchId: string;
  amount: number;
  useStampDiscount: boolean;
}): Promise<TransactionOutcome | null> {
  const dayKey = jakartaDayKey();
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) return null;

    const todaysStamp = await tx.stamp.findUnique({
      where: { customerId_dayKey: { customerId, dayKey } },
      select: { id: true },
    });
    const redeemableStamps = useStampDiscount
      ? await tx.stamp.findMany({
          where: { customerId, redeemedAt: null },
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
        },
      });
      redemptionId = redemption.id;
      await tx.stamp.updateMany({
        where: { id: { in: redeemableStamps.map(({ id }) => id) }, redeemedAt: null },
        data: { redeemedAt: new Date() },
      });
    }

    const transaction = await tx.transaction.create({
      data: { customerId, branchId, amount, discountAmount, redemptionId },
    });
    if (amount < STAMP_MINIMUM_TRANSACTION) return { result: "below-minimum", discountAmount };
    if (todaysStamp) return { result: "already-stamped", discountAmount };
    try {
      await tx.stamp.create({ data: { customerId, transactionId: transaction.id, branchId, dayKey } });
      return { result: "stamp-added", discountAmount };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const stamp = await tx.stamp.findUnique({
        where: { customerId_dayKey: { customerId, dayKey } },
        select: { id: true },
      });
      if (!stamp) throw error;
      return { result: "already-stamped", discountAmount };
    }
  });
}
