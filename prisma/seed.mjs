import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const day = (offset) => {
  const date = new Date(Date.now() - offset * 86400000);
  return date;
};
const dayKey = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

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
    if (oldBranch && !newBranch) {
      await db.branch.update({ where: { id: oldBranch.id }, data: { name: newName } });
    }
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

  const kpiTargets = [
    { code: "S1", label: "Akun pelanggan ganda", unit: "%", baseline: 8, target: 2 },
    { code: "S2", label: "Cabang dengan penukaran stamp berhasil", unit: "%", baseline: 0, target: 100 },
    { code: "S3", label: "Pelanggan beli lebih dari sekali per bulan", unit: "orang", baseline: 40, target: 50 },
    { code: "S4", label: "Kepatuhan update stok harian", unit: "%", baseline: 50, target: 90 },
    { code: "S5", label: "Stok mati", unit: "barang", baseline: 25, target: 20 },
    { code: "S6", label: "Reminder tepat jadwal", unit: "%", baseline: null, target: 95 },
    { code: "S7a", label: "Rata-rata transaksi per pelanggan aktif per bulan", unit: "kali", baseline: 1.6, target: 1.84 },
    { code: "S7b", label: "Pelanggan beli dalam 7 hari setelah reminder", unit: "%", baseline: null, target: 20 },
  ];
  for (const target of kpiTargets) {
    const { code, ...data } = target;
    await db.kpiTarget.upsert({ where: { code }, update: data, create: { code, ...data } });
  }

  if ((await db.user.count()) === 0) {
    await db.user.createMany({
      data: [
        { name: "Nadia Anggraini", role: "MANAGER", branchId: yogyakarta.id },
        { name: "Ayu Puspita", role: "CASHIER", branchId: semarang.id },
        { name: "Rafi Pratama", role: "STOCK_STAFF", branchId: magelang.id },
        { name: "Dewi Lestari", role: "MARKETING", branchId: yogyakarta.id },
        { name: "Pemilik Lestari", role: "OWNER", branchId: null },
      ],
    });
  }

  const customerRows = [
    { name: "Dinda Putri", whatsapp: "+6281234567801", registeredAtId: yogyakarta.id, favoriteCategory: "Atasan", favoriteSize: "M", instagram: "@dindaputri" },
    { name: "Sarah Amelia", whatsapp: "+6281234567802", registeredAtId: semarang.id, favoriteCategory: "Dress", favoriteSize: "S" },
    { name: "Rani Maharani", whatsapp: "+6281234567803", registeredAtId: magelang.id, optedOut: true },
    { name: "Nabila Zahra", whatsapp: "+6281234567804", registeredAtId: bali.id },
    { name: "Putri Wulandari", whatsapp: "+6281234567805", registeredAtId: yogyakarta.id },
  ];
  const customers = await Promise.all(
    customerRows.map(({ whatsapp, ...data }) =>
      db.customer.upsert({ where: { whatsapp }, update: {}, create: { ...data, whatsapp } }),
    ),
  );
  const [dinda, sarah, rani, nabila, putri] = customers;

  if ((await db.transaction.count()) === 0) {
    const earningPlans = [
      { customer: dinda, branch: yogyakarta, amount: 185000, age: 2 },
      { customer: dinda, branch: semarang, amount: 240000, age: 5 },
      { customer: dinda, branch: magelang, amount: 125000, age: 9 },
      { customer: sarah, branch: semarang, amount: 90000, age: 1 },
      { customer: sarah, branch: bali, amount: 150000, age: 12 },
      { customer: rani, branch: magelang, amount: 220000, age: 3 },
      { customer: nabila, branch: bali, amount: 310000, age: 0 },
      { customer: putri, branch: yogyakarta, amount: 175000, age: 0 },
    ];
    for (const plan of earningPlans) {
      const createdAt = day(plan.age);
      const transaction = await db.transaction.create({
        data: {
          customerId: plan.customer.id,
          branchId: plan.branch.id,
          amount: plan.amount,
          createdAt,
        },
      });
      if (plan.customer.id === dinda.id || (plan.customer.id === sarah.id && plan.amount >= 150000)) {
        await db.stamp.create({
          data: {
            customerId: plan.customer.id,
            transactionId: transaction.id,
            branchId: plan.branch.id,
            dayKey: dayKey(createdAt),
            createdAt,
          },
        });
      }
    }
  }

  if ((await db.stockItem.count()) === 0) {
    const stockPlans = [
      { name: "Kemeja linen vintage", category: "Atasan", size: "M", branchId: yogyakarta.id, age: 4 },
      { name: "Rok denim klasik", category: "Bawahan", size: "S", branchId: yogyakarta.id, age: 74 },
      { name: "Blouse floral", category: "Atasan", size: "M", branchId: semarang.id, age: 2 },
      { name: "Outer rajut earth tone", category: "Outer", size: "L", branchId: semarang.id, age: 18 },
      { name: "Dress midi vintage", category: "Dress", size: "S", branchId: magelang.id, age: 69 },
      { name: "Tas kulit second", category: "Aksesori", size: "All size", branchId: magelang.id, age: 1 },
      { name: "Kemeja cotton oversized", category: "Atasan", size: "M", branchId: bali.id, age: 3 },
      { name: "Celana corduroy", category: "Bawahan", size: "L", branchId: bali.id, age: 82 },
    ];
    for (const { age, ...item } of stockPlans) {
      await db.stockItem.create({ data: { ...item, enteredAt: day(age) } });
    }
  }

  if ((await db.wishlist.count()) === 0) {
    await db.wishlist.createMany({
      data: [
        { customerId: dinda.id, category: "Atasan", size: "M", keyword: "linen" },
        { customerId: sarah.id, category: "Dress", size: "S", keyword: "vintage" },
        { customerId: putri.id, category: "Outer", size: "L", keyword: "rajut" },
      ],
    });
  }

  if ((await db.reminderTemplate.count()) === 0) {
    const templates = await Promise.all([
      db.reminderTemplate.create({
        data: { name: "Koleksi baru", segment: "ALL", message: "Hai {nama}, koleksi baru Lestari sudah hadir. Yuk, cek wishlist favoritmu!" },
      }),
      db.reminderTemplate.create({
        data: { name: "Pelanggan baru", segment: "NEW", message: "Hai {nama}, terima kasih sudah bergabung. Kunjungi cabang Lestari terdekat!" },
      }),
      db.reminderTemplate.create({
        data: { name: "Pilihan personal", segment: "PERSONAL", message: "Hai {nama}, ada pilihan baru sesuai selera belanjamu." },
      }),
    ]);
    await db.reminderLog.createMany({
      data: [
        { customerId: dinda.id, templateId: templates[0].id, sentAt: day(10) },
        { customerId: nabila.id, templateId: templates[1].id, sentAt: day(2) },
      ],
    });
  }

  const dindaLinen = await db.stockItem.findFirst({
    where: { name: "Kemeja linen vintage", branchId: yogyakarta.id },
  });
  if (dindaLinen && (await db.stockMatchNotification.count()) === 0) {
    await db.stockMatchNotification.create({
      data: { customerId: dinda.id, stockItemId: dindaLinen.id, sentAt: day(1) },
    });
  }

  for (const branch of branches) {
    const hasLog = await db.stockUpdateLog.findFirst({ where: { branchId: branch.id } });
    if (!hasLog) await db.stockUpdateLog.create({ data: { branchId: branch.id, updatedAt: day(branch.id === bali.id ? 1 : 0) } });
  }

  console.log(`Seeded ${branches.length} branches and ${customers.length} demo customers.`);
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
