import { db } from "./db";

export async function confirmStockTodayRecord(branchId: string) {
  return db.stockUpdateLog.create({ data: { branchId, type: "CONFIRM" } });
}
