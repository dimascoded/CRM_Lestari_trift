DROP INDEX "Stamp_customerId_dayKey_key";

ALTER TABLE "Redemption" ADD COLUMN "voidedAt" DATETIME;
ALTER TABLE "Stamp" ADD COLUMN "activeDayKey" TEXT;
ALTER TABLE "Stamp" ADD COLUMN "voidedAt" DATETIME;

CREATE TABLE "TransactionVoid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "voidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionVoid_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransactionVoid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "RedemptionStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "redemptionId" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedemptionStamp_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RedemptionStamp_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TransactionVoid_transactionId_key" ON "TransactionVoid"("transactionId");
CREATE INDEX "TransactionVoid_userId_voidedAt_idx" ON "TransactionVoid"("userId", "voidedAt");
CREATE INDEX "RedemptionStamp_stampId_idx" ON "RedemptionStamp"("stampId");
CREATE UNIQUE INDEX "RedemptionStamp_redemptionId_stampId_key" ON "RedemptionStamp"("redemptionId", "stampId");

UPDATE "Stamp"
SET "activeDayKey" = "dayKey"
WHERE "redeemedAt" IS NULL;

WITH "candidates" AS (
    SELECT
        r."id" AS "redemptionId",
        s."id" AS "stampId",
        r."stampCount" AS "stampCount",
        ROW_NUMBER() OVER (PARTITION BY r."id" ORDER BY s."id") AS "redemptionRank",
        ROW_NUMBER() OVER (PARTITION BY s."id" ORDER BY r."id") AS "stampRank"
    FROM "Redemption" r
    JOIN "Stamp" s
      ON s."customerId" = r."customerId"
     AND s."redeemedAt" = r."createdAt"
)
INSERT INTO "RedemptionStamp" ("id", "redemptionId", "stampId", "createdAt")
SELECT lower(hex(randomblob(16))), "redemptionId", "stampId", CURRENT_TIMESTAMP
FROM "candidates"
WHERE "redemptionRank" <= "stampCount"
  AND "stampRank" = 1;

CREATE UNIQUE INDEX "Stamp_customerId_activeDayKey_key" ON "Stamp"("customerId", "activeDayKey");
