ALTER TABLE "Customer" ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MessageConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "purpose" TEXT NOT NULL DEFAULT 'MARKETING',
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageConsent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MessageConsent_customerId_createdAt_idx" ON "MessageConsent"("customerId", "createdAt");
