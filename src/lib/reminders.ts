import type { Customer, ReminderTemplate, Transaction } from "@prisma/client";
import { db } from "./db";
import {
  daysBefore,
  REMINDER_COOLDOWN_DAYS,
  REMINDER_GRACE_DAYS,
  REMINDER_HISTORY_SIZE,
  REMINDER_LEAD_DAYS,
} from "./business-rules";

type ReminderCustomer = Customer & { transactions: Pick<Transaction, "createdAt">[] };

function renderMessage(message: string, customer: Customer) {
  return message.replaceAll("{nama}", customer.name.trim().split(/\s+/)[0] ?? customer.name);
}

function personalSchedule(transactions: Pick<Transaction, "createdAt">[], now: Date) {
  if (transactions.length < 3) return null;
  const chronological = [...transactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const gaps = chronological.slice(1).map((transaction, index) =>
    (transaction.createdAt.getTime() - chronological[index].createdAt.getTime()) / 86400000,
  );
  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const expected = new Date(chronological[chronological.length - 1].createdAt.getTime() + averageGap * 86400000);
  const earliest = new Date(expected.getTime() - REMINDER_LEAD_DAYS * 86400000);
  const latest = new Date(expected.getTime() + REMINDER_GRACE_DAYS * 86400000);
  if (now < earliest || now > latest) return null;
  return new Date(expected.getTime() - REMINDER_LEAD_DAYS * 86400000);
}

async function customersForTemplate(template: ReminderTemplate, now: Date) {
  const cooldown = daysBefore(REMINDER_COOLDOWN_DAYS, now);
  const where = {
    optedOut: false,
    reminderLogs: { none: { sentAt: { gte: cooldown } } },
    ...(template.segment === "NEW" ? { transactions: { none: {} } } : {}),
  };
  if (template.segment !== "PERSONAL") {
    return db.customer.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
  }

  const customers = await db.customer.findMany({
    where,
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: REMINDER_HISTORY_SIZE,
        select: { createdAt: true },
      },
    },
  }) as ReminderCustomer[];
  return customers.filter((customer) => personalSchedule(customer.transactions, now) !== null);
}

export async function processDueReminders(templateId?: string) {
  const now = new Date();
  const templates = await db.reminderTemplate.findMany({
    where: { active: true, ...(templateId ? { id: templateId } : {}) },
  });
  let sent = 0;
  for (const template of templates) {
    if (template.segment !== "PERSONAL" && template.schedule && template.schedule > now) continue;
    const dueCustomers = await customersForTemplate(template, now);
    if (!dueCustomers.length) continue;

    sent += await db.$transaction(async (tx) => {
      const cooldown = daysBefore(REMINDER_COOLDOWN_DAYS, now);
      const eligible = await tx.customer.findMany({
        where: {
          id: { in: dueCustomers.map(({ id }) => id) },
          optedOut: false,
          reminderLogs: { none: { sentAt: { gte: cooldown } } },
          ...(template.segment === "NEW" ? { transactions: { none: {} } } : {}),
        },
        include: template.segment === "PERSONAL"
          ? {
              transactions: {
                orderBy: { createdAt: "desc" },
                take: REMINDER_HISTORY_SIZE,
                select: { createdAt: true },
              },
            }
          : undefined,
      });
      const rows = eligible.flatMap((customer) => {
        const scheduledFor = template.segment === "PERSONAL"
          ? personalSchedule((customer as ReminderCustomer).transactions, now)
          : template.schedule ?? now;
        if (!scheduledFor) return [];
        return [{
          customerId: customer.id,
          templateId: template.id,
          body: renderMessage(template.message, customer),
          scheduledFor,
          sentAt: now,
          status: "SENT",
        }];
      });
      if (!rows.length) return 0;
      const created = await tx.reminderLog.createMany({ data: rows });
      return created.count;
    });
  }
  return sent;
}
