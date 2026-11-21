import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { askHidden } from "../scripts/hidden-input.mjs";

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
const [{ db }, { jakartaDayKey, STAMP_MINIMUM_TRANSACTION, REDEMPTION_DISCOUNT_PERCENT, MESSAGE_CONSENT_POLICY_VERSION, MESSAGE_CONSENT_TEXT, ACQUISITION_CHANNELS, SEGMENTS }, { hashPassword, verifyPassword, generateCustomerLoginCode, hashCustomerLoginCode, verifyCustomerLoginCode }, { authenticateStaffRecord }, { describeMessageStatus, SIMULATED_SENT_STATUS }, { registerCustomerRecord, setCustomerMarketingConsent, recordCashierConsentRecord }, { recordTransactionRecord, voidTransactionRecord }, { matchStockItem, matchWishlist }, { processDueReminders, personalSchedule }, { confirmStockTodayRecord }, { getKpis }, { getCustomerSegment }, { featureEnabled, reminderEnabled, setBranchRolloutStageRecord }, { FOLLOWUP_QUEUES, getFollowUpQueues, markFollowedUpRecord }, { getDashboardSummary }, { followUpMessage }, { visibleMessageTabs, resolveMessageTab }] = await Promise.all([
  import("../src/lib/db.ts"),
  import("../src/lib/business-rules.ts"),
  import("../src/lib/password.ts"),
  import("../src/lib/staff-auth-service.ts"),
  import("../src/lib/message-status.ts"),
  import("../src/lib/customer-service.ts"),
  import("../src/lib/transaction-service.ts"),
  import("../src/lib/wishlist-match.ts"),
  import("../src/lib/reminders.ts"),
  import("../src/lib/stock-service.ts"),
  import("../src/lib/kpi.ts"),
  import("../src/lib/segment-service.ts"),
  import("../src/lib/rollout.ts"),
  import("../src/lib/followup-service.ts"),
  import("../src/lib/dashboard-service.ts"),
  import("../src/lib/followup-messages.ts"),
  import("../src/lib/message-tabs.ts"),
]);
process.env.ROLLOUT_GATING = "off";

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

test("staff passwords and customer login codes are not stored as plaintext", async () => {
  const password = "thrift-test-password-2026";
  const passwordHash = await hashPassword(password);
  assert.notEqual(passwordHash, password);
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword(`${password}x`, passwordHash), false);
  await assert.rejects(() => hashPassword("short"), /between 12 and 200/);

  const code = generateCustomerLoginCode();
  assert.match(code, /^\d{6}$/);
  const codeHash = await hashCustomerLoginCode(code);
  assert.notEqual(codeHash, code);
  assert.equal(await verifyCustomerLoginCode(code, codeHash), true);
  assert.equal(await verifyCustomerLoginCode("000000", codeHash), false);
});

test("customer edit navigation and primary action UI use detail anchors", async () => {
  const customerPage = fs.readFileSync(path.join(root, "src/app/(admin)/pelanggan/page.tsx"), "utf8");
  const detailPage = fs.readFileSync(path.join(root, "src/app/(admin)/pelanggan/[id]/page.tsx"), "utf8");
  const kasirPage = fs.readFileSync(path.join(root, "src/app/(admin)/kasir/page.tsx"), "utf8");
  assert.equal(customerPage.includes("?edit="), false);
  assert.equal(customerPage.includes("/pelanggan/${encodeURIComponent(customer.id)}#profil"), true);
  assert.equal(detailPage.includes('id="profil"'), true);
  assert.equal(kasirPage.includes("Pelanggan dengan transaksi terbanyak"), true);
  assert.equal(kasirPage.includes("registeredAtId"), true);
});

test("message status is unified and always labeled as simulation", async () => {
  assert.deepEqual(describeMessageStatus(SIMULATED_SENT_STATUS), {
    isSimulated: true,
    label: "Terkirim (simulasi)",
  });
  assert.deepEqual(describeMessageStatus("SENT"), {
    isSimulated: false,
    label: "Status tidak dikenal (simulasi): SENT",
  });
});

test("message tabs hide reminders from cashier and stock staff without redirecting", async () => {
  for (const role of ["CASHIER", "STOCK_STAFF"]) {
    const tabs = visibleMessageTabs(role);
    assert.deepEqual(tabs.map(({ id }) => id), ["antrean", "notifikasi", "log"]);
    assert.equal(resolveMessageTab(role, "reminder"), "antrean");
    assert.equal(resolveMessageTab(role, "notifikasi"), "notifikasi");
  }
  assert.equal(visibleMessageTabs("MARKETING").some(({ id }) => id === "reminder"), true);
  assert.equal(resolveMessageTab("MANAGER", "reminder"), "reminder");
});

test("follow-up message templates use the first name and current redemption discount", async () => {
  assert.equal(followUpMessage("JATUH_TEMPO", "Dinda Putri"), "Halo Dinda, sudah waktunya cek koleksi baru Lestari Thrift. Ada stok baru yang mungkin cocok untukmu.");
  assert.equal(followUpMessage("SATU_STAMP", "Dinda Putri"), `Halo Dinda, tinggal 1 stamp lagi untuk dapat diskon ${REDEMPTION_DISCOUNT_PERCENT}% di semua cabang Lestari Thrift.`);
  assert.equal(followUpMessage("TIDAK_AKTIF", "Dinda Putri"), "Halo Dinda, kami kangen! Ada koleksi baru di Lestari Thrift yang mungkin kamu suka.");
  assert.equal(followUpMessage("WISHLIST_BELUM", "Dinda Putri"), "Halo Dinda, ada barang yang cocok dengan wishlist kamu di Lestari Thrift.");
});

