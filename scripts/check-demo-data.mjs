import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { SEGMENTS, STAMP_MINIMUM_TRANSACTION } from "../src/lib/business-rules.ts";
import { getCustomerSegment } from "../src/lib/segment-service.ts";
import { getFollowUpQueues } from "../src/lib/followup-service.ts";
import { getKpis } from "../src/lib/kpi.ts";

const db = new PrismaClient();
const now = new Date();

async function main() {
  const [
    customerCount,
    transactionCount,
    stockCount,
    wishlistCount,
    notificationCount,
    reminderCount,
    stockLogCount,
    followUpCount,
    duplicateCount,
    redemptionCount,
    stampRows,
    customers,
  ] = await Promise.all([
    db.customer.count(),
    db.transaction.count(),
    db.stockItem.count(),
    db.wishlist.count(),
    db.stockMatchNotification.count(),
    db.reminderLog.count(),
    db.stockUpdateLog.count(),
    db.followUpNote.count(),
    db.duplicateCheckLog.count(),
    db.redemption.count(),
    db.stamp.findMany({
      include: { transaction: { select: { amount: true } } },
    }),
    db.customer.findMany({
      where: { active: true },
      select: {
        id: true,
        whatsapp: true,
        marketingConsent: true,
        optedOut: true,
        transactions: { where: { voidRecord: null }, select: { createdAt: true } },
        wishlists: { where: { active: true }, select: { id: true } },
      },
    }),
  ]);

  const stampByCustomerDay = new Map();
  for (const stamp of stampRows) {
    const key = `${stamp.customerId}:${stamp.dayKey}`;
    stampByCustomerDay.set(key, (stampByCustomerDay.get(key) ?? 0) + 1);
  }
  const duplicateStampDays = [...stampByCustomerDay.values()].filter((count) => count > 1);
  assert.equal(duplicateStampDays.length, 0, "Ada pelanggan dengan dua stamp pada dayKey yang sama.");

  for (const stamp of stampRows) {
    assert.ok(
      stamp.transaction.amount >= STAMP_MINIMUM_TRANSACTION,
      `Stamp ${stamp.id} berasal dari transaksi di bawah minimum.`,
    );
  }

  const redemptionRows = await db.redemption.findMany({
    select: { id: true, _count: { select: { stamps: true } } },
  });
  for (const redemption of redemptionRows) {
    assert.equal(redemption._count.stamps, 3, `Redemption ${redemption.id} tidak memuat tepat 3 stamp.`);
  }

  const segmentCounts = { [SEGMENTS.RUTIN]: 0, [SEGMENTS.KOLEKTOR]: 0, [SEGMENTS.BARU_MUSIMAN]: 0 };
  for (const customer of customers) {
    const segment = getCustomerSegment({
      transactionDates: customer.transactions.map(({ createdAt }) => createdAt),
      activeWishlistCount: customer.wishlists.length,
      now,
    });
    segmentCounts[segment]++;
  }
  for (const segment of Object.values(SEGMENTS)) {
    assert.ok(segmentCounts[segment] > 10, `Segmen ${segment} tidak memiliki lebih dari 10 pelanggan.`);
  }

  const queues = await getFollowUpQueues();
  for (const [queue, rows] of Object.entries(queues)) {
    assert.ok(rows.length > 3, `Antrean ${queue} tidak memiliki lebih dari 3 baris.`);
  }

  const consented = customers.filter(({ marketingConsent, optedOut }) => marketingConsent && !optedOut).length;
  const consentPercent = customers.length ? consented / customers.length * 100 : 0;
  assert.ok(consentPercent >= 60 && consentPercent <= 80, `Persentase persetujuan ${consentPercent.toFixed(1)}% di luar 60%-80%.`);

  const phones = customers.map(({ whatsapp }) => whatsapp);
  assert.equal(new Set(phones).size, phones.length, "Ada nomor WhatsApp duplikat.");
  for (const phone of phones) {
    assert.match(phone, /^\+628123456(?:7|8)\d{3,4}$/);
  }

  const kpis = await getKpis();
  const entitas = [
    ["Pelanggan aktif", customerCount],
    ["Transaksi", transactionCount],
    ["Barang stok", stockCount],
    ["Wishlist", wishlistCount],
    ["Notifikasi stok", notificationCount],
    ["Reminder log", reminderCount],
    ["Log update stok", stockLogCount],
    ["Catatan tindak lanjut", followUpCount],
    ["Percobaan ganda", duplicateCount],
    ["Penukaran", redemptionCount],
  ];
  console.log("Jumlah entitas demo");
  for (const [label, value] of entitas) console.log(`- ${label}: ${value}`);
  console.log("\nSegmen pelanggan");
  for (const segment of Object.values(SEGMENTS)) console.log(`- ${segment}: ${segmentCounts[segment]}`);
  console.log("\nAntrean tindak lanjut");
  for (const [queue, rows] of Object.entries(queues)) console.log(`- ${queue}: ${rows.length}`);
  console.log(`\nPersetujuan pesan: ${consentPercent.toFixed(1)}%`);
  console.log("\nKPI");
  for (const kpi of kpis) console.log(`- ${kpi.code}: ${kpi.value.toFixed(1)} ${kpi.unit} · ${kpi.status}`);
  console.log("\nPemeriksaan data demo lulus.");
}

main()
  .catch((error) => {
    console.error(`Pemeriksaan data demo gagal: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
