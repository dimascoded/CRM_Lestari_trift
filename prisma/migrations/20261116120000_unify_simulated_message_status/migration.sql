-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "scheduledFor" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SIMULATED_SENT',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReminderLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReminderTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ReminderLog" ("body", "customerId", "id", "scheduledFor", "sentAt", "status", "templateId") SELECT "body", "customerId", "id", "scheduledFor", "sentAt", "status", "templateId" FROM "ReminderLog";
DROP TABLE "ReminderLog";
ALTER TABLE "new_ReminderLog" RENAME TO "ReminderLog";
CREATE INDEX "ReminderLog_customerId_sentAt_idx" ON "ReminderLog"("customerId", "sentAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

UPDATE "ReminderLog" SET "status" = 'SIMULATED_SENT' WHERE "status" = 'SENT';
UPDATE "StockMatchNotification" SET "status" = 'SIMULATED_SENT' WHERE "status" = 'SENT';