test("user provisioning refuses non-interactive execution without creating an account", async () => {
  const before = await db.user.count();
  const result = spawnSync(process.execPath, [
    "--disable-warning=ExperimentalWarning",
    "--experimental-strip-types",
    "--experimental-loader",
    "./tests/ts-loader.mjs",
    "scripts/create-user.mjs",
  ], {
    cwd: root,
    env,
    input: "",
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive terminal/);
  assert.equal(await db.user.count(), before);
});

test("hidden password input ignores a split CRLF between prompts", async () => {
  class TestInput extends EventEmitter {
    isRaw = false;

    setRawMode(value) {
      this.isRaw = value;
    }

    resume() {}

    pause() {}

    send(value) {
      this.emit("data", Buffer.from(value));
    }
  }

  const input = new TestInput();
  const output = { write() {} };
  const passwordPromise = askHidden("Password: ", input, output);
  input.send("correct-horse-battery\r");
  assert.equal(await passwordPromise, "correct-horse-battery");

  const confirmationPromise = askHidden("Ulangi password: ", input, output);
  input.send("\n");
  input.send("correct-horse-battery\r");
  assert.equal(await confirmationPromise, "correct-horse-battery");
  assert.equal(input.isRaw, false);
});

test("staff login blocks attempts by email and IP, then allows login after the window", async () => {
  const firstPassword = "staff-login-first-test";
  const secondPassword = "staff-login-second-test";
  const [first, second] = await Promise.all([
    db.user.create({
      data: {
        name: "Uji Login Pertama",
        email: "login-first@example.test",
        role: "CASHIER",
        branchId: branches[0].id,
        passwordHash: await hashPassword(firstPassword),
      },
    }),
    db.user.create({
      data: {
        name: "Uji Login Kedua",
        email: "login-second@example.test",
        role: "CASHIER",
        branchId: branches[0].id,
        passwordHash: await hashPassword(secondPassword),
      },
    }),
  ]);
  const sharedIp = "198.51.100.27";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(
      await authenticateStaffRecord({ email: first.email, password: "wrong-password", clientIp: sharedIp }),
      null,
    );
  }
  assert.equal(await db.loginAttempt.count(), 5);
  assert.equal(
    await authenticateStaffRecord({ email: first.email, password: firstPassword, clientIp: sharedIp }),
    null,
  );
  assert.equal(
    await authenticateStaffRecord({ email: first.email, password: firstPassword, clientIp: "198.51.100.28" }),
    null,
  );
  assert.equal(
    await authenticateStaffRecord({ email: second.email, password: secondPassword, clientIp: sharedIp }),
    null,
  );

  await db.loginAttempt.updateMany({
    data: { createdAt: new Date(Date.now() - 16 * 60_000) },
  });
  const authenticated = await authenticateStaffRecord({
    email: first.email,
    password: firstPassword,
    clientIp: "198.51.100.28",
  });
  assert.equal(authenticated?.id, first.id);
  assert.equal(await db.loginAttempt.count(), 0);
  assert.equal(
    (await authenticateStaffRecord({ email: second.email, password: secondPassword, clientIp: sharedIp }))?.id,
    second.id,
  );
});

await db.kpiTarget.createMany({
  data: targets.map(([code, label, unit, baseline, target]) => ({ code, label, unit, baseline, target })),
});

let customerSequence = 0;
async function customer(name, optedOut = false, marketingConsent = true) {
  customerSequence += 1;
  return db.customer.create({
    data: {
      name,
      whatsapp: `+628123450${String(customerSequence).padStart(4, "0")}`,
      optedOut,
      marketingConsent,
      registeredAtId: branches[0].id,
    },
  });
}

