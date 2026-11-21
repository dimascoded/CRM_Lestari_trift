import { PrismaClient } from "@prisma/client";
import {
  MESSAGE_CONSENT_POLICY_VERSION,
  MESSAGE_CONSENT_TEXT,
  REDEMPTION_DISCOUNT_PERCENT,
  STAMP_MINIMUM_TRANSACTION,
} from "../src/lib/business-rules.ts";

const db = new PrismaClient();
const now = new Date();

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20261121);
const int = (min, max) => Math.floor(random() * (max - min + 1)) + min;
const pick = (rows) => rows[int(0, rows.length - 1)];

function day(offset) {
  return new Date(now.getTime() - offset * 86400000);
}

function dayKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function jakartaScheduledDate(offset, sentMinute = 0) {
  const date = day(offset);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const scheduled = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    2,
    0,
  ));
  return { scheduled, sent: new Date(scheduled.getTime() + sentMinute * 60000) };
}

async function resetDemoData() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_RESET tidak diperbolehkan pada NODE_ENV=production.");
  }
  await db.$transaction([
    db.stockMatchNotification.deleteMany(),
    db.followUpNote.deleteMany(),
    db.reminderLog.deleteMany(),
    db.wishlist.deleteMany(),
    db.messageConsent.deleteMany(),
    db.duplicateCheckLog.deleteMany(),
    db.redemptionStamp.deleteMany(),
    db.transactionVoid.deleteMany(),
    db.stamp.deleteMany(),
    db.transaction.deleteMany(),
    db.redemption.deleteMany(),
    db.stockItem.deleteMany(),
    db.stockUpdateLog.deleteMany(),
    db.customer.deleteMany(),
  ]);
}

