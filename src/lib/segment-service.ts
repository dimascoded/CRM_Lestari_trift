import { db } from "./db";
import {
  RUTIN_MIN_TRANSACTIONS,
  SEGMENT_WINDOW_DAYS,
  SEGMENTS,
  daysBefore,
} from "./business-rules";

type SegmentName = (typeof SEGMENTS)[keyof typeof SEGMENTS];

export function getCustomerSegment({
  transactionDates,
  activeWishlistCount,
  now = new Date(),
}: {
  transactionDates: Date[];
  activeWishlistCount: number;
  now?: Date;
}): SegmentName {
  const cutoff = daysBefore(SEGMENT_WINDOW_DAYS, now);
  if (transactionDates.filter((date) => date >= cutoff && date <= now).length >= RUTIN_MIN_TRANSACTIONS) {
    return SEGMENTS.RUTIN;
  }
  if (activeWishlistCount > 0) return SEGMENTS.KOLEKTOR;
  return SEGMENTS.BARU_MUSIMAN;
}

export async function countCustomersBySegment(now = new Date(), branchId?: string | null) {
  const cutoff = daysBefore(SEGMENT_WINDOW_DAYS, now);
  const customers = await db.customer.findMany({
    where: { active: true, ...(branchId ? { registeredAtId: branchId } : {}) },
    select: {
      id: true,
      transactions: {
        where: { voidRecord: null, createdAt: { gte: cutoff, lte: now } },
        select: { createdAt: true },
      },
      wishlists: { where: { active: true }, select: { id: true } },
    },
  });
  const counts: Record<SegmentName, number> = {
    [SEGMENTS.RUTIN]: 0,
    [SEGMENTS.KOLEKTOR]: 0,
    [SEGMENTS.BARU_MUSIMAN]: 0,
  };
  for (const customer of customers) {
    const segment = getCustomerSegment({
      transactionDates: customer.transactions.map(({ createdAt }) => createdAt),
      activeWishlistCount: customer.wishlists.length,
      now,
    });
    counts[segment] += 1;
  }
  return counts;
}

export async function getSegmentForCustomer(customerId: string, now = new Date()) {
  const cutoff = daysBefore(SEGMENT_WINDOW_DAYS, now);
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      transactions: {
        where: { voidRecord: null, createdAt: { gte: cutoff, lte: now } },
        select: { createdAt: true },
      },
      wishlists: { where: { active: true }, select: { id: true } },
    },
  });
  if (!customer) return null;
  return getCustomerSegment({
    transactionDates: customer.transactions.map(({ createdAt }) => createdAt),
    activeWishlistCount: customer.wishlists.length,
    now,
  });
}