async function addHistory(customerId, count, ages, branchId = branches[0].id) {
  for (const age of ages.slice(0, count)) {
    const createdAt = new Date(Date.now() - age * 86400000);
    const transaction = await db.transaction.create({ data: { customerId, branchId, amount: STAMP_MINIMUM_TRANSACTION, createdAt } });
    await db.stamp.create({
      data: {
        customerId,
        transactionId: transaction.id,
        branchId,
        dayKey: jakartaDayKey(createdAt),
        activeDayKey: jakartaDayKey(createdAt),
        createdAt,
      },
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

test("archived customers keep history but cannot transact or receive simulated messages", async () => {
  const buyer = await customer("Pelanggan Diarsipkan");
  await addHistory(buyer.id, 3, [24, 16, 8]);
  const item = await db.stockItem.create({
    data: { name: "Kemeja Arsip", category: "Atasan", size: "M", branchId: branches[0].id },
  });
  const wishlist = await db.wishlist.create({
    data: { customerId: buyer.id, category: "Atasan", size: "M" },
  });
  const template = await db.reminderTemplate.create({
    data: { name: "Reminder Arsip", segment: "PERSONAL", message: "Hai {nama}." },
  });
  await db.customer.update({ where: { id: buyer.id }, data: { active: false } });

  const transaction = await recordTransactionRecord({
    customerId: buyer.id,
    branchId: branches[0].id,
    amount: STAMP_MINIMUM_TRANSACTION,
    useStampDiscount: false,
  });
  assert.equal(transaction, null);
  assert.equal(await db.$transaction((tx) => matchWishlist(tx, wishlist)), 0);
  assert.equal(await db.$transaction((tx) => matchStockItem(tx, item)), 0);
  await processDueReminders(template.id);

  assert.equal(await db.transaction.count({ where: { customerId: buyer.id } }), 3);
  assert.equal(await db.stamp.count({ where: { customerId: buyer.id } }), 3);
  assert.equal(await db.reminderLog.count({ where: { customerId: buyer.id } }), 0);
  assert.equal(await db.stockMatchNotification.count({ where: { customerId: buyer.id } }), 0);
});

test("customer messaging consent is explicitly recorded at registration", async () => {
  const consented = await registerCustomerRecord("Setuju Pesan", "+628123459001", branches[0].id, true);
  const declined = await registerCustomerRecord("Belum Setuju", "+628123459002", branches[0].id, false);
  assert.equal(consented.duplicate, false);
  assert.equal(consented.customer.marketingConsent, true);
  assert.equal(consented.customer.optedOut, false);
  assert.equal(declined.duplicate, false);
  assert.equal(declined.customer.marketingConsent, false);
  assert.equal(declined.customer.optedOut, false);
  const consentLog = await db.messageConsent.findFirst({ where: { customerId: consented.customer.id } });
  const declineLog = await db.messageConsent.findFirst({ where: { customerId: declined.customer.id } });
  assert.equal(consentLog?.status, "GRANTED");
  assert.equal(consentLog?.source, "CASHIER_REGISTRATION");
  assert.equal(consentLog?.policyVersion, MESSAGE_CONSENT_POLICY_VERSION);
  assert.ok(consentLog?.consentText);
  assert.equal(declineLog?.status, "DECLINED");
});

test("customer acquisition channel is persisted and invalid channels are rejected", async () => {
  assert.ok(Object.hasOwn(ACQUISITION_CHANNELS, "INSTAGRAM"));
  const registered = await registerCustomerRecord("Kanal Instagram", "+628123459101", branches[0].id, false, null, "INSTAGRAM");
  assert.equal(registered.duplicate, false);
  assert.equal(registered.customer.acquisitionChannel, "INSTAGRAM");
  const direct = await registerCustomerRecord("Kanal Langsung", "+628123459102", branches[0].id);
  assert.equal(direct.duplicate, false);
  assert.equal(direct.customer.acquisitionChannel, "DATANG_LANGSUNG");
  await assert.rejects(
    () => registerCustomerRecord("Kanal Tidak Valid", "+628123459103", branches[0].id, false, null, "UNKNOWN"),
    /Invalid customer acquisition channel/,
  );
  assert.equal(await db.customer.count({ where: { whatsapp: "+628123459103" } }), 0);
});

test("customer segment priority is routine, collector, then new or seasonal", async () => {
  const now = new Date("2026-11-18T10:00:00+07:00");
  assert.equal(getCustomerSegment({
    transactionDates: [1, 10, 20].map((days) => new Date(now.getTime() - days * 86400000)),
    activeWishlistCount: 1,
    now,
  }), SEGMENTS.RUTIN);
  assert.equal(getCustomerSegment({ transactionDates: [], activeWishlistCount: 1, now }), SEGMENTS.KOLEKTOR);
  assert.equal(getCustomerSegment({ transactionDates: [100].map((days) => new Date(now.getTime() - days * 86400000)), activeWishlistCount: 0, now }), SEGMENTS.BARU_MUSIMAN);
});

test("reminder target segment limits simulated recipients", async () => {
  const collector = await customer("Segmen Kolektor");
  await db.wishlist.create({ data: { customerId: collector.id, category: "Dress" } });
  const routine = await customer("Segmen Rutin");
  await addHistory(routine.id, 3, [20, 10, 2]);
  const template = await db.reminderTemplate.create({
    data: { name: "Hanya kolektor", segment: "ALL", targetSegment: SEGMENTS.KOLEKTOR, message: "Hai {nama}." },
  });
  await processDueReminders(template.id);
  assert.equal(await db.reminderLog.count({ where: { customerId: collector.id, templateId: template.id } }), 1);
  assert.equal(await db.reminderLog.count({ where: { customerId: routine.id, templateId: template.id } }), 0);
});

test("personal reminder schedule is 09:00 Jakarta and not due before that time", async () => {
  const now = new Date("2026-11-20T12:00:00+07:00");
  const dates = ["2026-11-01T09:00:00+07:00", "2026-11-08T09:00:00+07:00", "2026-11-15T09:00:00+07:00"]
    .map((createdAt) => ({ createdAt: new Date(createdAt) }));
  assert.equal(personalSchedule(dates, new Date("2026-11-20T08:59:00+07:00")), null);
  assert.equal(personalSchedule(dates, now)?.toISOString(), "2026-11-20T02:00:00.000Z");
});

test("customer creation and consent changes create minimal audit entries", async () => {
  const actor = await db.user.create({
    data: { name: "Owner Audit Uji", email: "owner-audit@example.test", role: "OWNER" },
  });
  const phone = "+628123459003";
  const result = await registerCustomerRecord("Nama Rahasia Uji Audit", phone, branches[0].id, true, actor.id);
  assert.equal(result.duplicate, false);
  const customerId = result.customer.id;
  const creationLogs = await db.auditLog.findMany({ where: { entityId: customerId, action: "CUSTOMER_CREATED" } });
  assert.equal(creationLogs.length, 1);
  assert.equal(creationLogs[0].userId, actor.id);
  assert.equal(creationLogs[0].summary.includes(phone), false);
  assert.equal(creationLogs[0].summary.includes("Nama Rahasia Uji Audit"), false);
  assert.equal(await db.auditLog.count({ where: { entityId: customerId, action: "CUSTOMER_CONSENT_GRANTED" } }), 1);

  await db.$transaction((tx) => setCustomerMarketingConsent(tx, customerId, false, "CUSTOMER_PORTAL"));
  const consentLogs = await db.auditLog.findMany({ where: { entityId: customerId, action: "CUSTOMER_CONSENT_REVOKED" } });
  assert.equal(consentLogs.length, 1);
  assert.equal(consentLogs[0].userId, null);
});

test("cashier consent requires the exact consent text and audits a granted record", async () => {
  const staff = await db.user.create({ data: { name: "Kasir Consent Uji", role: "CASHIER", branchId: branches[0].id } });
  const buyer = await customer("Persetujuan Dicatat Kasir", false, false);
  assert.equal(await recordCashierConsentRecord({
    customerId: buyer.id, userId: staff.id, checked: false, consentText: MESSAGE_CONSENT_TEXT,
  }), null);
  assert.equal(await recordCashierConsentRecord({
    customerId: buyer.id, userId: staff.id, checked: true, consentText: "Teks lain",
  }), null);
  const updated = await recordCashierConsentRecord({
    customerId: buyer.id, userId: staff.id, checked: true, consentText: MESSAGE_CONSENT_TEXT,
  });
  assert.equal(updated?.marketingConsent, true);
  const consent = await db.messageConsent.findFirst({ where: { customerId: buyer.id, source: "CASHIER" } });
  const audit = await db.auditLog.findFirst({ where: { entityId: buyer.id, action: "CUSTOMER_CONSENT_GRANTED" } });
  assert.equal(consent?.consentText, MESSAGE_CONSENT_TEXT);
  assert.equal(audit?.userId, staff.id);
});

test("revoked message consent is audited and disables future messaging", async () => {
  const buyer = await customer("Persetujuan Dicabut");
  await db.$transaction((tx) => setCustomerMarketingConsent(tx, buyer.id, false, "CUSTOMER_PORTAL"));
  const updated = await db.customer.findUnique({ where: { id: buyer.id } });
  const revokeLog = await db.messageConsent.findFirst({ where: { customerId: buyer.id }, orderBy: { createdAt: "desc" } });
  assert.equal(updated?.marketingConsent, false);
  assert.equal(updated?.optedOut, true);
  assert.equal(revokeLog?.status, "REVOKED");
  assert.equal(revokeLog?.source, "CUSTOMER_PORTAL");

  const item = await db.stockItem.create({ data: { name: "Rok Plisket", category: "Bawahan", size: "M", branchId: branches[0].id } });
  const wishlist = await db.wishlist.create({ data: { customerId: buyer.id, category: "Bawahan", size: "M" } });
  assert.equal(await db.$transaction((tx) => matchWishlist(tx, wishlist)), 0);
  assert.equal(await db.$transaction((tx) => matchStockItem(tx, item)), 0);
});

test("below-minimum and same-day purchases do not issue an extra stamp", async () => {
  const buyer = await customer("Uji Stamp Harian");
  const belowMinimum = await recordTransactionRecord({ customerId: buyer.id, branchId: branches[0].id, amount: STAMP_MINIMUM_TRANSACTION - 1, useStampDiscount: true });
  assert.deepEqual(belowMinimum, { result: "below-minimum", discountAmount: 0 });
  assert.equal(await db.stamp.count({ where: { customerId: buyer.id } }), 0);

  const first = await recordTransactionRecord({ customerId: buyer.id, branchId: branches[0].id, amount: STAMP_MINIMUM_TRANSACTION, useStampDiscount: true });
  const second = await recordTransactionRecord({ customerId: buyer.id, branchId: branches[1].id, amount: STAMP_MINIMUM_TRANSACTION, useStampDiscount: true });
  assert.equal(first?.result, "stamp-added");
  assert.equal(second?.result, "already-stamped");
  assert.equal(await db.stamp.count({ where: { customerId: buyer.id, dayKey: jakartaDayKey() } }), 1);
});

test("transaction records whether the cashier offered a stamp", async () => {
  const buyer = await customer("Tawaran Stamp Dicatat");
  const result = await recordTransactionRecord({
    customerId: buyer.id,
    branchId: branches[0].id,
    amount: STAMP_MINIMUM_TRANSACTION,
    useStampDiscount: false,
    stampOffered: false,
  });
  assert.equal(result?.result, "stamp-added");
  const transaction = await db.transaction.findFirst({ where: { customerId: buyer.id }, orderBy: { createdAt: "desc" } });
  assert.equal(transaction?.stampOffered, false);
});

test("three oldest stamps are discounted across all branches", async () => {
  for (const branch of branches) {
    const buyer = await customer(`Uji Diskon ${branch.name}`);
    await addHistory(buyer.id, 4, [5, 6, 7, 8]);
    const result = await recordTransactionRecord({ customerId: buyer.id, branchId: branch.id, amount: 200001, useStampDiscount: true });
    assert.deepEqual(result, { result: "stamp-added", discountAmount: 20000 });
    const redeemed = await db.stamp.count({ where: { customerId: buyer.id, redeemedAt: { not: null } } });
    const activeHistory = await db.stamp.count({ where: { customerId: buyer.id, redeemedAt: null, dayKey: { not: jakartaDayKey() } } });
    const transaction = await db.transaction.findFirst({ where: { customerId: buyer.id, createdAt: { gte: new Date(Date.now() - 60000) } }, orderBy: { createdAt: "desc" } });
    assert.equal(redeemed, 3);
    assert.equal(activeHistory, 1);
    assert.equal(transaction?.amount, 200001);
    assert.equal(transaction?.discountAmount, 20000);
    assert.ok(transaction?.redemptionId);
    assert.equal(await db.redemption.count({ where: { customerId: buyer.id, branchId: branch.id } }), 1);

    const threeStampBuyer = await customer(`Tiga Stamp ${branch.name}`);
    await addHistory(threeStampBuyer.id, 3, [5, 6, 7]);
    const threeStampResult = await recordTransactionRecord({
      customerId: threeStampBuyer.id,
      branchId: branch.id,
      amount: 200009,
      useStampDiscount: true,
    });
    assert.deepEqual(threeStampResult, { result: "stamp-added", discountAmount: 20000 });
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

test("voiding a redeemed transaction preserves history, restores stamps, and permits a corrected same-day stamp", async () => {
  const owner = await db.user.create({
    data: { name: "Owner Void Uji", email: "owner-void@example.test", role: "OWNER" },
  });
  const buyer = await customer("Uji Void Penukaran");
  await addHistory(buyer.id, 3, [4, 3, 2]);
  const outcome = await recordTransactionRecord({
    customerId: buyer.id,
    branchId: branches[0].id,
    amount: STAMP_MINIMUM_TRANSACTION,
    useStampDiscount: true,
  });
  assert.equal(outcome?.result, "stamp-added");
  const transaction = await db.transaction.findFirst({
    where: { customerId: buyer.id, createdAt: { gte: new Date(Date.now() - 10_000) } },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(transaction?.redemptionId);
  const links = await db.redemptionStamp.findMany({
    where: { redemptionId: transaction.redemptionId },
    select: { stampId: true },
  });
  assert.equal(links.length, 3);

  assert.equal(
    await voidTransactionRecord({
      transactionId: transaction.id,
      userId: owner.id,
      reason: "Nominal salah input",
    }),
    "voided",
  );
  const preserved = await db.transaction.findUnique({
    where: { id: transaction.id },
    include: { voidRecord: true, redemption: true },
  });
  assert.equal(preserved?.amount, STAMP_MINIMUM_TRANSACTION);
  assert.equal(preserved?.voidRecord?.reason, "Nominal salah input");
  assert.ok(preserved?.voidRecord?.voidedAt);
  assert.ok(preserved?.redemption?.voidedAt);
  const restored = await db.stamp.findMany({ where: { id: { in: links.map(({ stampId }) => stampId) } } });
  assert.ok(restored.every(({ redeemedAt, voidedAt }) => redeemedAt === null && voidedAt === null));
  const cancelledStamp = await db.stamp.findUnique({ where: { transactionId: transaction.id } });
  assert.ok(cancelledStamp?.voidedAt);
  assert.equal(cancelledStamp?.activeDayKey, null);
  assert.equal(await db.transaction.count({ where: { id: transaction.id } }), 1);
  assert.equal(await db.redemptionStamp.count({ where: { redemptionId: transaction.redemptionId } }), 3);
  assert.equal(await db.auditLog.count({ where: { entityId: transaction.id, action: "TRANSACTION_VOIDED" } }), 1);

  const corrected = await recordTransactionRecord({
    customerId: buyer.id,
    branchId: branches[1].id,
    amount: STAMP_MINIMUM_TRANSACTION,
    useStampDiscount: false,
  });
  assert.equal(corrected?.result, "stamp-added");

  const start30 = new Date(Date.now() - 30 * 86400000);
  const [activeTransactions, activeCustomers] = await Promise.all([
    db.transaction.count({ where: { createdAt: { gte: start30 }, voidRecord: null } }),
    db.transaction.groupBy({
      by: ["customerId"],
      where: { createdAt: { gte: start30 }, voidRecord: null },
    }),
  ]);
  const frequency = (await getKpis()).find(({ code }) => code === "S7a");
  assert.equal(frequency?.value, activeCustomers.length ? activeTransactions / activeCustomers.length : 0);
});

test("void rejects a stamp already redeemed and a transaction outside the same Jakarta day", async () => {
  const owner = await db.user.create({
    data: { name: "Owner Void Batas", email: "owner-void-window@example.test", role: "OWNER" },
  });
  const redeemedBuyer = await customer("Uji Stamp Terpakai");
  await addHistory(redeemedBuyer.id, 3, [0, 5, 4]);
  const earnedToday = await db.stamp.findUnique({
    where: { customerId_activeDayKey: { customerId: redeemedBuyer.id, activeDayKey: jakartaDayKey() } },
  });
  assert.ok(earnedToday);
  await recordTransactionRecord({
    customerId: redeemedBuyer.id,
    branchId: branches[0].id,
    amount: STAMP_MINIMUM_TRANSACTION,
    useStampDiscount: true,
  });
  assert.equal(
    await voidTransactionRecord({
      transactionId: earnedToday.transactionId,
      userId: owner.id,
      reason: "Uji stamp sudah ditukar",
    }),
    "stamp-already-redeemed",
  );
  assert.equal(await db.transactionVoid.count({ where: { transactionId: earnedToday.transactionId } }), 0);

  const expiredBuyer = await customer("Uji Batas Hari Void");
  const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const expired = await db.transaction.create({
    data: { customerId: expiredBuyer.id, branchId: branches[0].id, amount: STAMP_MINIMUM_TRANSACTION, createdAt: yesterday },
  });
  assert.equal(
    await voidTransactionRecord({
      transactionId: expired.id,
      userId: owner.id,
      reason: "Koreksi terlambat",
    }),
    "outside-window",
  );
  assert.equal(await db.transactionVoid.count({ where: { transactionId: expired.id } }), 0);
});

test("void refuses a redemption whose stamp history cannot be verified", async () => {
  const owner = await db.user.create({
    data: { name: "Owner Riwayat Void", email: "owner-void-history@example.test", role: "OWNER" },
  });
  const buyer = await customer("Uji Riwayat Penukaran Tidak Lengkap");
  const now = new Date();
  const redemption = await db.redemption.create({
    data: { customerId: buyer.id, branchId: branches[0].id, createdAt: now },
  });
  const transaction = await db.transaction.create({
    data: {
      customerId: buyer.id,
      branchId: branches[0].id,
      amount: STAMP_MINIMUM_TRANSACTION,
      redemptionId: redemption.id,
      createdAt: now,
    },
  });
  assert.equal(
    await voidTransactionRecord({
      transactionId: transaction.id,
      userId: owner.id,
      reason: "Riwayat penukaran tidak lengkap",
    }),
    "redemption-history-incomplete",
  );
  assert.equal(await db.transactionVoid.count({ where: { transactionId: transaction.id } }), 0);
});

test("voided transactions do not count toward personal reminder history", async () => {
  const owner = await db.user.create({
    data: { name: "Owner Void Reminder", email: "owner-void-reminder@example.test", role: "OWNER" },
  });
  const buyer = await customer("Uji Reminder Setelah Void");
  const referenceDate = new Date(Date.now() + 365 * 86400000);
  const dates = [16, 8, 0].map((age) => new Date(referenceDate.getTime() - age * 86400000));
  const transactions = await Promise.all(
    dates.map((createdAt) =>
      db.transaction.create({
        data: { customerId: buyer.id, branchId: branches[0].id, amount: STAMP_MINIMUM_TRANSACTION, createdAt },
      }),
    ),
  );
  const todayTransaction = transactions[2];
  assert.equal(
    await voidTransactionRecord({
      transactionId: todayTransaction.id,
      userId: owner.id,
      reason: "Transaksi uji dibatalkan",
      now: referenceDate,
    }),
    "voided",
  );
  const template = await db.reminderTemplate.create({
    data: { name: "Reminder personal setelah void", segment: "PERSONAL", message: "Hai {nama}." },
  });
  const reminderDate = new Date(referenceDate.getTime() + 6 * 86400000);
  await processDueReminders(template.id, reminderDate);
  assert.equal(await db.reminderLog.count({ where: { customerId: buyer.id, templateId: template.id } }), 0);
});

test("wishlist created after matching stock creates one notification, including after edits", async () => {
  await db.stockNotificationTemplate.create({
    data: { id: "wishlist", message: "Hai {nama}, {barang} ukuran {ukuran} di {cabang}." },
  });
  const buyer = await customer("Uji Wishlist");
  const item = await db.stockItem.create({ data: { name: "Kemeja Linen", category: "Atasan", size: "M", branchId: branches[0].id } });
  await db.$transaction(async (tx) => {
    const wishlist = await tx.wishlist.create({ data: { customerId: buyer.id, category: "Atasan", size: "M", keyword: "linen" } });
    await matchWishlist(tx, wishlist);
  });
  const originalNotification = await db.stockMatchNotification.findUnique({
    where: { stockItemId_customerId: { stockItemId: item.id, customerId: buyer.id } },
  });
  assert.equal(originalNotification?.body, "Hai Uji, Kemeja Linen ukuran M di Yogyakarta.");
  assert.equal(originalNotification?.status, "SIMULATED_SENT");
  await db.$transaction(async (tx) => {
    const edited = await tx.stockItem.update({ where: { id: item.id }, data: { category: "Dress", size: "S" } });
    await matchStockItem(tx, edited);
    const restored = await tx.stockItem.update({ where: { id: item.id }, data: { category: "Atasan", size: "M" } });
    await matchStockItem(tx, restored);
  });
  assert.equal(await db.stockMatchNotification.count({ where: { customerId: buyer.id, stockItemId: item.id } }), 1);

  await db.stockNotificationTemplate.update({
    where: { id: "wishlist" },
    data: { message: "{nama}, update: {barang} {ukuran} @ {cabang}." },
  });
  const nextBuyer = await customer("Budi Baru");
  const nextItem = await db.stockItem.create({ data: { name: "Rok Plisket", category: "Bawahan", size: "L", branchId: branches[0].id } });
  const nextWishlist = await db.wishlist.create({ data: { customerId: nextBuyer.id, category: "Bawahan", size: "L" } });
  await db.$transaction((tx) => matchWishlist(tx, nextWishlist));
  const nextNotification = await db.stockMatchNotification.findUnique({
    where: { stockItemId_customerId: { stockItemId: nextItem.id, customerId: nextBuyer.id } },
  });
  const preservedNotification = await db.stockMatchNotification.findUnique({
    where: { stockItemId_customerId: { stockItemId: item.id, customerId: buyer.id } },
  });
  assert.equal(nextNotification?.body, "Budi, update: Rok Plisket L @ Yogyakarta.");
  assert.equal(preservedNotification?.body, "Hai Uji, Kemeja Linen ukuran M di Yogyakarta.");
});

test("wishlist notifications require consent and share the seven-day messaging cooldown", async () => {
  const itemOne = await db.stockItem.create({ data: { name: "Jaket Denim", category: "Outer", size: "L", branchId: branches[0].id } });
  const itemTwo = await db.stockItem.create({ data: { name: "Jaket Canvas", category: "Outer", size: "L", branchId: branches[1].id } });
  const consented = await customer("Consent Wishlist");
  const wishlist = await db.wishlist.create({ data: { customerId: consented.id, category: "Outer", size: "L" } });
  assert.equal(await db.$transaction((tx) => matchWishlist(tx, wishlist)), 1);
  assert.equal(await db.$transaction((tx) => matchStockItem(tx, itemTwo)), 0);
  assert.equal(await db.stockMatchNotification.count({ where: { customerId: consented.id } }), 1);

  const noConsent = await customer("Tanpa Consent Wishlist", false, false);
  const noConsentWishlist = await db.wishlist.create({ data: { customerId: noConsent.id, category: "Outer", size: "L" } });
  assert.equal(await db.$transaction((tx) => matchWishlist(tx, noConsentWishlist)), 0);
  assert.equal(await db.$transaction((tx) => matchStockItem(tx, itemOne)), 0);
  assert.equal(await db.stockMatchNotification.count({ where: { customerId: noConsent.id } }), 0);

  const recentReminder = await customer("Reminder Baru");
  const template = await db.reminderTemplate.create({ data: { name: "Wishlist cooldown", segment: "ALL", message: "Reminder" } });
  await db.reminderLog.create({ data: { customerId: recentReminder.id, templateId: template.id } });
  const recentWishlist = await db.wishlist.create({ data: { customerId: recentReminder.id, category: "Outer", size: "L" } });
  assert.equal(await db.$transaction((tx) => matchWishlist(tx, recentWishlist)), 0);
});

test("reminder punctuality KPI counts early and late sends symmetrically", async () => {
  await db.reminderLog.deleteMany();
  const template = await db.reminderTemplate.create({ data: { name: "Jadwal KPI", segment: "ALL", message: "Reminder" } });
  const early = await customer("Reminder Terlalu Awal");
  const withinWindow = await customer("Reminder Dalam Toleransi");
  const now = new Date();
  await db.reminderLog.create({
    data: {
      customerId: early.id,
      templateId: template.id,
      scheduledFor: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      sentAt: now,
    },
  });
  await db.reminderLog.create({
    data: {
      customerId: withinWindow.id,
      templateId: template.id,
      scheduledFor: new Date(now.getTime() + 30 * 60 * 1000),
      sentAt: now,
    },
  });
  const punctuality = (await getKpis()).find(({ code }) => code === "S6");
  assert.equal(punctuality?.value, 50);
});

test("scheduled reminders require consent and share cooldown with stock notifications", async () => {
  const template = await db.reminderTemplate.create({ data: { name: "Umum uji", segment: "ALL", message: "Hai {nama}, kabar baru." } });
  const eligible = await customer("Ayu Uji Reminder");
  const optedOut = await customer("Opt Out Uji", true);
  const noConsent = await customer("Belum Consent Reminder", false, false);
  const recent = await customer("Cooldown Uji");
  const stockMessaged = await customer("Notif Stok Baru");
  const priorTemplate = await db.reminderTemplate.create({ data: { name: "Riwayat", segment: "ALL", message: "Riwayat" } });
  await db.reminderLog.create({ data: { customerId: recent.id, templateId: priorTemplate.id, body: "terkirim", sentAt: new Date(Date.now() - 86400000) } });
  const item = await db.stockItem.create({ data: { name: "Tas Selempang", category: "Aksesori", size: "All size", branchId: branches[0].id } });
  await db.stockMatchNotification.create({ data: { customerId: stockMessaged.id, stockItemId: item.id } });
  const sent = await processDueReminders(template.id);
  assert.ok(sent >= 1);
  const sentLog = await db.reminderLog.findFirst({ where: { customerId: eligible.id, templateId: template.id } });
  assert.equal(sentLog?.body, "Hai Ayu, kabar baru.");
  assert.equal(sentLog?.status, SIMULATED_SENT_STATUS);
  assert.equal(await db.reminderLog.count({ where: { customerId: optedOut.id, templateId: template.id } }), 0);
  assert.equal(await db.reminderLog.count({ where: { customerId: noConsent.id, templateId: template.id } }), 0);
  assert.equal(await db.reminderLog.count({ where: { customerId: recent.id, templateId: template.id } }), 0);
  assert.equal(await db.reminderLog.count({ where: { customerId: stockMessaged.id, templateId: template.id } }), 0);

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

test("follow-up queues include due reminders, one-stamp, inactive, and unmatched wishlist customers", async () => {
  const due = await customer("Antrean Jatuh Tempo");
  await addHistory(due.id, 3, [10, 7, 4]);
  const oneStamp = await customer("Antrean Satu Stamp");
  await addHistory(oneStamp.id, 2, [10, 8]);
  const inactive = await customer("Antrean Tidak Aktif");
  await addHistory(inactive.id, 1, [70]);
  const wishlistCustomer = await customer("Antrean Wishlist");
  const stock = await db.stockItem.create({ data: { name: "Outer Wishlist Antrean", category: "Outer", size: "L", branchId: branches[1].id } });
  await db.wishlist.create({ data: { customerId: wishlistCustomer.id, category: "Outer", size: "L" } });
  const staff = await db.user.create({ data: { name: "Manajer Followup", role: "MANAGER", branchId: branches[0].id } });
  const followup = await markFollowedUpRecord({
    customerId: oneStamp.id,
    userId: staff.id,
    branchId: branches[0].id,
    queue: "SATU_STAMP",
    note: "Sudah dihubungi",
  });
  assert.equal(followup.queue, FOLLOWUP_QUEUES[1]);
  assert.equal(await db.auditLog.count({ where: { entityId: followup.id, action: "CUSTOMER_FOLLOWUP_RECORDED" } }), 1);

  const queues = await getFollowUpQueues();
  assert.ok(queues.JATUH_TEMPO.some(({ customerId }) => customerId === due.id));
  assert.equal(queues.SATU_STAMP.some(({ customerId }) => customerId === oneStamp.id), false);
  assert.ok(queues.TIDAK_AKTIF.some(({ customerId }) => customerId === inactive.id));
  assert.ok(queues.WISHLIST_BELUM.some(({ customerId }) => customerId === wishlistCustomer.id));
  assert.ok(stock.id);
});

test("global rollout gates use the highest branch stage unless demo gating is disabled", async () => {
  process.env.ROLLOUT_GATING = "on";
  const originalStages = await db.branch.findMany({ select: { id: true, rolloutStage: true } });
  try {
    await db.branch.updateMany({ data: { rolloutStage: 1 } });
    assert.equal(await featureEnabled("wishlist"), false);
    assert.equal(await featureEnabled("stockNotification"), false);
    assert.equal(await featureEnabled("reminder"), false);

    await db.branch.update({ where: { id: branches[1].id }, data: { rolloutStage: 2 } });
    assert.equal(await featureEnabled("wishlist"), true);
    assert.equal(await featureEnabled("stockNotification"), true);
    assert.equal(await reminderEnabled(), false);
    assert.equal(await featureEnabled("reminder"), false);
    assert.equal(await processDueReminders(), 0);

    const stageOneCustomer = await customer("Pelanggan Terdaftar Tahap Satu");
    const registration = await db.customer.findUnique({
      where: { id: stageOneCustomer.id },
      select: { registeredAt: { select: { rolloutStage: true } } },
    });
    assert.equal(registration?.registeredAt.rolloutStage, 1);
    const stageOneStock = await db.stockItem.create({
      data: { name: "Kemeja Tahap Satu", category: "Atasan", size: "M", branchId: branches[0].id },
    });
    const stageOneWishlist = await db.wishlist.create({
      data: { customerId: stageOneCustomer.id, category: "Atasan", size: "M" },
    });
    assert.equal(await db.$transaction((tx) => featureEnabled("wishlist", tx)), true);
    assert.equal(await db.$transaction((tx) => matchWishlist(tx, stageOneWishlist)), 1);
    assert.equal(await db.stockMatchNotification.count({ where: { customerId: stageOneCustomer.id } }), 1);
    assert.ok(stageOneStock.id);

    await db.branch.update({ where: { id: branches[3].id }, data: { rolloutStage: 3 } });
    assert.equal(await featureEnabled("reminder"), true);
    assert.equal(await reminderEnabled(), true);

    process.env.ROLLOUT_GATING = "off";
    await db.branch.updateMany({ data: { rolloutStage: 1 } });
    assert.equal(await featureEnabled("wishlist"), true);
    assert.equal(await featureEnabled("stockNotification"), true);
    assert.equal(await featureEnabled("reminder"), true);
    assert.equal(await reminderEnabled(), true);
  } finally {
    for (const branch of originalStages) {
      await db.branch.update({ where: { id: branch.id }, data: { rolloutStage: branch.rolloutStage } });
    }
    process.env.ROLLOUT_GATING = "off";
  }
});

test("only owner may change rollout stage and stages are limited to one through three", async () => {
  const owner = await db.user.create({ data: { name: "Owner Rollout", role: "OWNER" } });
  await assert.rejects(() => setBranchRolloutStageRecord({
    branchId: branches[0].id, rolloutStage: 2, userId: owner.id, userRole: "MANAGER",
  }), /Forbidden/);
  await assert.rejects(() => setBranchRolloutStageRecord({
    branchId: branches[0].id, rolloutStage: 4, userId: owner.id, userRole: "OWNER",
  }), /integer from 1 to 3/);
  const updated = await setBranchRolloutStageRecord({
    branchId: branches[0].id, rolloutStage: 2, userId: owner.id, userRole: "OWNER",
  });
  assert.ok(updated);
  assert.equal((await db.branch.findUnique({ where: { id: branches[0].id } }))?.rolloutStage, 2);
  assert.equal(await db.auditLog.count({ where: { entityId: branches[0].id, action: "BRANCH_ROLLOUT_STAGE_UPDATED" } }), 1);
});

test("dashboard summary excludes voided transactions and applies net discounts and period filters", async () => {
  const now = new Date();
  const recent = await customer("Ringkasan Dashboard");
  const user = await db.user.create({ data: { name: "Owner Dashboard", email: "owner-dashboard@example.test", role: "OWNER" } });
  await db.transaction.create({
    data: { customerId: recent.id, branchId: branches[3].id, amount: 200000, discountAmount: 25000, createdAt: new Date(now.getTime() - 2 * 86400000) },
  });
  const voided = await db.transaction.create({
    data: { customerId: recent.id, branchId: branches[3].id, amount: 900000, createdAt: new Date(now.getTime() - 2 * 86400000) },
  });
  await db.transactionVoid.create({
    data: { transactionId: voided.id, userId: user.id, reason: "Transaksi uji dibatalkan" },
  });
  const [summary7, summary30, summary90, expected] = await Promise.all([
    getDashboardSummary({ periodDays: 7, branchId: branches[3].id, now }),
    getDashboardSummary({ periodDays: 30, branchId: branches[3].id, now }),
    getDashboardSummary({ periodDays: 90, branchId: branches[3].id, now }),
    db.transaction.aggregate({
      where: { branchId: branches[3].id, createdAt: { gte: new Date(now.getTime() - 7 * 86400000) }, voidRecord: null },
      _sum: { amount: true, discountAmount: true },
    }),
  ]);
  assert.equal(summary7.summary.netSales, (expected._sum.amount ?? 0) - (expected._sum.discountAmount ?? 0));
  assert.ok(summary7.summary.netSales < 900000);
  assert.ok(summary30.summary.transactions >= summary7.summary.transactions);
  assert.ok(summary90.summary.transactions >= summary30.summary.transactions);
});

test("daily stock confirmation records physical and system counts; QA KPI requires every branch", async () => {
  const confirmedBranch = branches[2];
  await assert.rejects(() => confirmStockTodayRecord(confirmedBranch.id, -1), /non-negative integer/);
  const availableCount = await db.stockItem.count({ where: { branchId: confirmedBranch.id, status: "AVAILABLE" } });
  const log = await confirmStockTodayRecord(confirmedBranch.id, availableCount + 1);
  assert.equal(log.type, "CONFIRM");
  assert.equal(log.countedItems, availableCount + 1);
  assert.equal(log.systemCount, availableCount);
  const sameDayLogs = await db.stockUpdateLog.findMany({ where: { branchId: confirmedBranch.id } });
  assert.ok(sameDayLogs.some((row) => jakartaDayKey(row.updatedAt) === jakartaDayKey()));
  const kpis = await getKpis();
  assert.deepEqual(kpis.map(({ code }) => code), ["S1", "S2", "S3", "S4", "S5", "S6", "S7a", "S7b"]);
  assert.ok(kpis.every(({ status }) => ["Tercapai", "Berjalan", "Belum"].includes(status)));
  assert.equal(kpis.find(({ code }) => code === "S2")?.value, 0);
  assert.ok(kpis.find(({ code }) => code === "S4")?.value > 0);
  assert.ok(kpis.find(({ code }) => code === "S2")?.missingQaBranches?.length > 0);
  await db.redemptionQaCheck.createMany({
    data: branches.map((branch, index) => ({ branchId: branch.id, passed: index !== 1 })),
  });
  const verifiedS2 = (await getKpis()).find(({ code }) => code === "S2");
  assert.equal(verifiedS2?.value, 75);
  assert.deepEqual(verifiedS2?.missingQaBranches, []);
  await db.stockUpdateLog.create({ data: { branchId: branches[0].id, type: "CHANGE" } });
  assert.ok((await getKpis()).find(({ code }) => code === "S4")?.value > 0);
});

after(async () => {
  await db.$disconnect();
  const databasePath = path.join(root, "prisma", "prisma", "regression-test.db");
  for (const file of [databasePath, `${databasePath}-journal`]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
});
