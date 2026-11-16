import { db } from "./db";

export async function confirmStockTodayRecord(branchId: string, userId?: string) {
  return db.stockUpdateLog.create({ data: { branchId, userId, type: "CONFIRM" } });
}
