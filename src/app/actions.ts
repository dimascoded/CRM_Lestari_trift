"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  createCustomerSession,
  createStaffSession,
  CUSTOMER_LOGIN_CODE_TTL,
  logoutCustomerSession,
  logoutStaffSession,
  requireBranchAccess,
  requireCustomerSession,
  requireStaff,
  STAFF_ROLES,
  staffHomePath,
} from "@/lib/auth";
import { normalizeWhatsApp } from "@/lib/business-rules";
import { generateCustomerLoginCode, hashCustomerLoginCode, verifyCustomerLoginCode, verifyPassword } from "@/lib/password";
import { registerCustomerRecord, setCustomerMarketingConsent } from "@/lib/customer-service";
import { matchStockItem, matchWishlist } from "@/lib/wishlist-match";
import { processDueReminders } from "@/lib/reminders";
import { confirmStockTodayRecord } from "@/lib/stock-service";
import { recordTransactionRecord } from "@/lib/transaction-service";

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginStaff(formData: FormData) {
  const email = formText(formData, "email").toLowerCase();
  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 200) {
    redirect("/login?status=login-failed");
  }
  const user = await db.user.findUnique({ where: { email } });
  const valid = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid || !STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number])) {
    redirect("/login?status=login-failed");
  }
  await createStaffSession(user.id);
  redirect(staffHomePath(user.role));
}

export async function logoutStaff() {
  await logoutStaffSession();
  revalidatePath("/");
  redirect("/login");
}

export async function registerCustomer(formData: FormData) {
  const staff = await requireStaff(["CASHIER", "MANAGER", "OWNER"]);
  const name = formText(formData, "name");
  const whatsapp = normalizeWhatsApp(formText(formData, "whatsapp"));
  const branchId = formText(formData, "branchId");
  const marketingConsent = formData.get("marketingConsent") === "on";

  if (!name || !/^\+?\d{9,15}$/.test(whatsapp) || !branchId) {
    redirect("/kasir?status=invalid-customer");
  }
  if (!(await db.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
    redirect("/kasir?status=invalid-customer");
  }
  requireBranchAccess(staff, branchId);
  const result = await registerCustomerRecord(name, whatsapp, branchId, marketingConsent);
  if (result.duplicate) {
    revalidatePath("/manajemen");
    redirect("/kasir?status=duplicate");
  }
  revalidatePath("/");
  revalidatePath("/kasir");
  revalidatePath("/pelanggan");
  redirect("/kasir?status=customer-created");
}

export async function recordTransaction(formData: FormData) {
  const staff = await requireStaff(["CASHIER", "MANAGER", "OWNER"]);
  const customerId = formText(formData, "customerId");
  const branchId = formText(formData, "branchId");
  const amount = Number(formText(formData, "amount"));
  const useStampDiscount = formData.get("useStampDiscount") === "on";
  if (!customerId || !branchId || !Number.isSafeInteger(amount) || amount <= 0) {
    redirect("/kasir?status=invalid-transaction");
  }
  requireBranchAccess(staff, branchId);

  const outcome = await recordTransactionRecord({ customerId, branchId, amount, useStampDiscount });
  if (!outcome) redirect("/kasir?status=customer-not-found");

  revalidatePath("/");
  revalidatePath("/kasir");
  revalidatePath("/portal");
  redirect(
    `/kasir?customer=${encodeURIComponent(customerId)}&status=${outcome.result}&discount=${outcome.discountAmount}&amount=${amount}`,
  );
}

export async function addStockItem(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const name = formText(formData, "name");
  const category = formText(formData, "category");
  const size = formText(formData, "size");
  const branchId = formText(formData, "branchId");
  if (!name || !category || !size || !branchId) redirect("/stok?status=invalid-stock");
  requireBranchAccess(staff, branchId);

  const matchCount = await db.$transaction(async (tx) => {
    const item = await tx.stockItem.create({
      data: { name, category, size, branchId },
    });
    await tx.stockUpdateLog.create({ data: { branchId, userId: staff.id } });
    return matchStockItem(tx, item);
  });

  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/portal");
  redirect(`/stok?status=stock-added&matches=${matchCount}`);
}

export async function markStockSold(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const stockId = formText(formData, "stockId");
  if (!stockId) redirect("/stok?status=invalid-stock-id");
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.stockItem.findUnique({ where: { id: stockId } });
    if (!existing) return "missing" as const;
    requireBranchAccess(staff, existing.branchId);
    if (existing.status === "SOLD") return "sold" as const;
    const updated = await tx.stockItem.updateMany({
      where: {
        id: stockId,
        status: "AVAILABLE",
        ...(staff.role === "OWNER" ? {} : { branchId: staff.branchId ?? "" }),
      },
      data: { status: "SOLD", soldAt: new Date() },
    });
    if (!updated.count) return "conflict" as const;
    await tx.stockUpdateLog.create({ data: { branchId: existing.branchId, userId: staff.id } });
    return "updated" as const;
  });
  if (result === "missing") redirect("/stok?status=invalid-stock-id");
  if (result === "sold") redirect("/stok?status=stock-already-sold");
  if (result === "conflict") redirect("/stok?status=stock-already-sold");
  revalidatePath("/");
  revalidatePath("/stok");
  redirect("/stok?status=stock-sold");
}

