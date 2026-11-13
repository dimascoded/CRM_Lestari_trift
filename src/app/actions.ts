"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  normalizeWhatsApp,
} from "@/lib/business-rules";
import { registerCustomerRecord } from "@/lib/customer-service";
import { matchStockItem, matchWishlist } from "@/lib/wishlist-match";
import { processDueReminders } from "@/lib/reminders";
import { confirmStockTodayRecord } from "@/lib/stock-service";
import { recordTransactionRecord } from "@/lib/transaction-service";

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function registerCustomer(formData: FormData) {
  const name = formText(formData, "name");
  const whatsapp = normalizeWhatsApp(formText(formData, "whatsapp"));
  const branchId = formText(formData, "branchId");

  if (!name || !/^\+?\d{9,15}$/.test(whatsapp) || !branchId) {
    redirect("/kasir?status=invalid-customer");
  }
  const result = await registerCustomerRecord(name, whatsapp, branchId);
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
  const customerId = formText(formData, "customerId");
  const branchId = formText(formData, "branchId");
  const amount = Number(formText(formData, "amount"));
  const useStampDiscount = formData.get("useStampDiscount") === "on";
  if (!customerId || !branchId || !Number.isSafeInteger(amount) || amount <= 0) {
    redirect("/kasir?status=invalid-transaction");
  }

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
  const name = formText(formData, "name");
  const category = formText(formData, "category");
  const size = formText(formData, "size");
  const branchId = formText(formData, "branchId");
  if (!name || !category || !size || !branchId) redirect("/stok?status=invalid-stock");

  const matchCount = await db.$transaction(async (tx) => {
    const item = await tx.stockItem.create({
      data: { name, category, size, branchId },
    });
    await tx.stockUpdateLog.create({ data: { branchId } });
    return matchStockItem(tx, item);
  });

  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/portal");
  redirect(`/stok?status=stock-added&matches=${matchCount}`);
}

export async function markStockSold(formData: FormData) {
  const stockId = formText(formData, "stockId");
  if (!stockId) redirect("/stok?status=invalid-stock-id");
  const existing = await db.stockItem.findUnique({ where: { id: stockId } });
  if (!existing) redirect("/stok?status=invalid-stock-id");
  if (existing.status === "SOLD") redirect("/stok?status=stock-already-sold");
  const item = await db.stockItem.update({
    where: { id: stockId },
    data: { status: "SOLD", soldAt: new Date() },
  });
  await db.stockUpdateLog.create({ data: { branchId: item.branchId } });
  revalidatePath("/");
  revalidatePath("/stok");
  redirect("/stok?status=stock-sold");
}

export async function updateStockItem(formData: FormData) {
  const stockId = formText(formData, "stockId");
  const name = formText(formData, "name");
  const category = formText(formData, "category");
  const size = formText(formData, "size");
  const branchId = formText(formData, "branchId");
  if (!stockId || !name || !category || !size || !branchId) {
    redirect("/stok?status=invalid-stock");
  }
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.stockItem.findUnique({ where: { id: stockId } });
    if (!existing) return false;
    const updated = await tx.stockItem.update({
      where: { id: stockId },
      data: { name, category, size, branchId },
    });
    const branchIds = [...new Set([existing.branchId, updated.branchId])];
    await tx.stockUpdateLog.createMany({ data: branchIds.map((id) => ({ branchId: id })) });
    await matchStockItem(tx, updated);
    return true;
  });
  if (!result) redirect("/stok?status=invalid-stock-id");
  revalidatePath("/");
  revalidatePath("/stok");
  redirect("/stok?status=stock-updated");
}

export async function createWishlist(formData: FormData) {
  const customerId = formText(formData, "customerId");
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
  const wishlistId = formText(formData, "wishlistId");
  const active = formText(formData, "active") === "true";
  if (!wishlistId) redirect("/portal?status=invalid-wishlist-id");
  await db.$transaction(async (tx) => {
    const wishlist = await tx.wishlist.update({ where: { id: wishlistId }, data: { active } });
    if (active) await matchWishlist(tx, wishlist);
  });
  revalidatePath("/portal");
  redirect("/portal?tab=wishlist");
}

export async function updateMessagePreference(formData: FormData) {
  const customerId = formText(formData, "customerId");
  const optedOut = formText(formData, "optedOut") === "true";
  if (!customerId) redirect("/portal?status=invalid-customer");
  await db.customer.update({ where: { id: customerId }, data: { optedOut } });
  revalidatePath("/portal");
  revalidatePath("/manajemen");
  redirect("/portal?tab=profil&status=preference-updated");
}

export async function updateCustomerProfile(formData: FormData) {
  const customerId = formText(formData, "customerId");
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
  const sentCount = await processDueReminders();
  revalidatePath("/");
  revalidatePath("/manajemen");
  redirect(`/manajemen?tab=reminder&status=campaign-sent&count=${sentCount}`);
}

export async function confirmStockToday(formData: FormData) {
  const branchId = formText(formData, "branchId");
  if (!branchId || !(await db.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
    redirect("/stok?status=invalid-stock");
  }
  await confirmStockTodayRecord(branchId);
  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/manajemen");
  redirect("/stok?status=stock-confirmed");
}

export async function setActiveRole(formData: FormData) {
  const role = formText(formData, "role");
  if (!["kasir", "stok", "manajer", "marketing", "pemilik"].includes(role)) {
    redirect("/?status=invalid-role");
  }
  const cookieStore = await cookies();
  cookieStore.set("role", role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export async function beginPortalLogin(formData: FormData) {
  const whatsapp = normalizeWhatsApp(formText(formData, "whatsapp"));
  if (!/^\+?\d{9,15}$/.test(whatsapp)) redirect("/portal?status=invalid-phone");
  const customer = await db.customer.findUnique({ where: { whatsapp }, select: { id: true } });
  if (!customer) redirect("/portal?status=customer-not-found");
  redirect(`/portal?login=verify&phone=${encodeURIComponent(whatsapp)}`);
}

export async function verifyPortalLogin(formData: FormData) {
  const whatsapp = normalizeWhatsApp(formText(formData, "whatsapp"));
  const code = formText(formData, "code");
  if (code !== "123456") redirect(`/portal?login=verify&phone=${encodeURIComponent(whatsapp)}&status=login-failed`);
  const customer = await db.customer.findUnique({ where: { whatsapp }, select: { id: true } });
  if (!customer) redirect("/portal?status=customer-not-found");
  const cookieStore = await cookies();
  cookieStore.set("customerId", customer.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/portal?tab=beranda");
}

export async function logoutPortalCustomer() {
  const cookieStore = await cookies();
  cookieStore.delete("customerId");
  redirect("/portal");
}
