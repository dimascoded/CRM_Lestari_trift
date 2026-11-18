import type { Customer, ReminderTemplate, Transaction } from "@prisma/client";
import { db } from "./db";
import {
  daysBefore,
  REMINDER_COOLDOWN_DAYS,
  REMINDER_GRACE_DAYS,
  REMINDER_HISTORY_SIZE,
  REMINDER_LEAD_DAYS,
  REMINDER_SEND_HOUR_JAKARTA,
  SEGMENT_WINDOW_DAYS,
  SEGMENTS,
} from "./business-rules";
import { SIMULATED_SENT_STATUS } from "./message-status";
import { getCustomerSegment } from "./segment-service";
import { reminderEnabled } from "./rollout";

type ReminderCustomer = Customer & { transactions: Pick<Transaction, "createdAt">[] };

function renderMessage(message: string, customer: Customer) {
  return message.replaceAll("{nama}", customer.name.trim().split(/\s+/)[0] ?? customer.name);
}

export function personalSchedule(transactions: Pick<Transaction, "createdAt">[], now: Date) {
  if (transactions.length < 3) return null;
  const chronological = [...transactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const gaps = chronological.slice(1).map((transaction, index) =>
    (transaction.createdAt.getTime() - chronological[index].createdAt.getTime()) / 86400000,
  );
  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const expected = new Date(chronological[chronological.length - 1].createdAt.getTime() + averageGap * 86400000);
  const latest = new Date(expected.getTime() + REMINDER_GRACE_DAYS * 86400000);
  const expectedDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(expected);
  const parts = Object.fromEntries(expectedDay.map(({ type, value }) => [type, value]));
  const scheduledFor = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) - REMINDER_LEAD_DAYS,
    REMINDER_SEND_HOUR_JAKARTA - 7,
  ));
  if (now < scheduledFor || now > latest) return null;
  return scheduledFor;
}

async function customersForTemplate(template: ReminderTemplate, now: Date) {
  const cooldown = daysBefore(REMINDER_COOLDOWN_DAYS, now);
  const where = {
    active: true,
    optedOut: false,
    marketingConsent: true,
    reminderLogs: { none: { sentAt: { gte: cooldown } } },
    stockNotifications: { none: { sentAt: { gte: cooldown } } },
    ...(template.segment === "NEW" ? { transactions: { none: { voidRecord: null } } } : {}),
  };
  if (template.segment !== "PERSONAL") {
    const customers = await db.customer.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    return filterTargetSegment(customers, template.targetSegment, now);
  }

  const customers = await db.customer.findMany({
    where,
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: REMINDER_HISTORY_SIZE,
        where: { voidRecord: null },
        select: { createdAt: true },
      },
    },
  }) as ReminderCustomer[];
  return filterTargetSegment(
    customers.filter((customer) => personalSchedule(customer.transactions, now) !== null),
    template.targetSegment,
    now,
  );
}

async function filterTargetSegment<T extends Customer>(customers: T[], targetSegment: string | null, now: Date) {
  if (!targetSegment) return customers;
  const cutoff = daysBefore(SEGMENT_WINDOW_DAYS, now);
  const details = await db.customer.findMany({
    where: { id: { in: customers.map(({ id }) => id) } },
    select: {
      id: true,
      transactions: { where: { voidRecord: null, createdAt: { gte: cutoff, lte: now } }, select: { createdAt: true } },
      wishlists: { where: { active: true }, select: { id: true } },
    },
  });
  const byId = new Map(details.map((customer) => [
    customer.id,
    getCustomerSegment({
      transactionDates: customer.transactions.map(({ createdAt }) => createdAt),
      activeWishlistCount: customer.wishlists.length,
      now,
    }),
  ]));
  if (!(Object.values(SEGMENTS) as string[]).includes(targetSegment)) return [];
  return customers.filter(({ id }) => byId.get(id) === targetSegment);
}

export async function processDueReminders(templateId?: string, now = new Date()) {
  if (!(await reminderEnabled())) return 0;
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
          active: true,
          optedOut: false,
          marketingConsent: true,
          reminderLogs: { none: { sentAt: { gte: cooldown } } },
          stockNotifications: { none: { sentAt: { gte: cooldown } } },
          ...(template.segment === "NEW" ? { transactions: { none: { voidRecord: null } } } : {}),
        },
        include: template.segment === "PERSONAL"
          ? {
              transactions: {
                orderBy: { createdAt: "desc" },
                take: REMINDER_HISTORY_SIZE,
                where: { voidRecord: null },
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
          status: SIMULATED_SENT_STATUS,
        }];
      });
      if (!rows.length) return 0;
      const created = await tx.reminderLog.createMany({ data: rows });
      return created.count;
    });
  }
  return sent;
}
