import { Prisma } from "@prisma/client";
import { db } from "./db";

export type AuditEntry = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  branchId?: string | null;
  summary: string;
  createdAt?: Date;
};

export async function writeAuditLog(
  tx: Pick<Prisma.TransactionClient, "auditLog">,
  entry: AuditEntry,
) {
  return tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      branchId: entry.branchId ?? null,
      summary: entry.summary,
      ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
    },
  });
}

export async function recordAuditEvent(entry: AuditEntry) {
  return db.$transaction((tx) => writeAuditLog(tx, entry));
}
