import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = "file:./prisma/regression-test.db";
const env = { ...process.env, DATABASE_URL: databaseUrl };
const command = process.env.ComSpec ?? "cmd.exe";
const setup = spawnSync(command, ["/d", "/s", "/c", "npx prisma db push --force-reset --skip-generate"], {
  cwd: root,
  env,
  encoding: "utf8",
});
if (setup.status !== 0) {
  process.stderr.write(setup.stdout ?? "");
  process.stderr.write(setup.stderr ?? "");
  throw new Error("Unable to initialize the isolated regression database.");
}

process.env.DATABASE_URL = databaseUrl;
const [{ db }, { jakartaDayKey }, { registerCustomerRecord }, { recordTransactionRecord }, { matchStockItem, matchWishlist }, { processDueReminders }, { confirmStockTodayRecord }, { getKpis }] = await Promise.all([
  import("../src/lib/db.ts"),
  import("../src/lib/business-rules.ts"),
  import("../src/lib/customer-service.ts"),
  import("../src/lib/transaction-service.ts"),
  import("../src/lib/wishlist-match.ts"),
  import("../src/lib/reminders.ts"),
  import("../src/lib/stock-service.ts"),
  import("../src/lib/kpi.ts"),
]);

const branches = await Promise.all([
  db.branch.create({ data: { name: "Yogyakarta", rolloutStage: 1 } }),
  db.branch.create({ data: { name: "Semarang", rolloutStage: 2 } }),
  db.branch.create({ data: { name: "Magelang", rolloutStage: 2 } }),
  db.branch.create({ data: { name: "Bali", rolloutStage: 3 } }),
]);
const targets = [
  ["S1", "Akun pelanggan ganda", "%", 8, 2],
  ["S2", "Cabang dengan penukaran stamp berhasil", "%", 0, 100],
  ["S3", "Pelanggan beli lebih dari sekali per bulan", "orang", 40, 50],
  ["S4", "Kepatuhan update stok harian", "%", 50, 90],
  ["S5", "Stok mati", "barang", 25, 20],
  ["S6", "Reminder tepat jadwal", "%", null, 95],
  ["S7a", "Rata-rata transaksi per pelanggan aktif per bulan", "kali", 1.6, 1.84],
  ["S7b", "Pelanggan beli dalam 7 hari setelah reminder", "%", null, 20],
];
await db.kpiTarget.createMany({
  data: targets.map(([code, label, unit, baseline, target]) => ({ code, label, unit, baseline, target })),
});

let customerSequence = 0;
async function customer(name, optedOut = false) {
  customerSequence += 1;
  return db.customer.create({
    data: {
      name,
      whatsapp: `+628123450${String(customerSequence).padStart(4, "0")}`,
      optedOut,
      registeredAtId: branches[0].id,
    },
  });
}

async function addHistory(customerId, count, ages, branchId = branches[0].id) {
  for (const age of ages.slice(0, count)) {
    const createdAt = new Date(Date.now() - age * 86400000);
    const transaction = await db.transaction.create({ data: { customerId, branchId, amount: 150000, createdAt } });
    await db.stamp.create({
      data: { customerId, transactionId: transaction.id, branchId, dayKey: jakartaDayKey(createdAt), createdAt },
    });
  }
}

test("duplicate registration is rejected and logged", async () => {
  const first = await customer("Nama Awal");
  const duplicate = await registerCustomerRecord("Nama Duplikat", first.whatsapp, branches[1].id);
  assert.equal(duplicate.duplicate, true);
  assert.equal(await db.customer.count({ where: { whatsapp: first.whatsapp } }), 1);
  assert.equal(await db.duplicateCheckLog.count({ where: { existingCustomerId: first.id } }), 1);
});

test("below-minimum and same-day purchases do not issue an extra stamp", async () => {
  const buyer = await customer("Uji Stamp Harian");
  const belowMinimum = await recordTransactionRecord({ customerId: buyer.id, branchId: branches[0].id, amount: 99999, useStampDiscount: true });
  assert.deepEqual(belowMinimum, { result: "below-minimum", discountAmount: 0 });
  assert.equal(await db.stamp.count({ where: { customerId: buyer.id } }), 0);

  const first = await recordTransactionRecord({ customerId: buyer.id, branchId: branches[0].id, amount: 100000, useStampDiscount: true });
  const second = await recordTransactionRecord({ customerId: buyer.id, branchId: branches[1].id, amount: 100000, useStampDiscount: true });
  assert.equal(first?.result, "stamp-added");
  assert.equal(second?.result, "already-stamped");
  assert.equal(await db.stamp.count({ where: { customerId: buyer.id, dayKey: jakartaDayKey() } }), 1);
});

