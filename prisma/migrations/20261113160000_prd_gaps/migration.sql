-- CreateTable
CREATE TABLE "KpiTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "baseline" REAL,
    "target" REAL NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rolloutStage" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Branch" ("createdAt", "id", "name") SELECT "createdAt", "id", "name" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "redemptionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "branchId", "createdAt", "customerId", "id") SELECT "amount", "branchId", "createdAt", "customerId", "id" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_redemptionId_key" ON "Transaction"("redemptionId");
CREATE INDEX "Transaction_customerId_createdAt_idx" ON "Transaction"("customerId", "createdAt");
CREATE TABLE "new_StockUpdateLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CHANGE',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockUpdateLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StockUpdateLog" ("branchId", "id", "updatedAt", "userId") SELECT "branchId", "id", "updatedAt", "userId" FROM "StockUpdateLog";
DROP TABLE "StockUpdateLog";
ALTER TABLE "new_StockUpdateLog" RENAME TO "StockUpdateLog";
CREATE INDEX "StockUpdateLog_branchId_updatedAt_idx" ON "StockUpdateLog"("branchId", "updatedAt");
CREATE TABLE "new_ReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "scheduledFor" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReminderLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReminderTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ReminderLog" ("customerId", "id", "sentAt", "status", "templateId") SELECT "customerId", "id", "sentAt", "status", "templateId" FROM "ReminderLog";
DROP TABLE "ReminderLog";
ALTER TABLE "new_ReminderLog" RENAME TO "ReminderLog";
CREATE INDEX "ReminderLog_customerId_sentAt_idx" ON "ReminderLog"("customerId", "sentAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "KpiTarget_code_key" ON "KpiTarget"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockMatchNotification_stockItemId_customerId_key" ON "StockMatchNotification"("stockItemId", "customerId");
