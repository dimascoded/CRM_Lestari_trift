import { db } from "./db";
import {
  DASHBOARD_PERIOD_DAYS,
  DEAD_STOCK_DAYS,
  REMINDER_CONVERSION_WINDOW_DAYS,
  STOCK_COMPLIANCE_WINDOW_DAYS,
  daysBefore,
  jakartaDayKey,
} from "./business-rules";
import { getKpis } from "./kpi";
import { countCustomersBySegment } from "./segment-service";
import { getFollowUpQueues } from "./followup-service";
import { SIMULATED_SENT_STATUS } from "./message-status";

type SummaryOptions = { periodDays: (typeof DASHBOARD_PERIOD_DAYS)[number]; branchId?: string | null; now?: Date };

function weekKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

export async function getDashboardSummary({ periodDays, branchId, now = new Date() }: SummaryOptions) {
  const start = daysBefore(periodDays, now);
  const start7 = daysBefore(STOCK_COMPLIANCE_WINDOW_DAYS, now);
  const branchFilter = branchId ? { branchId } : {};
  const customerFilter = branchId ? { registeredAtId: branchId } : {};
  const [branches, transactions, transactionByBranch, transactionByCustomer, transactionRows, activeCustomers, newCustomers,
    stampCount, stampByBranch, redemptionStats, redemptionCount, consentedCustomers, segments, channels, wishlistCount, wishlistCategories,
    wishlistSizes, stockCategories, stockSizes, wishlistNotifications, availableStock, deadStock, stockLogs,
    reminderLogs, followups, kpis, latestTransactions] = await Promise.all([
    db.branch.findMany({ where: branchId ? { id: branchId } : {}, orderBy: { name: "asc" } }),
    db.transaction.aggregate({
      where: { createdAt: { gte: start }, voidRecord: null, ...branchFilter },
      _count: { _all: true },
      _sum: { amount: true, discountAmount: true },
    }),
    db.transaction.groupBy({
      by: ["branchId"],
      where: { createdAt: { gte: start }, voidRecord: null, ...branchFilter },
      _count: { _all: true },
      _sum: { amount: true, discountAmount: true },
    }),
    db.transaction.groupBy({
      by: ["customerId"],
      where: { createdAt: { gte: start }, voidRecord: null, ...branchFilter },
      _count: { _all: true },
    }),
    db.transaction.findMany({
      where: { createdAt: { gte: start }, voidRecord: null, ...branchFilter },
      select: { amount: true, discountAmount: true, createdAt: true },
    }),
    db.customer.count({ where: { active: true, ...customerFilter } }),
    db.customer.count({ where: { createdAt: { gte: start }, ...customerFilter } }),
    db.stamp.count({ where: { createdAt: { gte: start }, voidedAt: null, ...(branchId ? { branchId } : {}) } }),
    db.stamp.groupBy({
      by: ["branchId"],
      where: { createdAt: { gte: start }, voidedAt: null, ...(branchId ? { branchId } : {}) },
      _count: { _all: true },
    }),
    db.transaction.aggregate({
      where: { createdAt: { gte: start }, voidRecord: null, redemptionId: { not: null }, ...branchFilter },
      _sum: { discountAmount: true },
    }),
    db.redemption.count({
      where: { createdAt: { gte: start }, voidedAt: null, ...(branchId ? { branchId } : {}) },
    }),
    db.customer.count({ where: { active: true, marketingConsent: true, optedOut: false, ...customerFilter } }),
    countCustomersBySegment(now, branchId),
    db.customer.groupBy({ by: ["acquisitionChannel"], where: { active: true, ...customerFilter }, _count: { _all: true } }),
    db.wishlist.count({ where: { active: true, customer: { active: true, ...customerFilter } } }),
    db.wishlist.groupBy({
      by: ["category"],
      where: { active: true, category: { not: null }, customer: { active: true, ...customerFilter } },
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 5,
    }),
    db.wishlist.groupBy({
      by: ["size"],
      where: { active: true, size: { not: null }, customer: { active: true, ...customerFilter } },
      _count: { _all: true },
      orderBy: { _count: { size: "desc" } },
      take: 5,
    }),
    db.stockItem.groupBy({ by: ["category"], where: { status: "AVAILABLE", ...(branchId ? { branchId } : {}) }, _count: { _all: true } }),
    db.stockItem.groupBy({ by: ["size"], where: { status: "AVAILABLE", ...(branchId ? { branchId } : {}) }, _count: { _all: true } }),
    db.stockMatchNotification.count({
      where: { sentAt: { gte: start }, ...(branchId ? { stockItem: { branchId } } : {}) },
    }),
    db.stockItem.count({ where: { status: "AVAILABLE", ...(branchId ? { branchId } : {}) } }),
    db.stockItem.count({ where: { status: "AVAILABLE", enteredAt: { lt: daysBefore(DEAD_STOCK_DAYS, now) }, ...(branchId ? { branchId } : {}) } }),
    db.stockUpdateLog.findMany({
      where: {
        updatedAt: { gte: start7 },
        OR: [{ type: "CHANGE" }, { type: "CONFIRM", countedItems: { not: null } }],
        ...(branchId ? { branchId } : {}),
      },
      select: { branchId: true, updatedAt: true },
    }),
    db.reminderLog.findMany({
      where: { sentAt: { gte: start }, status: SIMULATED_SENT_STATUS, ...(branchId ? { customer: { registeredAtId: branchId } } : {}) },
      select: { customerId: true, sentAt: true },
    }),
    getFollowUpQueues({ now, branchId }),
    getKpis(),
    db.transaction.findMany({
      where: { voidRecord: null, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { customer: { select: { id: true, name: true } }, branch: { select: { name: true } } },
    }),
  ]);
  const netSales = (transactions._sum.amount ?? 0) - (transactions._sum.discountAmount ?? 0);
  const repeatCustomers = transactionByCustomer.filter(({ _count }) => _count._all >= 2).length;
  const consentPercent = activeCustomers ? consentedCustomers / activeCustomers * 100 : 0;
  const salesBuckets = new Map<string, number>();
  for (const transaction of transactionRows) {
    const day = jakartaDayKey(transaction.createdAt);
    const key = periodDays === DASHBOARD_PERIOD_DAYS[2] ? weekKey(day) : day;
    salesBuckets.set(key, (salesBuckets.get(key) ?? 0) + transaction.amount - transaction.discountAmount);
  }
  const salesSeries = [...salesBuckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value }));
  const branchById = new Map(branches.map(({ id, name }) => [id, name]));
  const salesByBranch = transactionByBranch.map((row) => ({
    branchId: row.branchId,
    branchName: branchById.get(row.branchId) ?? "Cabang",
    netSales: (row._sum.amount ?? 0) - (row._sum.discountAmount ?? 0),
    transactions: row._count._all,
    stamps: stampByBranch.find(({ branchId: stampBranch }) => stampBranch === row.branchId)?._count._all ?? 0,
  }));
  const wishlistCategoryRows = wishlistCategories.map(({ category, _count }) => ({
    label: category ?? "Lainnya",
    wishlists: _count._all,
    availableStock: stockCategories.find((row) => row.category === category)?._count._all ?? 0,
  }));
  const wishlistSizeRows = wishlistSizes.map(({ size, _count }) => ({
    label: size ?? "Lainnya",
    wishlists: _count._all,
    availableStock: stockSizes.find((row) => row.size === size)?._count._all ?? 0,
  }));
  const recentDayKeys = new Set(Array.from(
    { length: STOCK_COMPLIANCE_WINDOW_DAYS },
    (_, index) => jakartaDayKey(daysBefore(STOCK_COMPLIANCE_WINDOW_DAYS - 1 - index, now)),
  ));
  const wishlistFollowups = followups.WISHLIST_BELUM.length;
  const totalFollowups = Object.values(followups).reduce((sum, rows) => sum + rows.length, 0);
  const reminderCustomerIds = [...new Set(reminderLogs.map(({ customerId }) => customerId))];
  const conversionTransactions = reminderCustomerIds.length ? await db.transaction.findMany({
    where: {
      customerId: { in: reminderCustomerIds },
      createdAt: { gte: start },
      voidRecord: null,
      ...(branchId ? { branchId } : {}),
    },
    select: { customerId: true, createdAt: true },
  }) : [];
  const converted = new Set<string>();
  for (const log of reminderLogs) {
    if (conversionTransactions.some(({ customerId, createdAt }) =>
      customerId === log.customerId && createdAt > log.sentAt &&
      createdAt <= new Date(log.sentAt.getTime() + REMINDER_CONVERSION_WINDOW_DAYS * 86400000),
    )) converted.add(log.customerId);
  }
  const stockCompliance = branches.map((branch) => ({
    branchId: branch.id,
    branchName: branch.name,
    days: new Set(stockLogs.filter(({ branchId: id, updatedAt }) => id === branch.id && recentDayKeys.has(jakartaDayKey(updatedAt))).map(({ updatedAt }) => jakartaDayKey(updatedAt))).size,
  }));

  return {
    periodDays,
    branchId: branchId ?? null,
    summary: {
      activeCustomers,
      newCustomers,
      netSales,
      transactions: transactions._count._all,
      averageTransaction: transactions._count._all ? netSales / transactions._count._all : 0,
      stamps: stampCount,
      redemptionCount,
      stampDiscounts: redemptionStats._sum.discountAmount ?? 0,
      repeatCustomers,
      consentPercent,
    },
    salesSeries,
    salesByBranch,
    customersBySegment: segments,
    customersByChannel: channels.map(({ acquisitionChannel, _count }) => ({ label: acquisitionChannel, count: _count._all })),
    wishlist: {
      activeCount: wishlistCount,
      categories: wishlistCategoryRows,
      sizes: wishlistSizeRows,
      notifications: wishlistNotifications,
      followups: wishlistFollowups,
    },
    stock: { available: availableStock, dead: deadStock, compliance: stockCompliance },
    messages: { reminderCount: reminderLogs.length, conversionPercent: reminderCustomerIds.length ? converted.size / reminderCustomerIds.length * 100 : 0, followups: totalFollowups },
    kpis,
    branches,
    latestTransactions,
  };
}
