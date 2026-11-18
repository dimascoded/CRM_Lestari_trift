import { db } from "./db";

export async function confirmStockTodayRecord(branchId: string, countedItems: number, userId?: string) {
  if (!Number.isSafeInteger(countedItems) || countedItems < 0) throw new Error("countedItems must be a non-negative integer.");
  const systemCount = await db.stockItem.count({ where: { branchId, status: "AVAILABLE" } });
  return db.stockUpdateLog.create({
    data: { branchId, userId, type: "CONFIRM", countedItems, systemCount },
  });
}
