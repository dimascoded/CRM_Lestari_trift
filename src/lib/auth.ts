import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Customer, User } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit-service";
import { STAFF_ROLES, type StaffRole } from "./staff-roles";

const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;

export { STAFF_ROLES, type StaffRole } from "./staff-roles";
const STAFF_HOME: Record<StaffRole, string> = {
  CASHIER: "/kasir",
  STOCK_STAFF: "/stok",
  MANAGER: "/",
  MARKETING: "/manajemen",
  OWNER: "/",
};

export type StaffSession = {
  id: string;
  user: User;
};

export type CustomerSession = {
  id: string;
  customer: Customer;
};

function staffCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-lestari-staff" : "lestari-staff";
}

function customerCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-lestari-customer" : "lestari-customer";
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createStaffSession(userId: string, branchId: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + STAFF_SESSION_TTL_MS);
  const session = await db.$transaction(async (tx) => {
    const created = await tx.userSession.create({
      data: { userId, tokenHash: hashSessionToken(token), expiresAt },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      userId,
      action: "STAFF_LOGIN",
      entity: "STAFF_SESSION",
      entityId: created.id,
      branchId,
      summary: "Staf berhasil masuk.",
    });
    return created;
  });
  const cookieStore = await cookies();
  cookieStore.set(staffCookieName(), token, cookieOptions(expiresAt));
  return session;
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(staffCookieName())?.value;
  if (!token) return null;

  const session = await db.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.user.active ||
    !session.user.passwordHash ||
    !STAFF_ROLES.includes(session.user.role as StaffRole)
  ) {
    return null;
  }
  return { id: session.id, user: session.user };
}

export async function requireStaff(allowedRoles?: readonly StaffRole[]) {
  const session = await getStaffSession();
  if (!session) throw new Error("Unauthorized.");
  if (!STAFF_ROLES.includes(session.user.role as StaffRole)) throw new Error("Forbidden.");
  if (allowedRoles && !allowedRoles.includes(session.user.role as StaffRole)) {
    throw new Error("Forbidden.");
  }
  return session.user;
}

export async function requireStaffPage(allowedRoles?: readonly StaffRole[]) {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  const role = session.user.role as StaffRole;
  if (!STAFF_ROLES.includes(role)) redirect("/login");
  if (allowedRoles && !allowedRoles.includes(role)) redirect(STAFF_HOME[role]);
  return session.user;
}

export function staffHomePath(role: string) {
  return STAFF_ROLES.includes(role as StaffRole) ? STAFF_HOME[role as StaffRole] : "/login";
}

export function requireBranchAccess(user: User, branchId: string) {
  if (user.role !== "OWNER" && user.branchId !== branchId) {
    throw new Error("Forbidden: branch access denied.");
  }
}

export async function logoutStaffSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(staffCookieName())?.value;
  if (token) {
    const session = await db.userSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: { id: true, userId: true, user: { select: { branchId: true } } },
    });
    if (session) {
      await db.$transaction(async (tx) => {
        await tx.userSession.deleteMany({ where: { id: session.id } });
        await writeAuditLog(tx, {
          userId: session.userId,
          action: "STAFF_LOGOUT",
          entity: "STAFF_SESSION",
          entityId: session.id,
          branchId: session.user.branchId,
          summary: "Staf keluar.",
        });
      });
    }
  }
  cookieStore.delete(staffCookieName());
}

export async function createCustomerSession(customerId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_MS);
  await db.customerSession.create({
    data: { customerId, tokenHash: hashSessionToken(token), expiresAt },
  });
  const cookieStore = await cookies();
  cookieStore.set(customerCookieName(), token, cookieOptions(expiresAt));
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(customerCookieName())?.value;
  if (!token) return null;

  const session = await db.customerSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { customer: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.customer.active) {
    return null;
  }
  return { id: session.id, customer: session.customer };
}

export async function requireCustomerSession() {
  const session = await getCustomerSession();
  if (!session) throw new Error("Unauthorized.");
  return session;
}

export async function logoutCustomerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(customerCookieName())?.value;
  if (token) {
    await db.customerSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  cookieStore.delete(customerCookieName());
}

export const CUSTOMER_LOGIN_CODE_TTL = LOGIN_CODE_TTL_MS;