export async function updateStockItem(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const stockId = formText(formData, "stockId");
  const name = formText(formData, "name");
  const category = formText(formData, "category");
  const size = formText(formData, "size");
  const branchId = formText(formData, "branchId");
  if (!stockId || !name || !category || !size || !branchId) {
    redirect("/stok?status=invalid-stock");
  }
  requireBranchAccess(staff, branchId);
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.stockItem.findUnique({ where: { id: stockId } });
    if (!existing) return false;
    requireBranchAccess(staff, existing.branchId);
    const updated = await tx.stockItem.update({
      where: { id: stockId },
      data: { name, category, size, branchId },
    });
    const branchIds = [...new Set([existing.branchId, updated.branchId])];
    await tx.stockUpdateLog.createMany({ data: branchIds.map((id) => ({ branchId: id, userId: staff.id })) });
    await matchStockItem(tx, updated);
    return true;
  });
  if (!result) redirect("/stok?status=invalid-stock-id");
  revalidatePath("/");
  revalidatePath("/stok");
  redirect("/stok?status=stock-updated");
}

export async function createWishlist(formData: FormData) {
  const { customer } = await requireCustomerSession();
  const customerId = customer.id;
  const category = formText(formData, "category");
  const size = formText(formData, "size");
  const keyword = formText(formData, "keyword");
  if (!customerId || (!category && !size && !keyword)) {
    redirect("/portal?status=invalid-wishlist");
  }
  await db.$transaction(async (tx) => {
    const wishlist = await tx.wishlist.create({
      data: { customerId, category: category || null, size: size || null, keyword: keyword || null },
    });
    await matchWishlist(tx, wishlist);
  });
  revalidatePath("/portal");
  revalidatePath("/stok");
  redirect("/portal?tab=wishlist&status=wishlist-created");
}

export async function toggleWishlist(formData: FormData) {
  const { customer } = await requireCustomerSession();
  const wishlistId = formText(formData, "wishlistId");
  const active = formText(formData, "active") === "true";
  if (!wishlistId) redirect("/portal?status=invalid-wishlist-id");
  await db.$transaction(async (tx) => {
    const ownedWishlist = await tx.wishlist.findFirst({ where: { id: wishlistId, customerId: customer.id } });
    if (!ownedWishlist) redirect("/portal?status=invalid-wishlist-id");
    const wishlist = await tx.wishlist.update({ where: { id: wishlistId }, data: { active } });
    if (active) await matchWishlist(tx, wishlist);
  });
  revalidatePath("/portal");
  redirect("/portal?tab=wishlist");
}

export async function updateMessagePreference(formData: FormData) {
  const { customer } = await requireCustomerSession();
  const customerId = customer.id;
  const marketingConsent = formData.get("marketingConsent") === "on";
  if (!customerId) redirect("/portal?status=invalid-customer");
  await db.$transaction(async (tx) => {
    const updated = await setCustomerMarketingConsent(tx, customerId, marketingConsent, "CUSTOMER_PORTAL");
    if (!updated) redirect("/portal?status=invalid-customer");
    if (marketingConsent) {
      const wishlists = await tx.wishlist.findMany({ where: { customerId, active: true } });
      for (const wishlist of wishlists) await matchWishlist(tx, wishlist);
    }
  });
  revalidatePath("/portal");
  revalidatePath("/manajemen");
  redirect("/portal?tab=profil&status=preference-updated");
}

export async function updateCustomerProfile(formData: FormData) {
  const { customer } = await requireCustomerSession();
  const customerId = customer.id;
  const favoriteCategory = formText(formData, "favoriteCategory");
  const favoriteSize = formText(formData, "favoriteSize");
  const birthDateValue = formText(formData, "birthDate");
  const instagram = formText(formData, "instagram");
  if (!customerId) redirect("/portal?status=invalid-customer");
  const birthDate = birthDateValue ? new Date(`${birthDateValue}T00:00:00`) : null;
  if (birthDate && Number.isNaN(birthDate.getTime())) redirect("/portal?status=invalid-customer");
  await db.customer.update({
    where: { id: customerId },
    data: {
      favoriteCategory: favoriteCategory || null,
      favoriteSize: favoriteSize || null,
      birthDate,
      instagram: instagram || null,
    },
  });
  revalidatePath("/portal");
  redirect("/portal?tab=profil&status=preference-updated");
}

