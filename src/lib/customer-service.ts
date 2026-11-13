import { Prisma } from "@prisma/client";
import { db } from "./db";

export async function registerCustomerRecord(name: string, whatsapp: string, branchId: string) {
  const duplicate = await db.customer.findUnique({ where: { whatsapp } });
  if (duplicate) {
    await db.duplicateCheckLog.create({
      data: { attemptedName: name, branchId, existingCustomerId: duplicate.id },
    });
    return { duplicate: true as const };
  }
  try {
    const customer = await db.customer.create({ data: { name, whatsapp, registeredAtId: branchId } });
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
