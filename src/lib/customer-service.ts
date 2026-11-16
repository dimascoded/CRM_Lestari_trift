import { Prisma } from "@prisma/client";
import { db } from "./db";
import { MESSAGE_CONSENT_POLICY_VERSION, MESSAGE_CONSENT_TEXT } from "./business-rules";

export async function registerCustomerRecord(
  name: string,
  whatsapp: string,
  branchId: string,
  marketingConsent = false,
) {
  const duplicate = await db.customer.findUnique({ where: { whatsapp } });
  if (duplicate) {
    await db.duplicateCheckLog.create({
      data: { attemptedName: name, branchId, existingCustomerId: duplicate.id },
    });
    return { duplicate: true as const };
  }
  try {
    const customer = await db.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { name, whatsapp, registeredAtId: branchId, marketingConsent },
      });
      await tx.messageConsent.create({
        data: {
          customerId: created.id,
          status: marketingConsent ? "GRANTED" : "DECLINED",
          source: "CASHIER_REGISTRATION",
          policyVersion: MESSAGE_CONSENT_POLICY_VERSION,
          consentText: MESSAGE_CONSENT_TEXT,
        },
      });
      return created;
    });
    return { duplicate: false as const, customer };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await db.customer.findUnique({ where: { whatsapp } });
    if (!existing) throw error;
    await db.duplicateCheckLog.create({
      data: { attemptedName: name, branchId, existingCustomerId: existing.id },
    });
    return { duplicate: true as const };
  }
}

export async function setCustomerMarketingConsent(
  tx: Prisma.TransactionClient,
  customerId: string,
  marketingConsent: boolean,
  source: string,
) {
  const current = await tx.customer.findUnique({ where: { id: customerId }, select: { marketingConsent: true } });
  if (!current) return null;
  const updated = await tx.customer.update({
    where: { id: customerId },
    data: {
      marketingConsent,
      optedOut: marketingConsent ? false : current.marketingConsent ? true : undefined,
    },
  });
  await tx.messageConsent.create({
    data: {
      customerId,
      status: marketingConsent ? "GRANTED" : current.marketingConsent ? "REVOKED" : "DECLINED",
      source,
      policyVersion: MESSAGE_CONSENT_POLICY_VERSION,
      consentText: MESSAGE_CONSENT_TEXT,
    },
  });
  return updated;
}
