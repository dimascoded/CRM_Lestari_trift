ALTER TABLE "Customer" ADD COLUMN "acquisitionChannel" TEXT NOT NULL DEFAULT 'DATANG_LANGSUNG';
ALTER TABLE "Transaction" ADD COLUMN "stampOffered" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StockUpdateLog" ADD COLUMN "countedItems" INTEGER;
ALTER TABLE "StockUpdateLog" ADD COLUMN "systemCount" INTEGER;
ALTER TABLE "ReminderTemplate" ADD COLUMN "targetSegment" TEXT;

CREATE TABLE "RedemptionQaCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "userId" TEXT,
    "passed" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedemptionQaCheck_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RedemptionQaCheck_branchId_idx" ON "RedemptionQaCheck"("branchId");

CREATE TABLE "FollowUpNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "queue" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FollowUpNote_customerId_queue_createdAt_idx" ON "FollowUpNote"("customerId", "queue", "createdAt");