test("three oldest stamps are discounted across all branches", async () => {
  for (const branch of branches) {
    const buyer = await customer(`Uji Diskon ${branch.name}`);
    await addHistory(buyer.id, 4, [5, 6, 7, 8]);
    const result = await recordTransactionRecord({ customerId: buyer.id, branchId: branch.id, amount: 150001, useStampDiscount: true });
    assert.deepEqual(result, { result: "stamp-added", discountAmount: 15000 });
    const redeemed = await db.stamp.count({ where: { customerId: buyer.id, redeemedAt: { not: null } } });
    const activeHistory = await db.stamp.count({ where: { customerId: buyer.id, redeemedAt: null, dayKey: { not: jakartaDayKey() } } });
    const transaction = await db.transaction.findFirst({ where: { customerId: buyer.id, createdAt: { gte: new Date(Date.now() - 60000) } }, orderBy: { createdAt: "desc" } });
    assert.equal(redeemed, 3);
    assert.equal(activeHistory, 1);
    assert.equal(transaction?.amount, 150001);
    assert.equal(transaction?.discountAmount, 15000);
    assert.ok(transaction?.redemptionId);
    assert.equal(await db.redemption.count({ where: { customerId: buyer.id, branchId: branch.id } }), 1);

    const threeStampBuyer = await customer(`Tiga Stamp ${branch.name}`);
    await addHistory(threeStampBuyer.id, 3, [5, 6, 7]);
    const threeStampResult = await recordTransactionRecord({
      customerId: threeStampBuyer.id,
      branchId: branch.id,
      amount: 125009,
      useStampDiscount: true,
    });
    assert.deepEqual(threeStampResult, { result: "stamp-added", discountAmount: 12500 });
    assert.equal(await db.stamp.count({ where: { customerId: threeStampBuyer.id, redeemedAt: { not: null } } }), 3);
    assert.equal(await db.redemption.count({ where: { customerId: threeStampBuyer.id, branchId: branch.id } }), 1);
  }
});

test("unchecked stamp discount leaves stamps intact", async () => {
  const buyer = await customer("Uji Tanpa Diskon");
  await addHistory(buyer.id, 3, [5, 6, 7]);
  const result = await recordTransactionRecord({ customerId: buyer.id, branchId: branches[0].id, amount: 200000, useStampDiscount: false });
  assert.deepEqual(result, { result: "stamp-added", discountAmount: 0 });
  assert.equal(await db.redemption.count({ where: { customerId: buyer.id } }), 0);
  assert.equal(await db.stamp.count({ where: { customerId: buyer.id, redeemedAt: null } }), 4);
});

test("wishlist created after matching stock creates one notification, including after edits", async () => {
  const buyer = await customer("Uji Wishlist");
  const item = await db.stockItem.create({ data: { name: "Kemeja Linen", category: "Atasan", size: "M", branchId: branches[0].id } });
  await db.$transaction(async (tx) => {
    const wishlist = await tx.wishlist.create({ data: { customerId: buyer.id, category: "Atasan", size: "M", keyword: "linen" } });
    await matchWishlist(tx, wishlist);
  });
  assert.equal(await db.stockMatchNotification.count({ where: { customerId: buyer.id, stockItemId: item.id } }), 1);
  await db.$transaction(async (tx) => {
    const edited = await tx.stockItem.update({ where: { id: item.id }, data: { category: "Dress", size: "S" } });
    await matchStockItem(tx, edited);
    const restored = await tx.stockItem.update({ where: { id: item.id }, data: { category: "Atasan", size: "M" } });
    await matchStockItem(tx, restored);
  });
  assert.equal(await db.stockMatchNotification.count({ where: { customerId: buyer.id, stockItemId: item.id } }), 1);
});

test("scheduled reminders honor opt-out, cooldown, and personalized due windows", async () => {
  const template = await db.reminderTemplate.create({ data: { name: "Umum uji", segment: "ALL", message: "Hai {nama}, kabar baru." } });
  const eligible = await customer("Ayu Uji Reminder");
  const optedOut = await customer("Opt Out Uji", true);
  const recent = await customer("Cooldown Uji");
  const priorTemplate = await db.reminderTemplate.create({ data: { name: "Riwayat", segment: "ALL", message: "Riwayat" } });
  await db.reminderLog.create({ data: { customerId: recent.id, templateId: priorTemplate.id, body: "terkirim", sentAt: new Date(Date.now() - 86400000) } });
  const sent = await processDueReminders(template.id);
  assert.ok(sent >= 1);
  const sentLog = await db.reminderLog.findFirst({ where: { customerId: eligible.id, templateId: template.id } });
  assert.equal(sentLog?.body, "Hai Ayu, kabar baru.");
  assert.equal(await db.reminderLog.count({ where: { customerId: optedOut.id, templateId: template.id } }), 0);
  assert.equal(await db.reminderLog.count({ where: { customerId: recent.id, templateId: template.id } }), 0);

  const personal = await db.reminderTemplate.create({ data: { name: "Personal uji", segment: "PERSONAL", message: "Hai {nama}." } });
  const due = await customer("Personal Tepat Waktu");
  const outside = await customer("Personal Di Luar Jendela");
  await addHistory(due.id, 3, [24, 16, 8]);
  await addHistory(outside.id, 3, [40, 30, 20]);
  await processDueReminders(personal.id);
  const dueLog = await db.reminderLog.findFirst({ where: { customerId: due.id, templateId: personal.id } });
  assert.ok(dueLog);
  assert.equal(dueLog.body, "Hai Personal.");
  assert.equal(await db.reminderLog.count({ where: { customerId: outside.id, templateId: personal.id } }), 0);
});

test("daily stock confirmation is recorded and KPI returns eight target rows", async () => {
  const confirmedBranch = branches[2];
  const log = await confirmStockTodayRecord(confirmedBranch.id);
  assert.equal(log.type, "CONFIRM");
  const sameDayLogs = await db.stockUpdateLog.findMany({ where: { branchId: confirmedBranch.id } });
  assert.ok(sameDayLogs.some((row) => jakartaDayKey(row.updatedAt) === jakartaDayKey()));
  const kpis = await getKpis();
  assert.deepEqual(kpis.map(({ code }) => code), ["S1", "S2", "S3", "S4", "S5", "S6", "S7a", "S7b"]);
  assert.ok(kpis.every(({ status }) => ["Tercapai", "Berjalan", "Belum"].includes(status)));
});

after(async () => {
  await db.$disconnect();
  const databasePath = path.join(root, "prisma", "prisma", "regression-test.db");
  for (const file of [databasePath, `${databasePath}-journal`]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
});
