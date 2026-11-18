import { Prisma, type StockItem, type Wishlist } from "@prisma/client";
import { DEFAULT_STOCK_NOTIFICATION_MESSAGE, daysBefore, REMINDER_COOLDOWN_DAYS } from "./business-rules";
import { SIMULATED_SENT_STATUS } from "./message-status";
import { featureEnabledForBranch } from "./rollout";

type Transaction = Prisma.TransactionClient;

export function renderStockNotificationMessage(
  message: string,
  values: { customerName: string; stockName: string; size: string; branchName: string },
) {
  const firstName = values.customerName.trim().split(/\s+/)[0] ?? values.customerName;
  return message
    .replaceAll("{nama}", firstName)
    .replaceAll("{barang}", values.stockName)
    .replaceAll("{ukuran}", values.size)
    .replaceAll("{cabang}", values.branchName);
}

async function customersWithRecentMessages(tx: Transaction, customerIds: string[]) {
  if (!customerIds.length) return new Set<string>();
  const sentAfter = daysBefore(REMINDER_COOLDOWN_DAYS);
  const [reminders, stockNotifications] = await Promise.all([
    tx.reminderLog.findMany({
      where: { customerId: { in: customerIds }, sentAt: { gte: sentAfter } },
      select: { customerId: true },
    }),
    tx.stockMatchNotification.findMany({
      where: { customerId: { in: customerIds }, sentAt: { gte: sentAfter } },
      select: { customerId: true },
    }),
  ]);
  return new Set([...reminders, ...stockNotifications].map(({ customerId }) => customerId));
}

function matchesWishlist(wishlist: Wishlist, item: StockItem) {
  const keyword = wishlist.keyword?.trim().toLocaleLowerCase("id-ID");
  return (
    (!wishlist.category || wishlist.category === item.category) &&
    (!wishlist.size || wishlist.size === item.size) &&
    (!keyword || item.name.toLocaleLowerCase("id-ID").includes(keyword))
  );
}

async function createMissingNotifications(tx: Transaction, rows: { stockItemId: string; customerId: string; body: string }[]) {
  if (!rows.length) return 0;
  const existing = await tx.stockMatchNotification.findMany({
    where: { OR: rows.map(({ stockItemId, customerId }) => ({ stockItemId, customerId })) },
    select: { stockItemId: true, customerId: true },
  });
  const existingPairs = new Set(existing.map(({ stockItemId, customerId }) => `${stockItemId}:${customerId}`));
  const missing = rows.filter(({ stockItemId, customerId }) => !existingPairs.has(`${stockItemId}:${customerId}`));
  if (!missing.length) return 0;
  // SQLite's Prisma client does not support skipDuplicates; the unique pair and P2002 guard provide the same idempotency.
  try {
    const result = await tx.stockMatchNotification.createMany({
      data: missing.map((row) => ({ ...row, status: SIMULATED_SENT_STATUS })),
    });
    return result.count;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return 0;
    throw error;
  }
}

export async function matchStockItem(tx: Transaction, item: StockItem) {
  if (item.status !== "AVAILABLE") return 0;
  const stockBranch = await tx.branch.findUnique({
    where: { id: item.branchId },
    select: { name: true, rolloutStage: true },
  });
  if (!stockBranch) throw new Error(`Stock item ${item.id} references a missing branch.`);
  if (!featureEnabledForBranch("stockNotification", stockBranch)) return 0;
  const wishlists = await tx.wishlist.findMany({
    where: { active: true, customer: { active: true, optedOut: false, marketingConsent: true } },
    include: { customer: { select: { name: true } } },
  });
  const matchingWishlists = [...new Map(
    wishlists.filter((wishlist) => matchesWishlist(wishlist, item)).map((wishlist) => [wishlist.customerId, wishlist]),
  ).values()];
  const matchingCustomerIds = matchingWishlists.map(({ customerId }) => customerId);
  const recentlyMessaged = await customersWithRecentMessages(tx, matchingCustomerIds);
  const [branch, template] = await Promise.all([
    Promise.resolve(stockBranch),
    tx.stockNotificationTemplate.findUnique({ where: { id: "wishlist" }, select: { message: true } }),
  ]);
  if (!branch) throw new Error(`Stock item ${item.id} references a missing branch.`);
  const message = template?.message ?? DEFAULT_STOCK_NOTIFICATION_MESSAGE;
  return createMissingNotifications(tx, matchingWishlists
    .filter(({ customerId }) => !recentlyMessaged.has(customerId))
    .map((wishlist) => ({
      stockItemId: item.id,
      customerId: wishlist.customerId,
      body: renderStockNotificationMessage(message, {
        customerName: wishlist.customer.name,
        stockName: item.name,
        size: item.size,
        branchName: branch.name,
      }),
    })));
}

export async function matchWishlist(tx: Transaction, wishlist: Wishlist) {
  if (!wishlist.active) return 0;
  const customer = await tx.customer.findUnique({
    where: { id: wishlist.customerId },
    select: { name: true, active: true, optedOut: true, marketingConsent: true },
  });
  if (!customer || !customer.active || customer.optedOut || !customer.marketingConsent) return 0;
  if ((await customersWithRecentMessages(tx, [wishlist.customerId])).has(wishlist.customerId)) return 0;
  const items = await tx.stockItem.findMany({
    where: { status: "AVAILABLE" },
    include: { branch: { select: { name: true, rolloutStage: true } } },
  });
  const matchingItems = items.filter((item) =>
    featureEnabledForBranch("stockNotification", item.branch) && matchesWishlist(wishlist, item),
  );
  const item = matchingItems[0];
  if (!item) return 0;
  const template = await tx.stockNotificationTemplate.findUnique({
    where: { id: "wishlist" },
    select: { message: true },
  });
  const message = template?.message ?? DEFAULT_STOCK_NOTIFICATION_MESSAGE;
  return createMissingNotifications(tx, [{
    stockItemId: item.id,
    customerId: wishlist.customerId,
    body: renderStockNotificationMessage(message, {
      customerName: customer.name,
      stockName: item.name,
      size: item.size,
      branchName: item.branch.name,
    }),
  }]);
}