async function main() {
  const legacyBranches = [
    ["Malioboro", "Yogyakarta"],
    ["Prawirotaman", "Semarang"],
    ["Seturan", "Magelang"],
    ["Gejayan", "Bali"],
  ];
  for (const [oldName, newName] of legacyBranches) {
    const oldBranch = await db.branch.findUnique({ where: { name: oldName } });
    const newBranch = await db.branch.findUnique({ where: { name: newName } });
    if (oldBranch && !newBranch) await db.branch.update({ where: { id: oldBranch.id }, data: { name: newName } });
  }

  const branchRows = [
    { name: "Yogyakarta", rolloutStage: 1 },
    { name: "Semarang", rolloutStage: 2 },
    { name: "Magelang", rolloutStage: 2 },
    { name: "Bali", rolloutStage: 3 },
  ];
  const branches = await Promise.all(
    branchRows.map(({ name, rolloutStage }) =>
      db.branch.upsert({ where: { name }, update: { rolloutStage }, create: { name, rolloutStage } }),
    ),
  );
  const [yogyakarta, semarang, magelang, bali] = branches;
  const branchByIndex = [yogyakarta, semarang, magelang, bali];

  const kpiTargets = [
    { code: "S1", label: "Akun pelanggan ganda", unit: "%", baseline: 8, target: 2 },
    { code: "S2", label: "Uji tukar stamp berhasil per cabang", unit: "%", baseline: 0, target: 100 },
    { code: "S3", label: "Pelanggan beli lebih dari sekali per bulan", unit: "orang", baseline: 16, target: 20 },
    { code: "S4", label: "Kepatuhan update stok harian", unit: "%", baseline: 50, target: 90 },
    { code: "S5", label: "Stok mati", unit: "barang", baseline: 16, target: 13 },
    { code: "S6", label: "Reminder tepat jadwal", unit: "%", baseline: null, target: 95 },
    { code: "S7a", label: "Rata-rata transaksi per pelanggan aktif per bulan", unit: "kali", baseline: 1.6, target: 1.84 },
    { code: "S7b", label: "Pelanggan beli dalam 7 hari setelah reminder", unit: "%", baseline: null, target: 20 },
  ];
  await db.$transaction(kpiTargets.map(({ code, ...data }) =>
    db.kpiTarget.upsert({ where: { code }, update: data, create: { code, ...data } }),
  ));

  await db.reminderTemplate.upsert({
    where: { id: "demo-template-all" },
    update: { name: "Koleksi baru", segment: "ALL", targetSegment: null, message: "Hai {nama}, koleksi baru Lestari sudah hadir. Yuk, cek wishlist favoritmu!" },
    create: { id: "demo-template-all", name: "Koleksi baru", segment: "ALL", targetSegment: null, message: "Hai {nama}, koleksi baru Lestari sudah hadir. Yuk, cek wishlist favoritmu!" },
  });
  await db.reminderTemplate.upsert({
    where: { id: "demo-template-new" },
    update: { name: "Pelanggan baru", segment: "NEW", targetSegment: null, message: "Hai {nama}, terima kasih sudah bergabung. Kunjungi cabang Lestari terdekat!" },
    create: { id: "demo-template-new", name: "Pelanggan baru", segment: "NEW", targetSegment: null, message: "Hai {nama}, terima kasih sudah bergabung. Kunjungi cabang Lestari terdekat!" },
  });
  await db.reminderTemplate.upsert({
    where: { id: "demo-template-personal" },
    update: { name: "Pilihan personal", segment: "PERSONAL", targetSegment: null, message: "Hai {nama}, ada pilihan baru sesuai selera belanjamu." },
    create: { id: "demo-template-personal", name: "Pilihan personal", segment: "PERSONAL", targetSegment: null, message: "Hai {nama}, ada pilihan baru sesuai selera belanjamu." },
  });
  await db.reminderTemplate.upsert({
    where: { id: "demo-template-routine" },
    update: { name: "Reminder pembeli rutin", segment: "ALL", targetSegment: "Pembeli rutin", message: "Hai {nama}, sudah waktunya menjelajah koleksi baru Lestari." },
    create: { id: "demo-template-routine", name: "Reminder pembeli rutin", segment: "ALL", targetSegment: "Pembeli rutin", message: "Hai {nama}, sudah waktunya menjelajah koleksi baru Lestari." },
  });
  await db.reminderTemplate.upsert({
    where: { id: "demo-template-hunter" },
    update: { name: "Reminder pemburu item", segment: "ALL", targetSegment: "Pemburu item", message: "Hai {nama}, cek barang baru yang mungkin cocok dengan wishlist kamu." },
    create: { id: "demo-template-hunter", name: "Reminder pemburu item", segment: "ALL", targetSegment: "Pemburu item", message: "Hai {nama}, cek barang baru yang mungkin cocok dengan wishlist kamu." },
  });

  if (process.env.SEED_RESET === "true") {
    await resetDemoData();
  }

  const customerCount = await db.customer.count();
  if (customerCount >= 20 && process.env.SEED_RESET !== "true") {
    console.log(`Seed demo sudah ada (${customerCount} pelanggan). Gunakan SEED_RESET=true untuk membangun ulang.`);
    return;
  }

  const firstNames = ["Ayu","Bima","Citra","Dafa","Dinda","Eka","Fajar","Gita","Hana","Indra","Jihan","Kevin","Laras","Maya","Nadia","Oki","Putri","Raka","Salsa","Tari","Udin","Vina","Wulan","Yuni","Zahra","Aldi","Bagas","Caca","Dewi","Erwin","Farah","Galih","Hadi","Intan","Joko","Kania","Leo","Mira","Naufal","Omar"];
  const lastNames = ["Pratama","Santoso","Wijaya","Ramadhan","Putri","Lestari","Nugraha","Sari","Permata","Utama","Kusuma","Mahendra","Hidayat","Saputra","Amelia","Ananda","Wibowo","Cahyani","Kirana","Pangestu","Aditya","Raharjo","Febrian","Melati","Jayas","Novita","Pradipta","Wicaksono","Halim","Kartika","Darmawan","Ayuningtyas","Setiawan","Fauzan","Salsabila","Pranata","Damayanti","Hakim","Nuraini","Baskara"];

  const customerData = [];
  const legacyRows = [
    { id: "demo-cust-001", name: "Dinda Putri", whatsapp: "+6281234567801", branch: yogyakarta, category: "Atasan", size: "M", instagram: "@dindaputri", channel: "INSTAGRAM", consent: true, opted: false },
    { id: "demo-cust-002", name: "Sarah Amelia", whatsapp: "+6281234567802", branch: semarang, category: "Dress", size: "S", instagram: null, channel: "TIKTOK", consent: true, opted: false },
    { id: "demo-cust-003", name: "Rani Maharani", whatsapp: "+6281234567803", branch: magelang, category: null, size: null, instagram: null, channel: "DATANG_LANGSUNG", consent: false, opted: true },
    { id: "demo-cust-004", name: "Nabila Zahra", whatsapp: "+6281234567804", branch: bali, category: null, size: null, instagram: null, channel: "WHATSAPP", consent: true, opted: false },
    { id: "demo-cust-005", name: "Putri Wulandari", whatsapp: "+6281234567805", branch: yogyakarta, category: null, size: null, instagram: null, channel: "TEMAN", consent: false, opted: false },
    { id: "demo-cust-006", name: "Laras Puspita", whatsapp: "+6281234567806", branch: semarang, category: null, size: null, instagram: null, channel: "INSTAGRAM", consent: true, opted: false },
  ];
  for (const row of legacyRows) {
    customerData.push({
      id: row.id,
      name: row.name,
      whatsapp: row.whatsapp,
      active: true,
      optedOut: row.opted,
      marketingConsent: row.consent,
      acquisitionChannel: row.channel,
      birthDate: null,
      favoriteCategory: row.category,
      favoriteSize: row.size,
      instagram: row.instagram,
      registeredAtId: row.branch.id,
    });
  }

  const channelByRandom = () => {
    const value = random();
    if (value < 0.35) return "DATANG_LANGSUNG";
    if (value < 0.60) return "INSTAGRAM";
    if (value < 0.80) return "TIKTOK";
    if (value < 0.92) return "TEMAN";
    return "WHATSAPP";
  };
  const groups = [
    ...Array.from({ length: 30 }, (_, index) => ({ kind: "routine", index })),
    ...Array.from({ length: 16 }, (_, index) => ({ kind: "hunter", index })),
    ...Array.from({ length: 20 }, (_, index) => ({ kind: "new", index })),
    ...Array.from({ length: 18 }, (_, index) => ({ kind: "inactive", index })),
  ];
  let nameIndex = 0;
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const sequence = index + 7;
    let branch;
    if (index < 27) branch = yogyakarta;
    else if (index < 50) branch = semarang;
    else if (index < 65) branch = magelang;
    else branch = bali;
    const first = firstNames[nameIndex % firstNames.length];
    const last = lastNames[(nameIndex * 7 + int(0, 39)) % lastNames.length];
    nameIndex++;
    const name = `${first} ${last}`;
    const consentRoll = random();
    const optedOut = consentRoll >= 0.90;
    const marketingConsent = consentRoll < 0.70;
    const favoriteCategory = random() < 0.60 ? pick(["Atasan","Bawahan","Dress","Outer","Aksesori","Sepatu"]) : null;
    const favoriteSize = favoriteCategory && random() < 0.80 ? pick(["S","M","L","XL","All size"]) : null;
    customerData.push({
      id: `demo-cust-${String(sequence).padStart(3, "0")}`,
      name,
      whatsapp: `+628123456${8001 + index}`,
      active: true,
      optedOut,
      marketingConsent,
      acquisitionChannel: channelByRandom(),
      birthDate: random() < 0.20 ? day(int(7000, 9500)) : null,
      favoriteCategory,
      favoriteSize,
      instagram: random() < 0.30 ? `@${first.toLowerCase()}${last.toLowerCase()}` : null,
      registeredAtId: branch.id,
      createdAt: group.kind === "new"
        ? day(int(1, 30))
        : group.kind === "inactive"
          ? day(int(61, 150))
          : day(int(30, 150)),
    });
  }

  await db.customer.createMany({ data: customerData });
  const customerRows = await db.customer.findMany({ where: { id: { startsWith: "demo-cust-" } }, select: { id: true, name: true, registeredAtId: true, marketingConsent: true } });
  const customerById = new Map(customerRows.map((customer) => [customer.id, customer]));
  const groupCustomerIds = customerRows.filter((customer) => customer.id >= "demo-cust-007").map((customer) => customer.id);
  const routineIds = groupCustomerIds.slice(0, 30);
  const hunterIds = groupCustomerIds.slice(30, 46);
  const newIds = groupCustomerIds.slice(46, 66);
  const inactiveIds = groupCustomerIds.slice(66, 84);

  const transactions = [];
  const stamps = [];
  const txKey = new Set();
  const stampKey = new Set();
  function amountForTransaction() {
    if (random() < 0.20) return int(45000, 99999);
    if (random() < 0.70) return int(100000, 220000);
    return int(220001, 420000);
  }
  function addTransaction(customerId, branchId, age, forcedAmount = null) {
    const date = day(age);
    const key = `${customerId}:${dayKey(date)}`;
    if (txKey.has(key)) return null;
    txKey.add(key);
    const amount = forcedAmount ?? amountForTransaction();
    const transaction = {
      id: `demo-tx-${String(transactions.length + 1).padStart(4, "0")}`,
      customerId,
      branchId,
      amount,
      discountAmount: 0,
      stampOffered: random() < 0.88,
      createdAt: date,
    };
    transactions.push(transaction);
    if (amount >= STAMP_MINIMUM_TRANSACTION) {
      const stampKeyValue = `${customerId}:${dayKey(date)}`;
      if (!stampKey.has(stampKeyValue)) {
        stampKey.add(stampKeyValue);
        stamps.push({
          id: `demo-stamp-${String(stamps.length + 1).padStart(4, "0")}`,
          customerId,
          transactionId: transaction.id,
          branchId,
          dayKey: dayKey(date),
          activeDayKey: dayKey(date),
          createdAt: date,
        });
      }
    }
    return transaction;
  }

  for (let index = 0; index < routineIds.length; index++) {
    const customerId = routineIds[index];
    const customer = customerById.get(customerId);
    const count = int(3, 8);
    const finalAge = random() < 0.55 ? int(1, 6) : int(10, 75);
    let age = finalAge;
    const gap = int(5, 14);
    for (let step = 0; step < count; step++) {
      addTransaction(customerId, customer.registeredAtId, age);
      age += gap + int(-2, 2);
      if (age > 90) break;
    }
  }
  for (const customerId of hunterIds) {
    const customer = customerById.get(customerId);
    const count = int(0, 2);
    for (let step = 0; step < count; step++) addTransaction(customerId, customer.registeredAtId, int(10, 89));
  }
  for (const customerId of newIds) {
    const customer = customerById.get(customerId);
    if (random() < 0.55) addTransaction(customerId, customer.registeredAtId, int(1, 30));
  }
  for (const customerId of inactiveIds) {
    const customer = customerById.get(customerId);
    addTransaction(customerId, customer.registeredAtId, int(61, 150));
  }

  let fillAttempts = 0;
  const fillCustomerIds = [...routineIds, ...newIds, ...inactiveIds];
  while (transactions.length < 300 && fillAttempts < 3000) {
    fillAttempts++;
    const ageRoll = random();
    const age = ageRoll < 0.40 ? int(0, 30) : ageRoll < 0.75 ? int(31, 90) : int(91, 150);
    const customerId = pick(fillCustomerIds);
    addTransaction(customerId, pick(branches).id, age);
  }

  await db.$transaction([
    db.transaction.createMany({ data: transactions }),
    db.stamp.createMany({ data: stamps }),
  ]);

  const redemptions = [];
  const activeStampRows = await db.stamp.findMany({
    where: { redeemedAt: null, voidedAt: null, activeDayKey: { not: null } },
    orderBy: [{ customerId: "asc" }, { createdAt: "asc" }],
  });
  const stampsByCustomer = new Map();
  for (const stamp of activeStampRows) {
    const rows = stampsByCustomer.get(stamp.customerId) ?? [];
    rows.push(stamp);
    stampsByCustomer.set(stamp.customerId, rows);
  }
  const eligibleRedemptionCustomers = [...stampsByCustomer.entries()].filter(([, rows]) => rows.length >= 3).map(([customerId]) => customerId);
  const redemptionCustomers = eligibleRedemptionCustomers.slice(0, 15);
  for (let index = 0; index < redemptionCustomers.length; index++) {
    const customerId = redemptionCustomers[index];
    const branch = branchByIndex[index % branchByIndex.length];
    const stampRows = stampsByCustomer.get(customerId).slice(0, 3);
    const redemptionId = `demo-redemption-${String(index + 1).padStart(3, "0")}`;
    const redemptionDate = day(int(1, 45));
    const amount = int(STAMP_MINIMUM_TRANSACTION, 320000);
    const redemptionTransactionId = `demo-redeem-tx-${String(index + 1).padStart(3, "0")}`;
    redemptions.push({
      id: redemptionId,
      customerId,
      branchId: branch.id,
      stampCount: 3,
      discountPercent: REDEMPTION_DISCOUNT_PERCENT,
      createdAt: redemptionDate,
    });
    await db.redemption.create({
      data: redemptions[redemptions.length - 1],
    });
    await db.transaction.create({
      data: {
        id: redemptionTransactionId,
        customerId,
        branchId: branch.id,
        amount,
        discountAmount: Math.floor(amount * REDEMPTION_DISCOUNT_PERCENT / 100),
        stampOffered: true,
        redemptionId,
        createdAt: redemptionDate,
      },
    });
    for (const stamp of stampRows) {
      await db.redemptionStamp.create({ data: { redemptionId, stampId: stamp.id, createdAt: redemptionDate } });
      await db.stamp.update({ where: { id: stamp.id }, data: { redeemedAt: redemptionDate } });
    }
  }

  const stockItems = [];
  const availableCategories = [
    ["Atasan", 19],
    ["Bawahan", 10],
    ["Aksesori", 6],
    ["Sepatu", 4],
    ["Dress", 3],
    ["Outer", 3],
  ];
  let stockIndex = 1;
  for (const [category, count] of availableCategories) {
    for (let item = 0; item < count; item++) {
      const branch = branchByIndex[(stockIndex - 1) % 4];
      const age = item < 13 ? int(61, 110) : int(0, 60);
      stockItems.push({
        id: `demo-stock-${String(stockIndex).padStart(3, "0")}`,
        name: `${category} sintetis ${stockIndex}`,
        category,
        size: pick(["S","M","L","XL","All size"]),
        branchId: branch.id,
        status: "AVAILABLE",
        enteredAt: day(age),
      });
      stockIndex++;
    }
  }
  for (let item = 0; item < 15; item++) {
    stockItems.push({
      id: `demo-stock-${String(stockIndex).padStart(3, "0")}`,
      name: `Barang terjual sintetis ${item + 1}`,
      category: pick(["Atasan","Bawahan","Dress","Outer","Aksesori","Sepatu"]),
      size: pick(["S","M","L","XL","All size"]),
      branchId: pick(branches).id,
      status: "SOLD",
      enteredAt: day(int(10, 130)),
      soldAt: day(int(0, 9)),
    });
    stockIndex++;
  }
  await db.stockItem.createMany({ data: stockItems });

  const availableStock = await db.stockItem.findMany({ where: { status: "AVAILABLE" }, select: { id: true, category: true, size: true, branchId: true, name: true } });
  const wishlistRows = [];
  let wishlistIndex = 1;
  for (let index = 0; index < 30; index++) {
    const customer = pick(customerRows);
    const categoryRoll = random();
    const category = categoryRoll < 0.38 ? "Dress" : categoryRoll < 0.70 ? "Outer" : categoryRoll < 0.88 ? "Atasan" : pick(["Bawahan","Aksesori","Sepatu"]);
    const size = pick(["S","M","L","XL","All size"]);
    wishlistRows.push({
      id: `demo-wishlist-${String(wishlistIndex).padStart(3, "0")}`,
      customerId: customer.id,
      category,
      size,
      keyword: category === "Dress" ? "midi" : category === "Outer" ? "rajut" : null,
      active: wishlistIndex <= 25,
      createdAt: day(int(0, 120)),
    });
    wishlistIndex++;
  }
  await db.wishlist.createMany({ data: wishlistRows });
  const unmatchedGuarantee = [];
  for (let index = 0; index < 6; index++) {
    const customer = pick(customerRows);
    const match = pick(availableStock.filter((item) => ["Dress","Outer","Atasan"].includes(item.category)));
    unmatchedGuarantee.push({
      id: `demo-wishlist-guarantee-${String(index + 1).padStart(2, "0")}`,
      customerId: customer.id,
      category: match.category,
      size: match.size,
      keyword: match.category === "Dress" ? "midi" : match.category === "Outer" ? "rajut" : null,
      active: true,
      createdAt: day(int(0, 90)),
    });
  }
  await db.wishlist.createMany({ data: unmatchedGuarantee });

  const wishlists = await db.wishlist.findMany({ where: { active: true } });
  const notificationRows = [];
  let matchingIndex = 0;
  for (const wishlist of wishlists) {
    const match = availableStock.find((item) =>
      (!wishlist.category || wishlist.category === item.category) &&
      (!wishlist.size || wishlist.size === item.size),
    );
    if (match && matchingIndex < 12) {
      if (matchingIndex < 4) {
        notificationRows.push({
          id: `demo-match-${String(matchingIndex + 1).padStart(3, "0")}`,
          customerId: wishlist.customerId,
          stockItemId: match.id,
          body: `Hai, barang ${match.name} yang cocok dengan wishlist kamu tersedia.`,
          status: "SIMULATED_SENT",
          sentAt: day(int(0, 30)),
        });
      }
      matchingIndex++;
    }
  }
  await db.stockMatchNotification.createMany({ data: notificationRows });

  const templates = await db.reminderTemplate.findMany({ where: { id: { startsWith: "demo-template-" } } });
  const reminderRows = [];
  for (let index = 0; index < 40; index++) {
    const customer = pick(customerRows);
    if (!customer) continue;
    const template = pick(templates);
    const offset = int(0, 30);
    const { scheduled, sent } = jakartaScheduledDate(offset, random() < 0.92 ? int(0, 45) : int(61, 180));
    const name = customerRows.find((row) => row.id === customer.id)?.name ?? "Pelanggan";
    reminderRows.push({
      id: `demo-reminder-${String(index + 1).padStart(3, "0")}`,
      customerId: customer.id,
      templateId: template.id,
      body: template.message.replaceAll("{nama}", name.split(/\s+/)[0]),
      scheduledFor: scheduled,
      status: "SIMULATED_SENT",
      sentAt: sent,
    });
  }
  await db.reminderLog.createMany({ data: reminderRows });

  for (const log of reminderRows.filter((_, index) => index % 5 === 0).slice(0, 8)) {
    const customer = customerById.get(log.customerId);
    if (!customer) continue;
    const age = int(0, 7);
    addTransaction(log.customerId, customer.registeredAtId, age);
  }
  if (transactions.length > 300) {
    const extra = transactions.slice(300);
    await db.$transaction(extra.map((transaction) => db.transaction.create({ data: transaction })));
  }

  const systemUser = await db.user.findFirst({ where: { role: { in: ["OWNER", "MANAGER"] } }, select: { id: true } });
  if (systemUser) {
    const voidCandidates = await db.transaction.findMany({
      where: { stamp: { isNot: null }, voidRecord: null, redemptionId: null },
      include: { stamp: true },
      take: 4,
    });
    for (let index = 0; index < voidCandidates.length; index++) {
      const transaction = voidCandidates[index];
      await db.$transaction([
        db.transactionVoid.create({
          data: {
            id: `demo-void-${String(index + 1).padStart(3, "0")}`,
            transactionId: transaction.id,
            userId: systemUser.id,
            reason: "Data sintetik untuk koreksi demo.",
            voidedAt: day(int(0, 2)),
          },
        }),
        db.stamp.update({
          where: { id: transaction.stamp.id },
          data: { voidedAt: day(int(0, 2)), activeDayKey: null },
        }),
      ]);
    }
  }

  const stockUpdateRows = [];
  const complianceTargets = [13, 12, 8, 5];
  for (let branchIndex = 0; branchIndex < branches.length; branchIndex++) {
    const branch = branches[branchIndex];
    const target = complianceTargets[branchIndex];
    let included = 0;
    for (let age = 0; age < 14 && included < target; age++) {
      if (age === 1 && branchIndex === 0) continue;
      const systemCount = stockItems.filter((item) => item.branchId === branch.id && item.status === "AVAILABLE").length;
      const mismatched = (branchIndex === 0 && age === 3) || (branchIndex === 2 && age === 5);
      stockUpdateRows.push({
        id: `demo-stock-log-${branchIndex + 1}-${String(age).padStart(2, "0")}`,
        branchId: branch.id,
        type: "CONFIRM",
        countedItems: mismatched ? Math.max(0, systemCount - 2) : systemCount,
        systemCount,
        updatedAt: day(age),
      });
      included++;
    }
  }
  await db.stockUpdateLog.createMany({ data: stockUpdateRows });

  const followUpRows = [];
  for (let index = 0; index < 6; index++) {
    const customer = pick(customerRows);
    followUpRows.push({
      id: `demo-followup-${String(index + 1).padStart(3, "0")}`,
      customerId: customer.id,
      queue: pick(["JATUH_TEMPO","SATU_STAMP","TIDAK_AKTIF","WISHLIST_BELUM"]),
      note: "Data tindak lanjut sintetis.",
      createdAt: day(index + 10),
    });
  }
  await db.followUpNote.createMany({ data: followUpRows });

  const existingCustomers = await db.customer.findMany({ take: 5, select: { id: true } });
  const duplicateRows = [];
  for (let index = 0; index < 5 && existingCustomers[index]; index++) {
    duplicateRows.push({
      id: `demo-duplicate-${index + 1}`,
      attemptedName: `Duplikat sintetis ${index + 1}`,
      branchId: branches[index % branches.length].id,
      existingCustomerId: existingCustomers[index].id,
      attemptedAt: day(index),
    });
  }
  await db.duplicateCheckLog.createMany({ data: duplicateRows });

  for (const customer of customerRows) {
    const isConsent = customer.marketingConsent;
    if (!isConsent) continue;
    await db.messageConsent.create({
      data: {
        customerId: customer.id,
        status: "GRANTED",
        source: "SEED_DEMO",
        policyVersion: MESSAGE_CONSENT_POLICY_VERSION,
        consentText: MESSAGE_CONSENT_TEXT,
      },
    }).catch(() => undefined);
  }
  for (const row of legacyRows) {
    if (row.consent && !row.opted) {
      await db.messageConsent.create({
        data: {
          customerId: row.id,
          status: "GRANTED",
          source: "SEED_DEMO",
          policyVersion: MESSAGE_CONSENT_POLICY_VERSION,
          consentText: MESSAGE_CONSENT_TEXT,
        },
      }).catch(() => undefined);
    }
  }

  console.log(`Seed demo siap: ${await db.customer.count()} pelanggan, ${await db.transaction.count()} transaksi, ${await db.stockItem.count()} stok.`);
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
