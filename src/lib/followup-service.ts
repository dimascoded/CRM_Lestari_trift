import { db } from "./db";
import {
  FOLLOWUP_HIDE_DAYS,
  FOLLOWUP_NOTE_MAX_LENGTH,
  REMINDER_COOLDOWN_DAYS,
  SEASONAL_INACTIVE_DAYS,
  STAMPS_PER_REDEMPTION,
  daysBefore,
} from "./business-rules";
import { personalSchedule } from "./reminders";
import { getCustomerSegment } from "./segment-service";
import { featureEnabled } from "./rollout";
import { writeAuditLog } from "./audit-service";

export const FOLLOWUP_QUEUES = ["JATUH_TEMPO", "SATU_STAMP", "TIDAK_AKTIF", "WISHLIST_BELUM"] as const;
export type FollowUpQueue = (typeof FOLLOWUP_QUEUES)[number];

export type FollowUpRow = {
  customerId: string;
  customerName: string;
  segment: string;
  reason: string;
  lastTransactionAt: Date | null;
  marketingConsent: boolean;
  optedOut: boolean;
};

export async function markFollowedUpRecord({
  customerId,
  userId,
  branchId,
  queue,
  note,
}: {
  customerId: string;
  userId: string;
  branchId: string;
  queue: string;
  note: string;
}) {
  if (!(FOLLOWUP_QUEUES as readonly string[]).includes(queue) || note.length > FOLLOWUP_NOTE_MAX_LENGTH) {
    throw new Error("Invalid follow-up data.");
  }
  return db.$transaction(async (tx) => {
    const followUp = await tx.followUpNote.create({
      data: { customerId, userId, queue, note },
    });
    await writeAuditLog(tx, {
      userId,
      action: "CUSTOMER_FOLLOWUP_RECORDED",
      entity: "FOLLOWUP_NOTE",
      entityId: followUp.id,
      branchId,
      summary: `Tindak lanjut antrean ${queue} dicatat.`,
    });
    return followUp;
  });
}

function matchesWishlist(wishlist: { category: string | null; size: string | null; keyword: string | null }, item: {
  category: string; size: string; name: string;
}) {
  const keyword = wishlist.keyword?.trim().toLocaleLowerCase("id-ID");
  return (!wishlist.category || wishlist.category === item.category) &&
    (!wishlist.size || wishlist.size === item.size) &&
    (!keyword || item.name.toLocaleLowerCase("id-ID").includes(keyword));
}

export async function getFollowUpQueues({
  now = new Date(),
  branchId,
}: {
  now?: Date;
  branchId?: string | null;
} = {}): Promise<Record<FollowUpQueue, FollowUpRow[]>> {
  const customers = await db.customer.findMany({
    where: { active: true, ...(branchId ? { registeredAtId: branchId } : {}) },
    include: {
      transactions: {
        where: { voidRecord: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { createdAt: true },
      },
      stamps: { where: { redeemedAt: null, voidedAt: null, activeDayKey: { not: null } }, select: { id: true } },
      wishlists: { where: { active: true } },
    },
  });
  const customerIds = customers.map(({ id }) => id);
  const hideAfter = daysBefore(FOLLOWUP_HIDE_DAYS, now);
  const [availableItems, hiddenNotes, reminderLogs, stockNotifications, stockNotificationEnabled] = await Promise.all([
    db.stockItem.findMany({
      where: { status: "AVAILABLE" },
    }),
    db.followUpNote.findMany({
      where: { customerId: { in: customerIds }, createdAt: { gte: hideAfter } },
      select: { customerId: true, queue: true },
    }),
    db.reminderLog.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, sentAt: true, scheduledFor: true },
    }),
    db.stockMatchNotification.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, stockItemId: true, sentAt: true },
    }),
    featureEnabled("stockNotification"),
  ]);
  const hidden = new Set(hiddenNotes.map(({ customerId: id, queue }) => `${id}:${queue}`));
  const queues: Record<FollowUpQueue, FollowUpRow[]> = {
    JATUH_TEMPO: [],
    SATU_STAMP: [],
    TIDAK_AKTIF: [],
    WISHLIST_BELUM: [],
  };
  const cooldown = daysBefore(REMINDER_COOLDOWN_DAYS, now);

  for (const customer of customers) {
    const transactions = customer.transactions;
    const dates = transactions.map(({ createdAt }) => createdAt);
    const segment = getCustomerSegment({
      transactionDates: dates,
      activeWishlistCount: customer.wishlists.length,
      now,
    });
    const lastTransactionAt = transactions[0]?.createdAt ?? null;
    const base = {
      customerId: customer.id,
      customerName: customer.name,
      segment,
      lastTransactionAt,
      marketingConsent: customer.marketingConsent,
      optedOut: customer.optedOut,
    };
    const add = (queue: FollowUpQueue, reason: string) => {
      if (!hidden.has(`${customer.id}:${queue}`)) queues[queue].push({ ...base, reason });
    };

    const schedule = personalSchedule(transactions, now);
    if (schedule && !reminderLogs.some((log) => log.customerId === customer.id && log.scheduledFor?.getTime() === schedule.getTime())) {
      add("JATUH_TEMPO", "Jadwal reminder personal sudah tiba.");
    }
    if (customer.stamps.length === STAMPS_PER_REDEMPTION - 1) {
      add("SATU_STAMP", "Satu stamp lagi untuk mencapai penukaran.");
    }
    if (lastTransactionAt && lastTransactionAt < daysBefore(SEASONAL_INACTIVE_DAYS, now)) {
      add("TIDAK_AKTIF", `Tidak bertransaksi lebih dari ${SEASONAL_INACTIVE_DAYS} hari.`);
    }

    const matchingItems = availableItems.filter((item) =>
      stockNotificationEnabled &&
      customer.wishlists.some((wishlist) => matchesWishlist(wishlist, item)),
    );
    const missingItem = matchingItems.find((item) =>
      !stockNotifications.some((notification) =>
        notification.customerId === customer.id && notification.stockItemId === item.id,
      ),
    );
    if (missingItem) {
      const recentMessage = reminderLogs.some((log) => log.customerId === customer.id && log.sentAt >= cooldown) ||
        stockNotifications.some((notification) => notification.customerId === customer.id && notification.sentAt >= cooldown);
      const reason = customer.optedOut
        ? "Pelanggan memilih berhenti menerima pesan."
        : !customer.marketingConsent
          ? "Belum ada persetujuan pesan."
          : recentMessage
            ? "Menunggu cooldown pesan tujuh hari."
            : "Wishlist cocok; notifikasi belum diproses.";
      add("WISHLIST_BELUM", reason);
    }
  }
  return queues;
}
