import { db } from "./db";
import {
  DEAD_STOCK_DAYS,
  KPI_REPORTING_WINDOW_DAYS,
  REMINDER_CONVERSION_WINDOW_DAYS,
  STOCK_COMPLIANCE_WINDOW_DAYS,
  daysBefore,
  jakartaDayKey,
  ON_TIME_MINUTES,
} from "./business-rules";
import { SIMULATED_SENT_STATUS, describeMessageStatus } from "./message-status";

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
  missingQaBranches?: string[];
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
  const start30 = daysBefore(KPI_REPORTING_WINDOW_DAYS, now);
  const start37 = daysBefore(KPI_REPORTING_WINDOW_DAYS + REMINDER_CONVERSION_WINDOW_DAYS, now);
  const start7 = daysBefore(STOCK_COMPLIANCE_WINDOW_DAYS, now);
  const [
    targets,
    branchCount,
    customerCount,
    duplicateGroups,
    duplicateAttempts,
    qaChecks,
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
    db.redemptionQaCheck.findMany({
      select: { branchId: true, passed: true },
    }),
    db.transaction.groupBy({
      by: ["customerId"],
      where: { createdAt: { gte: start30 }, voidRecord: null },
      _count: { _all: true },
    }),
    db.stockUpdateLog.findMany({
      where: {
        updatedAt: { gte: start7 },
        OR: [{ type: "CHANGE" }, { type: "CONFIRM", countedItems: { not: null } }],
      },
      select: { branchId: true, updatedAt: true },
    }),
    db.stockItem.count({ where: { status: "AVAILABLE", enteredAt: { lt: daysBefore(DEAD_STOCK_DAYS, now) } } }),
    db.reminderLog.findMany({
      where: { sentAt: { gte: start30 }, status: SIMULATED_SENT_STATUS },
      select: { customerId: true, sentAt: true, scheduledFor: true, status: true },
    }),
    db.transaction.count({ where: { createdAt: { gte: start30 }, voidRecord: null } }),
    db.transaction.groupBy({ by: ["customerId"], where: { createdAt: { gte: start30 }, voidRecord: null } }),
  ]);
  if (targets.length !== 8) throw new Error(`Expected 8 KPI targets, found ${targets.length}. Run the database seed.`);

  const duplicateAccounts = duplicateGroups
    .filter(({ _count }) => _count._all > 1)
    .reduce((sum, group) => sum + group._count._all, 0);
  const repeatCount = repeatGroups.filter(({ _count }) => _count._all >= 2).length;
  const recentDayKeys = new Set(
    Array.from({ length: STOCK_COMPLIANCE_WINDOW_DAYS }, (_, index) =>
      jakartaDayKey(daysBefore(STOCK_COMPLIANCE_WINDOW_DAYS - 1 - index, now)),
    ),
  );
  const stockUpdatePairs = new Set(
    stockUpdates
      .filter(({ updatedAt }) => recentDayKeys.has(jakartaDayKey(updatedAt)))
      .map(({ branchId, updatedAt }) => `${branchId}:${jakartaDayKey(updatedAt)}`),
  ).size;
  const checkedBranches = new Set<string>();
  for (const check of qaChecks) {
    checkedBranches.add(check.branchId);
  }
  const branchesWithoutQa = await db.branch.findMany({
    where: { id: { notIn: [...checkedBranches] } },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const qaValue = checkedBranches.size === branchCount && branchCount > 0 && qaChecks.length > 0
    ? qaChecks.filter(({ passed }) => passed).length / qaChecks.length * 100
    : 0;
  const onTimeLogs = reminderLogs.filter(({ scheduledFor, status }) =>
    scheduledFor !== null && describeMessageStatus(status).isSimulated,
  );
  const onTimeCount = onTimeLogs.filter(({ sentAt, scheduledFor }) =>
    scheduledFor !== null && Math.abs(sentAt.getTime() - scheduledFor.getTime()) / 60000 <= ON_TIME_MINUTES,
  ).length;
  const remindedCustomerIds = [...new Set(reminderLogs.map(({ customerId }) => customerId))];
  const conversionTransactions = remindedCustomerIds.length
    ? await db.transaction.findMany({
        where: {
          customerId: { in: remindedCustomerIds },
          createdAt: { gte: start37 },
          voidRecord: null,
        },
        select: { customerId: true, createdAt: true },
      })
    : [];
  const convertedCustomers = new Set<string>();
  for (const log of reminderLogs) {
    if (conversionTransactions.some(({ customerId, createdAt }) =>
      customerId === log.customerId &&
      createdAt > log.sentAt &&
      createdAt <= new Date(log.sentAt.getTime() + REMINDER_CONVERSION_WINDOW_DAYS * 86400000),
    )) {
      convertedCustomers.add(log.customerId);
    }
  }
  const values: Record<KpiCode, number> = {
    S1: customerCount ? (duplicateAccounts / customerCount) * 100 : 0,
    S2: qaValue,
    S3: repeatCount,
    S4: branchCount ? (stockUpdatePairs / (branchCount * STOCK_COMPLIANCE_WINDOW_DAYS)) * 100 : 0,
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
      ...(code === "S2" ? { missingQaBranches: branchesWithoutQa.map(({ name }) => name) } : {}),
    };
  });
}