export async function createReminderTemplate(formData: FormData) {
  await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  const name = formText(formData, "name");
  const message = formText(formData, "message");
  const segment = formText(formData, "segment");
  if (!name || !message || !["ALL", "NEW", "PERSONAL"].includes(segment)) {
    redirect("/manajemen?status=invalid-template");
  }
  const scheduleValue = formText(formData, "schedule");
  await db.reminderTemplate.create({
    data: {
      name,
      message,
      segment,
      schedule: scheduleValue ? new Date(`${scheduleValue}:00+07:00`) : null,
    },
  });
  revalidatePath("/manajemen");
  redirect("/manajemen?status=template-created");
}

export async function sendReminderCampaign(formData: FormData) {
  await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  const templateId = formText(formData, "templateId");
  if (!templateId) redirect("/manajemen?status=invalid-template-id");
  const template = await db.reminderTemplate.findUnique({ where: { id: templateId } });
  if (!template || !template.active) redirect("/manajemen?status=template-not-found");
  const sentCount = await processDueReminders(templateId);
  revalidatePath("/");
  revalidatePath("/manajemen");
  redirect(`/manajemen?tab=reminder&status=campaign-sent&count=${sentCount}`);
}

export async function runReminderScheduler() {
  await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  const sentCount = await processDueReminders();
  revalidatePath("/");
  revalidatePath("/manajemen");
  redirect(`/manajemen?tab=reminder&status=campaign-sent&count=${sentCount}`);
}

export async function confirmStockToday(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const branchId = formText(formData, "branchId");
  if (!branchId || !(await db.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
    redirect("/stok?status=invalid-stock");
  }
  requireBranchAccess(staff, branchId);
  await confirmStockTodayRecord(branchId, staff.id);
  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/manajemen");
  redirect("/stok?status=stock-confirmed");
}

export async function beginPortalLogin(formData: FormData) {
  if (process.env.NODE_ENV === "production") redirect("/portal?status=login-unavailable");
  const whatsapp = normalizeWhatsApp(formText(formData, "whatsapp"));
  if (!/^\+?\d{9,15}$/.test(whatsapp)) redirect("/portal?status=invalid-phone");
  const customer = await db.customer.findUnique({ where: { whatsapp }, select: { id: true } });
  if (!customer) redirect("/portal?status=login-code-sent");
  const recentCode = await db.customerLoginCode.findFirst({
    where: { customerId: customer.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (recentCode) redirect(`/portal?login=verify&phone=${encodeURIComponent(whatsapp)}&status=login-code-sent`);
  const code = generateCustomerLoginCode();
  await db.customerLoginCode.updateMany({
    where: { customerId: customer.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await db.customerLoginCode.create({
    data: {
      customerId: customer.id,
      codeHash: await hashCustomerLoginCode(code),
      expiresAt: new Date(Date.now() + CUSTOMER_LOGIN_CODE_TTL),
    },
  });
  console.info(`Development-only portal code for customer ${customer.id}: ${code}`);
  redirect(`/portal?login=verify&phone=${encodeURIComponent(whatsapp)}&status=login-code-sent`);
}

export async function verifyPortalLogin(formData: FormData) {
  if (process.env.NODE_ENV === "production") redirect("/portal?status=login-unavailable");
  const whatsapp = normalizeWhatsApp(formText(formData, "whatsapp"));
  const code = formText(formData, "code");
  if (!/^\d{6}$/.test(code)) redirect(`/portal?login=verify&phone=${encodeURIComponent(whatsapp)}&status=login-failed`);
  const customer = await db.customer.findUnique({ where: { whatsapp }, select: { id: true } });
  const loginCode = customer ? await db.customerLoginCode.findFirst({
    where: {
      customerId: customer.id,
      attempts: { lt: 5 },
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  }) : null;
  if (!customer || !loginCode || !(await verifyCustomerLoginCode(code, loginCode.codeHash))) {
    if (loginCode) {
      await db.customerLoginCode.updateMany({
        where: { id: loginCode.id, attempts: { lt: 5 }, usedAt: null },
        data: { attempts: { increment: 1 } },
      });
    }
    redirect(`/portal?login=verify&phone=${encodeURIComponent(whatsapp)}&status=login-failed`);
  }
  const consumed = await db.customerLoginCode.updateMany({
    where: {
      id: loginCode.id,
      attempts: { lt: 5 },
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) redirect(`/portal?login=verify&phone=${encodeURIComponent(whatsapp)}&status=login-failed`);
  await createCustomerSession(customer.id);
  redirect("/portal?tab=beranda");
}

export async function logoutPortalCustomer() {
  await logoutCustomerSession();
  redirect("/portal");
}
