import { db } from "./db";
import { DEAD_STOCK_DAYS, daysBefore, jakartaDayKey, ON_TIME_MINUTES } from "./business-rules";

type KpiCode = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7a" | "S7b";

export type KpiRow = {
  code: KpiCode;
  label: string;
  unit: string;
  baseline: number | null;
  target: number;
  value: number;
  status: "Tercapai" | "Berjalan" | "Belum";
  duplicateAttempts?: number;
};

function progressStatus(value: number, baseline: number | null, target: number, lowerIsBetter: boolean): KpiRow["status"] {
  const reached = lowerIsBetter ? value <= target : value >= target;
  if (reached) return "Tercapai";
  if (baseline === null) return "Belum";
  const distance = lowerIsBetter ? baseline - target : target - baseline;
  if (distance <= 0) return "Belum";
  const progress = lowerIsBetter ? (baseline - value) / distance : (value - baseline) / distance;
  return progress >= 0.5 ? "Berjalan" : "Belum";
}

export async function getKpis(): Promise<KpiRow[]> {
  const now = new Date();
  const start30 = daysBefore(30, now);
  const start37 = daysBefore(37, now);
  const start7 = daysBefore(7, now);
  const [
    targets,
    branchCount,
    customerCount,
    duplicateGroups,
    duplicateAttempts,
    redeemedBranches,
    repeatGroups,
    stockUpdates,
    deadStock,
    reminderLogs,
    transactionCount,
    activeCustomers,
  ] = await Promise.all([
    db.kpiTarget.findMany(),
    db.branch.count(),
    db.customer.count(),
    db.customer.groupBy({ by: ["whatsapp"], _count: { _all: true } }),
    db.duplicateCheckLog.count(),
    db.redemption.groupBy({ by: ["branchId"] }),
    db.transaction.groupBy({
      by: ["customerId"],
      where: { createdAt: { gte: start30 } },
      _count: { _all: true },
    }),
    db.stockUpdateLog.findMany({
      where: { type: "CHANGE", updatedAt: { gte: start7 } },
      select: { branchId: true, updatedAt: true },
    }),
    db.stockItem.count({ where: { status: "AVAILABLE", enteredAt: { lt: daysBefore(DEAD_STOCK_DAYS, now) } } }),
    db.reminderLog.findMany({
      where: { sentAt: { gte: start30 }, status: "SENT" },
      select: { customerId: true, sentAt: true, scheduledFor: true },
    }),
    db.transaction.count({ where: { createdAt: { gte: start30 } } }),
    db.transaction.groupBy({ by: ["customerId"], where: { createdAt: { gte: start30 } } }),
  ]);
  if (targets.length !== 8) throw new Error(`Expected 8 KPI targets, found ${targets.length}. Run the database seed.`);

  const duplicateAccounts = duplicateGroups
    .filter(({ _count }) => _count._all > 1)
    .reduce((sum, group) => sum + group._count._all, 0);
  const repeatCount = repeatGroups.filter(({ _count }) => _count._all >= 2).length;
  const recentDayKeys = new Set(
    Array.from({ length: 7 }, (_, index) => jakartaDayKey(daysBefore(6 - index, now))),
  );
  const stockUpdatePairs = new Set(
    stockUpdates
      .filter(({ updatedAt }) => recentDayKeys.has(jakartaDayKey(updatedAt)))
      .map(({ branchId, updatedAt }) => `${branchId}:${jakartaDayKey(updatedAt)}`),
  ).size;
  const onTimeLogs = reminderLogs.filter(({ scheduledFor }) => scheduledFor !== null);
  const onTimeCount = onTimeLogs.filter(({ sentAt, scheduledFor }) =>
    scheduledFor !== null && Math.abs(sentAt.getTime() - scheduledFor.getTime()) / 60000 <= ON_TIME_MINUTES,
  ).length;
  const remindedCustomerIds = [...new Set(reminderLogs.map(({ customerId }) => customerId))];
  const conversionTransactions = remindedCustomerIds.length
    ? await db.transaction.findMany({
        where: {
          customerId: { in: remindedCustomerIds },
          createdAt: { gte: start37 },
        },
        select: { customerId: true, createdAt: true },
      })
    : [];
  const convertedCustomers = new Set<string>();
  for (const log of reminderLogs) {
    if (conversionTransactions.some(({ customerId, createdAt }) =>
      customerId === log.customerId &&
      createdAt > log.sentAt &&
      createdAt <= new Date(log.sentAt.getTime() + 7 * 86400000),
    )) {
      convertedCustomers.add(log.customerId);
    }
  }
  const values: Record<KpiCode, number> = {
    S1: customerCount ? (duplicateAccounts / customerCount) * 100 : 0,
    S2: branchCount ? (redeemedBranches.length / branchCount) * 100 : 0,
    S3: repeatCount,
    S4: branchCount ? (stockUpdatePairs / (branchCount * 7)) * 100 : 0,
    S5: deadStock,
    S6: onTimeLogs.length ? (onTimeCount / onTimeLogs.length) * 100 : 0,
    S7a: activeCustomers.length ? transactionCount / activeCustomers.length : 0,
    S7b: remindedCustomerIds.length ? (convertedCustomers.size / remindedCustomerIds.length) * 100 : 0,
  };
  const lowerIsBetter = new Set<KpiCode>(["S1", "S5"]);
  const codeOrder: KpiCode[] = ["S1", "S2", "S3", "S4", "S5", "S6", "S7a", "S7b"];
  return codeOrder.map((code) => {
    const target = targets.find((row) => row.code === code);
    if (!target) throw new Error(`Missing KPI target ${code}.`);
    return {
      code,
      label: target.label,
      unit: target.unit,
      baseline: target.baseline,
      target: target.target,
      value: values[code],
      status: progressStatus(values[code], target.baseline, target.target, lowerIsBetter.has(code)),
      ...(code === "S1" ? { duplicateAttempts } : {}),
    };
  });
}
