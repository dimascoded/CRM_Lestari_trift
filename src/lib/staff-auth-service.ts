import { createHash, randomBytes } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { db } from "./db";
import { STAFF_LOGIN_MAX_ATTEMPTS, STAFF_LOGIN_WINDOW_MINUTES } from "./business-rules";
import { STAFF_ROLES, type StaffRole } from "./staff-roles";
import { hashPassword, verifyPassword } from "./password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(32).toString("base64url"));

type LoginAttemptStore = Pick<Prisma.TransactionClient, "loginAttempt">;

function hashIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function windowStart(now: Date) {
  return new Date(now.getTime() - STAFF_LOGIN_WINDOW_MINUTES * 60_000);
}

async function isRateLimited(
  store: LoginAttemptStore,
  emailHash: string,
  ipHash: string | null,
  since: Date,
) {
  const [emailAttempts, ipAttempts] = await Promise.all([
    store.loginAttempt.count({ where: { emailHash, createdAt: { gte: since } } }),
    ipHash
      ? store.loginAttempt.count({ where: { ipHash, createdAt: { gte: since } } })
      : Promise.resolve(0),
  ]);
  return emailAttempts >= STAFF_LOGIN_MAX_ATTEMPTS || ipAttempts >= STAFF_LOGIN_MAX_ATTEMPTS;
}

export async function authenticateStaffRecord({
  email: emailInput,
  password,
  clientIp,
}: {
  email: string;
  password: string;
  clientIp: string | null;
}): Promise<User | null> {
  const email = emailInput.trim().toLowerCase();
  const validEmail = email.length <= 254 && EMAIL_PATTERN.test(email);
  const emailHash = hashIdentifier(`email:${email}`);
  const ipHash = clientIp ? hashIdentifier(`ip:${clientIp}`) : null;
  const now = new Date();
  const since = windowStart(now);

  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: since } } });

  const blocked = await isRateLimited(db, emailHash, ipHash, since);
  const user = validEmail ? await db.user.findUnique({ where: { email } }) : null;
  const passwordHash = user?.passwordHash ?? await DUMMY_PASSWORD_HASH;
  const passwordMatches = await verifyPassword(password.slice(0, 200), passwordHash);
  const validAccount =
    validEmail &&
    password.length > 0 &&
    password.length <= 200 &&
    user?.active === true &&
    Boolean(user.passwordHash) &&
    STAFF_ROLES.includes(user.role as StaffRole) &&
    passwordMatches;

  if (blocked || !validAccount || !user) {
    if (!blocked) {
      await db.$transaction(async (tx) => {
        if (await isRateLimited(tx, emailHash, ipHash, since)) return;
        await tx.loginAttempt.create({ data: { emailHash, ipHash, createdAt: now } });
      });
    }
    return null;
  }

  const cleared = await db.$transaction(async (tx) => {
    if (await isRateLimited(tx, emailHash, ipHash, since)) return false;
    await tx.loginAttempt.deleteMany({
      where: { OR: [{ emailHash }, ...(ipHash ? [{ ipHash }] : [])] },
    });
    return true;
  });
  return cleared ? user : null;
}
