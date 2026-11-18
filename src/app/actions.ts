"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordAuditEvent, writeAuditLog } from "@/lib/audit-service";
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
import {
  normalizeWhatsApp,
  ACQUISITION_CHANNELS,
  FOLLOWUP_NOTE_MAX_LENGTH,
  MESSAGE_CONSENT_TEXT,
  REDEMPTION_QA_NOTE_MAX_LENGTH,
  STOCK_CATEGORIES,
  STOCK_SIZES,
  SEGMENTS,
  TRANSACTION_VOID_REASON_MAX_LENGTH,
} from "@/lib/business-rules";
import { generateCustomerLoginCode, hashCustomerLoginCode, hashPassword, verifyCustomerLoginCode } from "@/lib/password";
import { authenticateStaffRecord } from "@/lib/staff-auth-service";
import { recordCashierConsentRecord, registerCustomerRecord, setCustomerMarketingConsent } from "@/lib/customer-service";
import { matchStockItem, matchWishlist } from "@/lib/wishlist-match";
import { processDueReminders } from "@/lib/reminders";
import { confirmStockTodayRecord } from "@/lib/stock-service";
import { recordTransactionRecord, voidTransactionRecord } from "@/lib/transaction-service";
import { featureEnabledForBranch, reminderEnabled, setBranchRolloutStageRecord } from "@/lib/rollout";
import { FOLLOWUP_QUEUES, markFollowedUpRecord } from "@/lib/followup-service";

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginStaff(formData: FormData) {
  const email = formText(formData, "email").toLowerCase();
  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const requestHeaders = await headers();
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = forwardedIp || requestHeaders.get("x-real-ip")?.trim() || null;
  const user = await authenticateStaffRecord({ email, password, clientIp });
  if (!user) redirect("/login?status=login-failed");
  await createStaffSession(user.id, user.branchId);
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
  const acquisitionChannel = formText(formData, "acquisitionChannel") || "DATANG_LANGSUNG";

  if (!name || !/^\+?\d{9,15}$/.test(whatsapp) || !branchId) {
    redirect("/kasir?status=invalid-customer");
  }
  if (!(await db.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
    redirect("/kasir?status=invalid-customer");
  }
  requireBranchAccess(staff, branchId);
  if (!(Object.keys(ACQUISITION_CHANNELS) as string[]).includes(acquisitionChannel)) {
    redirect("/kasir?status=invalid-customer");
  }
  const result = await registerCustomerRecord(name, whatsapp, branchId, marketingConsent, staff.id, acquisitionChannel);
  if (result.duplicate) {
    revalidatePath("/laporan");
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
  const stampOffered = formData.get("stampOffered") === "on";
  if (!customerId || !branchId || !Number.isSafeInteger(amount) || amount <= 0) {
    redirect("/kasir?status=invalid-transaction");
  }
  requireBranchAccess(staff, branchId);

  const outcome = await recordTransactionRecord({ customerId, branchId, amount, useStampDiscount, stampOffered });
  if (!outcome) redirect("/kasir?status=customer-not-found");

  revalidatePath("/");
  revalidatePath("/kasir");
  revalidatePath("/portal");
  redirect(
    `/kasir?customer=${encodeURIComponent(customerId)}&status=${outcome.result}&discount=${outcome.discountAmount}&amount=${amount}`,
  );
}

export async function voidTransaction(formData: FormData) {
  const staff = await requireStaff(["OWNER", "MANAGER"]);
  const transactionId = formText(formData, "transactionId");
  const reason = formText(formData, "reason");
  if (!transactionId || !reason || reason.length > TRANSACTION_VOID_REASON_MAX_LENGTH) {
    redirect("/kasir?status=invalid-transaction-void");
  }
  const transaction = await db.transaction.findUnique({
    where: { id: transactionId },
    select: { branchId: true, customerId: true },
  });
  if (!transaction) redirect("/kasir?status=transaction-not-found");
  requireBranchAccess(staff, transaction.branchId);

  const outcome = await voidTransactionRecord({ transactionId, userId: staff.id, reason });
  if (outcome === "invalid-reason") redirect("/kasir?status=invalid-transaction-void");
  if (outcome !== "voided") redirect(`/kasir?customer=${encodeURIComponent(transaction.customerId)}&status=transaction-${outcome}`);

  revalidatePath("/");
  revalidatePath("/kasir");
  revalidatePath("/laporan");
  revalidatePath("/portal");
  redirect(`/kasir?customer=${encodeURIComponent(transaction.customerId)}&status=transaction-voided`);
}

export async function updateCustomerRecord(formData: FormData) {
  const staff = await requireStaff(["OWNER", "MANAGER", "CASHIER"]);
  const customerId = formText(formData, "customerId");
  const name = formText(formData, "name");
  const whatsapp = normalizeWhatsApp(formText(formData, "whatsapp"));
  const favoriteCategory = formText(formData, "favoriteCategory");
  const favoriteSize = formText(formData, "favoriteSize");
  const birthDateValue = formText(formData, "birthDate");
  const instagram = formText(formData, "instagram");
  if (!customerId || !name || name.length > 100 || !/^\+?\d{9,15}$/.test(whatsapp)) {
    redirect("/pelanggan?status=invalid-customer");
  }
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, active: true, registeredAtId: true },
  });
  if (!customer) redirect("/pelanggan?status=customer-not-found");
  requireBranchAccess(staff, customer.registeredAtId);
  const birthDate = birthDateValue ? new Date(`${birthDateValue}T00:00:00+07:00`) : null;
  if (
    (birthDateValue && Number.isNaN(birthDate?.getTime())) ||
    favoriteCategory.length > 80 ||
    favoriteSize.length > 40 ||
    instagram.length > 100
  ) redirect(`/pelanggan/${encodeURIComponent(customerId)}?status=invalid-customer`);

  const duplicate = await db.customer.findUnique({ where: { whatsapp }, select: { id: true } });
  if (duplicate && duplicate.id !== customerId) {
    await db.duplicateCheckLog.create({
      data: { attemptedName: name, branchId: customer.registeredAtId, existingCustomerId: duplicate.id },
    });
    revalidatePath("/laporan");
    redirect(`/pelanggan/${encodeURIComponent(customerId)}?status=duplicate`);
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          name,
          whatsapp,
          ...(formData.has("favoriteCategory") ? { favoriteCategory: favoriteCategory || null } : {}),
          ...(formData.has("favoriteSize") ? { favoriteSize: favoriteSize || null } : {}),
          ...(formData.has("birthDate") ? { birthDate } : {}),
          ...(formData.has("instagram") ? { instagram: instagram || null } : {}),
        },
      });
      await writeAuditLog(tx, {
        userId: staff.id,
        action: "CUSTOMER_UPDATED",
        entity: "CUSTOMER",
        entityId: customerId,
        branchId: customer.registeredAtId,
        summary: "Data pelanggan diperbarui.",
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/pelanggan/${encodeURIComponent(customerId)}?status=duplicate`);
    }
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/pelanggan");
  revalidatePath("/kasir");
  revalidatePath("/portal");
  redirect(`/pelanggan/${encodeURIComponent(customerId)}?status=customer-updated`);
}

export async function recordCashierConsent(formData: FormData) {
  const staff = await requireStaff(["CASHIER", "MANAGER", "OWNER"]);
  const customerId = formText(formData, "customerId");
  if (formData.get("marketingConsent") !== "on" || formText(formData, "consentText") !== MESSAGE_CONSENT_TEXT) {
    redirect(`/kasir?customer=${encodeURIComponent(customerId)}&status=consent-required`);
  }
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, active: true, registeredAtId: true, optedOut: true },
  });
  if (!customer || !customer.active) redirect("/kasir?status=customer-not-found");
  requireBranchAccess(staff, customer.registeredAtId);
  if (customer.optedOut) redirect(`/kasir?customer=${encodeURIComponent(customerId)}&status=consent-opted-out`);
  const updated = await recordCashierConsentRecord({
    customerId,
    userId: staff.id,
    checked: true,
    consentText: MESSAGE_CONSENT_TEXT,
  });
  if (!updated) redirect(`/kasir?customer=${encodeURIComponent(customerId)}&status=consent-required`);
  revalidatePath("/kasir");
  revalidatePath("/pelanggan");
  revalidatePath(`/pelanggan/${customerId}`);
  redirect(`/kasir?customer=${encodeURIComponent(customerId)}&status=consent-recorded`);
}

export async function setCustomerActive(formData: FormData) {
  const staff = await requireStaff(["OWNER", "MANAGER"]);
  const customerId = formText(formData, "customerId");
  const activeValue = formText(formData, "active");
  if (!customerId || !["true", "false"].includes(activeValue)) redirect("/pelanggan?status=invalid-customer");
  const active = activeValue === "true";
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, active: true, registeredAtId: true },
  });
  if (!customer) redirect("/pelanggan?status=customer-not-found");
  requireBranchAccess(staff, customer.registeredAtId);
  if (customer.active === active) {
    redirect(`/pelanggan?archived=${active ? "0" : "1"}&status=customer-unchanged`);
  }

  await db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customerId }, data: { active } });
    if (!active) {
      await tx.customerSession.deleteMany({ where: { customerId } });
      await tx.customerLoginCode.deleteMany({ where: { customerId } });
    }
    await writeAuditLog(tx, {
      userId: staff.id,
      action: active ? "CUSTOMER_RESTORED" : "CUSTOMER_ARCHIVED",
      entity: "CUSTOMER",
      entityId: customerId,
      branchId: customer.registeredAtId,
      summary: active ? "Pelanggan dipulihkan." : "Pelanggan diarsipkan.",
    });
  });
  revalidatePath("/");
  revalidatePath("/pelanggan");
  revalidatePath("/kasir");
  revalidatePath("/portal");
  revalidatePath("/laporan");
  redirect(`/pelanggan?archived=${active ? "0" : "1"}&status=${active ? "customer-restored" : "customer-archived"}`);
}

export async function createStaffAccount(formData: FormData) {
  const staff = await requireStaff(["OWNER"]);
  const name = formText(formData, "name");
  const email = formText(formData, "email").toLowerCase();
  const role = formText(formData, "role");
  const requestedBranchId = formText(formData, "branchId");
  const passwordValue = formData.get("password");
  const confirmationValue = formData.get("passwordConfirm");
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const confirmation = typeof confirmationValue === "string" ? confirmationValue : "";
  if (
    !name ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]) ||
    password.length < 12 ||
    password.length > 200 ||
    password !== confirmation
  ) {
    redirect("/akun?status=invalid-staff");
  }
  if (
    role !== "OWNER" &&
    (!requestedBranchId || !(await db.branch.findUnique({ where: { id: requestedBranchId }, select: { id: true } })))
  ) {
    redirect("/akun?status=invalid-staff");
  }
  const branchId = role === "OWNER" ? null : requestedBranchId;
  const passwordHash = await hashPassword(password);
  try {
    await db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { name, email, role, branchId, passwordHash } });
      await writeAuditLog(tx, {
        userId: staff.id,
        action: "STAFF_ACCOUNT_CREATED",
        entity: "STAFF_ACCOUNT",
        entityId: created.id,
        branchId,
        summary: "Akun staf baru dibuat.",
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/akun?status=duplicate-staff-email");
    }
    throw error;
  }
  revalidatePath("/akun");
  redirect("/akun?status=staff-created");
}

export async function updateStaffAccount(formData: FormData) {
  const staff = await requireStaff(["OWNER"]);
  const userId = formText(formData, "userId");
  const name = formText(formData, "name");
  const email = formText(formData, "email").toLowerCase();
  const role = formText(formData, "role");
  const requestedBranchId = formText(formData, "branchId");
  const passwordValue = formData.get("password");
  const confirmationValue = formData.get("passwordConfirm");
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const confirmation = typeof confirmationValue === "string" ? confirmationValue : "";
  if (
    !userId ||
    !name ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]) ||
    (password && (password.length < 12 || password.length > 200 || password !== confirmation)) ||
    (!password && confirmation)
  ) {
    redirect("/akun?status=invalid-staff");
  }
  if (userId === staff.id && role !== "OWNER") redirect("/akun?status=staff-self-change-denied");
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing) redirect("/akun?status=staff-not-found");
  if (
    role !== "OWNER" &&
    (!requestedBranchId || !(await db.branch.findUnique({ where: { id: requestedBranchId }, select: { id: true } })))
  ) {
    redirect("/akun?status=invalid-staff");
  }
  const branchId = role === "OWNER" ? null : requestedBranchId;
  const duplicate = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (duplicate && duplicate.id !== userId) redirect("/akun?status=duplicate-staff-email");
  const passwordHash = password ? await hashPassword(password) : undefined;

  const result = await db.$transaction(async (tx) => {
    if (existing.role === "OWNER" && existing.active && role !== "OWNER") {
      const otherActiveOwners = await tx.user.count({ where: { id: { not: userId }, role: "OWNER", active: true } });
      if (!otherActiveOwners) return "last-owner" as const;
    }
    await tx.user.update({
      where: { id: userId },
      data: { name, email, role, branchId, ...(passwordHash ? { passwordHash } : {}) },
    });
    if (passwordHash) await tx.userSession.deleteMany({ where: { userId } });
    await writeAuditLog(tx, {
      userId: staff.id,
      action: "STAFF_ACCOUNT_UPDATED",
      entity: "STAFF_ACCOUNT",
      entityId: userId,
      branchId: branchId ?? existing.branchId,
      summary: "Akun staf diperbarui.",
    });
    return "updated" as const;
  });
  if (result === "last-owner") redirect("/akun?status=last-active-owner");
  revalidatePath("/akun");
  revalidatePath("/");
  if (passwordHash && userId === staff.id) redirect("/login?status=staff-password-updated");
  redirect("/akun?status=staff-updated");
}

export async function setStaffAccountActive(formData: FormData) {
  const staff = await requireStaff(["OWNER"]);
  const userId = formText(formData, "userId");
  const activeValue = formText(formData, "active");
  if (!userId || !["true", "false"].includes(activeValue)) redirect("/akun?status=invalid-staff");
  const active = activeValue === "true";
  if (userId === staff.id && !active) redirect("/akun?status=staff-self-change-denied");
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, active: true, branchId: true },
  });
  if (!existing) redirect("/akun?status=staff-not-found");
  if (existing.active === active) redirect("/akun?status=staff-unchanged");
  const result = await db.$transaction(async (tx) => {
    if (!active && existing.role === "OWNER") {
      const otherActiveOwners = await tx.user.count({ where: { id: { not: userId }, role: "OWNER", active: true } });
      if (!otherActiveOwners) return "last-owner" as const;
    }
    await tx.user.update({ where: { id: userId }, data: { active } });
    if (!active) await tx.userSession.deleteMany({ where: { userId } });
    await writeAuditLog(tx, {
      userId: staff.id,
      action: active ? "STAFF_ACCOUNT_ACTIVATED" : "STAFF_ACCOUNT_DEACTIVATED",
      entity: "STAFF_ACCOUNT",
      entityId: userId,
      branchId: existing.branchId,
      summary: active ? "Akun staf diaktifkan." : "Akun staf dinonaktifkan.",
    });
    return active ? "activated" as const : "deactivated" as const;
  });
  if (result === "last-owner") redirect("/akun?status=last-active-owner");
  revalidatePath("/akun");
  redirect(`/akun?status=staff-${result}`);
}

export async function addStockItem(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const name = formText(formData, "name");
  const category = formText(formData, "category");
  const size = formText(formData, "size");
  const branchId = formText(formData, "branchId");
  if (
    !name ||
    name.length > 100 ||
    !STOCK_CATEGORIES.includes(category as (typeof STOCK_CATEGORIES)[number]) ||
    !STOCK_SIZES.includes(size as (typeof STOCK_SIZES)[number]) ||
    !branchId
  ) redirect("/stok?status=invalid-stock");
  if (!(await db.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
    redirect("/stok?status=invalid-stock");
  }
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

export async function removeStockItem(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const stockId = formText(formData, "stockId");
  if (!stockId) redirect("/stok?status=invalid-stock-id");
  const result = await db.$transaction(async (tx) => {
    const item = await tx.stockItem.findUnique({ where: { id: stockId } });
    if (!item) return "missing" as const;
    requireBranchAccess(staff, item.branchId);
    if (item.status !== "AVAILABLE") return "unavailable" as const;
    const updated = await tx.stockItem.updateMany({
      where: {
        id: stockId,
        status: "AVAILABLE",
        ...(staff.role === "OWNER" ? {} : { branchId: staff.branchId ?? "" }),
      },
      data: { status: "REMOVED" },
    });
    if (!updated.count) return "conflict" as const;
    await tx.stockUpdateLog.create({ data: { branchId: item.branchId, userId: staff.id } });
    return "removed" as const;
  });
  if (result === "missing") redirect("/stok?status=invalid-stock-id");
  if (result !== "removed") redirect("/stok?status=stock-unavailable");
  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/portal");
  redirect("/stok?status=stock-removed");
}

export async function restoreStockItem(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const stockId = formText(formData, "stockId");
  if (!stockId) redirect("/stok?status=invalid-stock-id");
  const result = await db.$transaction(async (tx) => {
    const item = await tx.stockItem.findUnique({ where: { id: stockId } });
    if (!item) return "missing" as const;
    requireBranchAccess(staff, item.branchId);
    if (item.status !== "REMOVED") return "not-removed" as const;
    const updated = await tx.stockItem.updateMany({
      where: {
        id: stockId,
        status: "REMOVED",
        ...(staff.role === "OWNER" ? {} : { branchId: staff.branchId ?? "" }),
      },
      data: { status: "AVAILABLE" },
    });
    if (!updated.count) return "conflict" as const;
    await tx.stockUpdateLog.create({ data: { branchId: item.branchId, userId: staff.id } });
    await matchStockItem(tx, { ...item, status: "AVAILABLE" });
    return "restored" as const;
  });
  if (result === "missing") redirect("/stok?status=invalid-stock-id");
  if (result !== "restored") redirect("/stok?status=stock-not-removed");
  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/portal");
  redirect("/stok?status=stock-restored");
}

export async function updateStockItem(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const stockId = formText(formData, "stockId");
  const name = formText(formData, "name");
  const category = formText(formData, "category");
  const size = formText(formData, "size");
  const branchId = formText(formData, "branchId");
  if (
    !stockId ||
    !name ||
    name.length > 100 ||
    !STOCK_CATEGORIES.includes(category as (typeof STOCK_CATEGORIES)[number]) ||
    !STOCK_SIZES.includes(size as (typeof STOCK_SIZES)[number]) ||
    !branchId
  ) {
    redirect("/stok?status=invalid-stock");
  }
  if (!(await db.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
    redirect("/stok?status=invalid-stock");
  }
  requireBranchAccess(staff, branchId);
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.stockItem.findUnique({ where: { id: stockId } });
    if (!existing) return false;
    requireBranchAccess(staff, existing.branchId);
    if (existing.status !== "AVAILABLE") return false;
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
  const registeredCustomer = await db.customer.findUnique({
    where: { id: customerId },
    select: { registeredAt: { select: { rolloutStage: true } } },
  });
  if (!registeredCustomer || !featureEnabledForBranch("wishlist", registeredCustomer.registeredAt)) {
    redirect("/portal?tab=wishlist&status=rollout-feature-disabled");
  }
  const validCategory = !category || (STOCK_CATEGORIES as readonly string[]).includes(category);
  const validSize = !size || (STOCK_SIZES as readonly string[]).includes(size);
  if (!customerId || (!category && !size && !keyword) || !validCategory || !validSize || keyword.length > 80) {
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

export async function updateWishlist(formData: FormData) {
  const { customer } = await requireCustomerSession();
  const wishlistId = formText(formData, "wishlistId");
  const category = formText(formData, "category");
  const size = formText(formData, "size");
  const keyword = formText(formData, "keyword");
  const registeredCustomer = await db.customer.findUnique({
    where: { id: customer.id },
    select: { registeredAt: { select: { rolloutStage: true } } },
  });
  if (!registeredCustomer || !featureEnabledForBranch("wishlist", registeredCustomer.registeredAt)) {
    redirect("/portal?tab=wishlist&status=rollout-feature-disabled");
  }
  const validCategory = !category || (STOCK_CATEGORIES as readonly string[]).includes(category);
  const validSize = !size || (STOCK_SIZES as readonly string[]).includes(size);
  if (!wishlistId || (!category && !size && !keyword) || !validCategory || !validSize || keyword.length > 80) {
    redirect("/portal?tab=wishlist&status=invalid-wishlist");
  }
  const result = await db.$transaction(async (tx) => {
    const ownedWishlist = await tx.wishlist.findFirst({ where: { id: wishlistId, customerId: customer.id } });
    if (!ownedWishlist) return false;
    const wishlist = await tx.wishlist.update({
      where: { id: wishlistId },
      data: { category: category || null, size: size || null, keyword: keyword || null },
    });
    if (wishlist.active) await matchWishlist(tx, wishlist);
    return true;
  });
  if (!result) redirect("/portal?tab=wishlist&status=invalid-wishlist-id");
  revalidatePath("/portal");
  revalidatePath("/stok");
  redirect("/portal?tab=wishlist&status=wishlist-updated");
}

export async function deleteWishlist(formData: FormData) {
  const { customer } = await requireCustomerSession();
  const wishlistId = formText(formData, "wishlistId");
  if (!wishlistId) redirect("/portal?tab=wishlist&status=invalid-wishlist-id");
  const owned = await db.wishlist.findFirst({
    where: { id: wishlistId, customerId: customer.id },
    select: { customer: { select: { registeredAt: { select: { rolloutStage: true } } } } },
  });
  if (owned && !featureEnabledForBranch("wishlist", owned.customer.registeredAt)) {
    redirect("/portal?tab=wishlist&status=rollout-feature-disabled");
  }
  const deleted = await db.wishlist.deleteMany({ where: { id: wishlistId, customerId: customer.id } });
  if (!deleted.count) redirect("/portal?tab=wishlist&status=invalid-wishlist-id");
  revalidatePath("/portal");
  redirect("/portal?tab=wishlist&status=wishlist-deleted");
}

export async function toggleWishlist(formData: FormData) {
  const { customer } = await requireCustomerSession();
  const wishlistId = formText(formData, "wishlistId");
  const activeValue = formText(formData, "active");
  if (!wishlistId || !["true", "false"].includes(activeValue)) redirect("/portal?status=invalid-wishlist-id");
  const active = activeValue === "true";
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
  revalidatePath("/laporan");
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
  const staff = await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  const name = formText(formData, "name");
  const message = formText(formData, "message");
  const segment = formText(formData, "segment");
  const targetSegment = formText(formData, "targetSegment");
  const scheduleValue = formText(formData, "schedule");
  const schedule = scheduleValue ? new Date(`${scheduleValue}:00+07:00`) : null;
  if (
    !name ||
    name.length > 100 ||
    !message ||
    message.length > 1000 ||
    !["ALL", "NEW", "PERSONAL"].includes(segment) ||
    (targetSegment && !(Object.values(SEGMENTS) as string[]).includes(targetSegment)) ||
    (scheduleValue && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleValue) || !schedule || Number.isNaN(schedule.getTime())))
  ) {
    redirect("/pesan?tab=reminder&status=invalid-template");
  }
  await db.$transaction(async (tx) => {
    const template = await tx.reminderTemplate.create({
      data: { name, message, segment, schedule, targetSegment: targetSegment || null },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      userId: staff.id,
      action: "REMINDER_TEMPLATE_CREATED",
      entity: "REMINDER_TEMPLATE",
      entityId: template.id,
      summary: "Template reminder dibuat.",
    });
  });
  revalidatePath("/pesan");
  redirect("/pesan?tab=reminder&status=template-created");
}

export async function updateReminderTemplate(formData: FormData) {
  const staff = await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  const templateId = formText(formData, "templateId");
  const name = formText(formData, "name");
  const message = formText(formData, "message");
  const segment = formText(formData, "segment");
  const targetSegment = formText(formData, "targetSegment");
  const scheduleValue = formText(formData, "schedule");
  const schedule = scheduleValue ? new Date(`${scheduleValue}:00+07:00`) : null;
  if (
    !templateId ||
    !name ||
    name.length > 100 ||
    !message ||
    message.length > 1000 ||
    !["ALL", "NEW", "PERSONAL"].includes(segment) ||
    (targetSegment && !(Object.values(SEGMENTS) as string[]).includes(targetSegment)) ||
    (scheduleValue && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleValue) || !schedule || Number.isNaN(schedule.getTime())))
  ) {
    redirect("/pesan?tab=reminder&status=invalid-template");
  }
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.reminderTemplate.updateMany({
      where: { id: templateId },
      data: { name, message, segment, schedule, targetSegment: targetSegment || null },
    });
    if (result.count) {
      await writeAuditLog(tx, {
        userId: staff.id,
        action: "REMINDER_TEMPLATE_UPDATED",
        entity: "REMINDER_TEMPLATE",
        entityId: templateId,
        summary: "Template reminder diperbarui.",
      });
    }
    return result;
  });
  if (!updated.count) redirect("/pesan?tab=reminder&status=template-not-found");
  revalidatePath("/pesan");
  redirect("/pesan?tab=reminder&status=template-updated");
}

export async function updateStockNotificationTemplate(formData: FormData) {
  const staff = await requireStaff();
  const message = formText(formData, "message");
  if (!message || message.length > 500) redirect("/pesan?tab=notifikasi&status=invalid-stock-notification-template");
  await db.$transaction(async (tx) => {
    await tx.stockNotificationTemplate.upsert({
      where: { id: "wishlist" },
      update: { message },
      create: { id: "wishlist", message },
    });
    await writeAuditLog(tx, {
      userId: staff.id,
      action: "STOCK_NOTIFICATION_TEMPLATE_UPDATED",
      entity: "STOCK_NOTIFICATION_TEMPLATE",
      entityId: "wishlist",
      summary: "Template notifikasi wishlist diperbarui.",
    });
  });
  revalidatePath("/pesan");
  revalidatePath("/stok");
  revalidatePath("/portal");
  redirect("/pesan?tab=notifikasi&status=stock-notification-template-updated");
}

export async function setReminderTemplateActive(formData: FormData) {
  const staff = await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  if (!(await reminderEnabled())) redirect("/pesan?tab=reminder&status=rollout-feature-disabled");
  const templateId = formText(formData, "templateId");
  const activeValue = formText(formData, "active");
  if (!templateId || !["true", "false"].includes(activeValue)) {
    redirect("/pesan?tab=reminder&status=invalid-template-id");
  }
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.reminderTemplate.updateMany({
      where: { id: templateId },
      data: { active: activeValue === "true" },
    });
    if (result.count) {
      await writeAuditLog(tx, {
        userId: staff.id,
        action: activeValue === "true" ? "REMINDER_TEMPLATE_ACTIVATED" : "REMINDER_TEMPLATE_DEACTIVATED",
        entity: "REMINDER_TEMPLATE",
        entityId: templateId,
        summary: activeValue === "true" ? "Template reminder diaktifkan." : "Template reminder dinonaktifkan.",
      });
    }
    return result;
  });
  if (!updated.count) redirect("/pesan?tab=reminder&status=template-not-found");
  revalidatePath("/pesan");
  redirect(`/pesan?tab=reminder&status=${activeValue === "true" ? "template-activated" : "template-deactivated"}`);
}

export async function deleteReminderTemplate(formData: FormData) {
  const staff = await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  const templateId = formText(formData, "templateId");
  if (!templateId) redirect("/pesan?tab=reminder&status=invalid-template-id");
  const result = await db.$transaction(async (tx) => {
    const template = await tx.reminderTemplate.findUnique({ where: { id: templateId }, select: { id: true } });
    if (!template) return "missing" as const;
    if (await tx.reminderLog.count({ where: { templateId } })) return "history" as const;
    await tx.reminderTemplate.delete({ where: { id: templateId } });
    await writeAuditLog(tx, {
      userId: staff.id,
      action: "REMINDER_TEMPLATE_DELETED",
      entity: "REMINDER_TEMPLATE",
      entityId: templateId,
      summary: "Template reminder dihapus karena belum memiliki riwayat.",
    });
    return "deleted" as const;
  });
  if (result === "missing") redirect("/pesan?tab=reminder&status=template-not-found");
  if (result === "history") redirect("/pesan?tab=reminder&status=template-has-history");
  revalidatePath("/pesan");
  redirect("/pesan?tab=reminder&status=template-deleted");
}

export async function sendReminderCampaign(formData: FormData) {
  const staff = await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  if (!(await reminderEnabled())) redirect("/pesan?tab=reminder&status=rollout-feature-disabled");
  const templateId = formText(formData, "templateId");
  if (!templateId) redirect("/pesan?tab=reminder&status=invalid-template-id");
  const template = await db.reminderTemplate.findUnique({ where: { id: templateId } });
  if (!template || !template.active) redirect("/pesan?tab=reminder&status=template-not-found");
  const sentCount = await processDueReminders(templateId);
  await recordAuditEvent({
    userId: staff.id,
    action: "REMINDER_CAMPAIGN_RUN",
    entity: "REMINDER_TEMPLATE",
    entityId: templateId,
    summary: `Kampanye simulasi dijalankan; catatan dibuat: ${sentCount}.`,
  });
  revalidatePath("/");
  revalidatePath("/pesan");
  redirect(`/pesan?tab=reminder&status=campaign-sent&count=${sentCount}`);
}

export async function runReminderScheduler() {
  const staff = await requireStaff(["OWNER", "MANAGER", "MARKETING"]);
  if (!(await reminderEnabled())) redirect("/pesan?tab=reminder&status=rollout-feature-disabled");
  const sentCount = await processDueReminders();
  await recordAuditEvent({
    userId: staff.id,
    action: "REMINDER_SCHEDULER_RUN",
    entity: "REMINDER_SCHEDULER",
    summary: `Scheduler simulasi dijalankan; catatan dibuat: ${sentCount}.`,
  });
  revalidatePath("/");
  revalidatePath("/pesan");
  redirect(`/pesan?tab=reminder&status=campaign-sent&count=${sentCount}`);
}

export async function confirmStockToday(formData: FormData) {
  const staff = await requireStaff(["STOCK_STAFF", "MANAGER", "OWNER"]);
  const branchId = formText(formData, "branchId");
  const countedItems = Number(formText(formData, "countedItems"));
  if (!branchId || !(await db.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
    redirect("/stok?status=invalid-stock");
  }
  if (!Number.isSafeInteger(countedItems) || countedItems < 0) redirect("/stok?status=invalid-stock-count");
  requireBranchAccess(staff, branchId);
  const log = await confirmStockTodayRecord(branchId, countedItems, staff.id);
  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/laporan");
  redirect(`/stok?status=${countedItems === log.systemCount ? "stock-confirmed" : "stock-count-mismatch"}&detail=${log.systemCount}`);
}

export async function recordRedemptionQaCheck(formData: FormData) {
  const staff = await requireStaff(["OWNER", "MANAGER"]);
  const branchId = formText(formData, "branchId");
  const passedValue = formText(formData, "passed");
  const note = formText(formData, "note");
  if (!branchId || !["true", "false"].includes(passedValue) || note.length > REDEMPTION_QA_NOTE_MAX_LENGTH) {
    redirect("/laporan?tab=qa&status=invalid-qa-check");
  }
  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) redirect("/laporan?tab=qa&status=invalid-qa-check");
  requireBranchAccess(staff, branchId);
  await db.$transaction(async (tx) => {
    const check = await tx.redemptionQaCheck.create({
      data: { branchId, userId: staff.id, passed: passedValue === "true", note },
    });
    await writeAuditLog(tx, {
      userId: staff.id,
      action: "REDEMPTION_QA_RECORDED",
      entity: "REDEMPTION_QA_CHECK",
      entityId: check.id,
      branchId,
      summary: `Uji tukar stamp ${passedValue === "true" ? "lulus" : "gagal"} dicatat.`,
    });
  });
  revalidatePath("/laporan");
  revalidatePath("/");
  redirect("/laporan?tab=qa&status=qa-check-recorded");
}

export async function setBranchRolloutStage(formData: FormData) {
  const staff = await requireStaff(["OWNER"]);
  const branchId = formText(formData, "branchId");
  const stage = Number(formText(formData, "rolloutStage"));
  if (!branchId || !Number.isInteger(stage) || stage < 1 || stage > 3) {
    redirect("/strategi?status=invalid-rollout-stage");
  }
  const branch = await setBranchRolloutStageRecord({
    branchId,
    rolloutStage: stage,
    userId: staff.id,
    userRole: staff.role,
  });
  if (!branch) redirect("/strategi?status=branch-not-found");
  revalidatePath("/strategi");
  revalidatePath("/");
  revalidatePath("/pesan");
  redirect("/strategi?status=rollout-stage-updated");
}

export async function markFollowedUp(formData: FormData) {
  const staff = await requireStaff();
  const customerId = formText(formData, "customerId");
  const queue = formText(formData, "queue");
  const note = formText(formData, "note");
  if (!customerId || !FOLLOWUP_QUEUES.includes(queue as (typeof FOLLOWUP_QUEUES)[number]) || note.length > FOLLOWUP_NOTE_MAX_LENGTH) {
    redirect("/pesan?tab=antrean&status=invalid-followup");
  }
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { active: true, registeredAtId: true },
  });
  if (!customer?.active) redirect("/pesan?tab=antrean&status=customer-not-found");
  requireBranchAccess(staff, customer.registeredAtId);
  await markFollowedUpRecord({
    customerId,
    userId: staff.id,
    branchId: customer.registeredAtId,
    queue,
    note,
  });
  revalidatePath("/pesan");
  revalidatePath("/pelanggan");
  revalidatePath(`/pelanggan/${customerId}`);
  redirect("/pesan?tab=antrean&status=followup-recorded");
}

export async function beginPortalLogin(formData: FormData) {
  if (process.env.NODE_ENV === "production") redirect("/portal?status=login-unavailable");
  const whatsapp = normalizeWhatsApp(formText(formData, "whatsapp"));
  if (!/^\+?\d{9,15}$/.test(whatsapp)) redirect("/portal?status=invalid-phone");
  const customer = await db.customer.findUnique({ where: { whatsapp, active: true }, select: { id: true } });
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
  const customer = await db.customer.findUnique({ where: { whatsapp, active: true }, select: { id: true } });
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
