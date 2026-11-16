ALTER TABLE "StockMatchNotification" ADD COLUMN "body" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StockMatchNotification" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SIMULATED_SENT';

CREATE TABLE "StockNotificationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'wishlist',
    "message" TEXT NOT NULL DEFAULT 'Hai {nama}, barang wishlist kamu ada: {barang} ({ukuran}) di cabang {cabang}.',
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "StockNotificationTemplate" ("id", "message", "updatedAt")
VALUES ('wishlist', 'Hai {nama}, barang wishlist kamu ada: {barang} ({ukuran}) di cabang {cabang}.', CURRENT_TIMESTAMP);
