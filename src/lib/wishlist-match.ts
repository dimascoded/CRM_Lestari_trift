import { Prisma, type StockItem, type Wishlist } from "@prisma/client";

type Transaction = Prisma.TransactionClient;

function matchesWishlist(wishlist: Wishlist, item: StockItem) {
  const keyword = wishlist.keyword?.trim().toLocaleLowerCase("id-ID");
  return (
    (!wishlist.category || wishlist.category === item.category) &&
    (!wishlist.size || wishlist.size === item.size) &&
    (!keyword || item.name.toLocaleLowerCase("id-ID").includes(keyword))
  );
}

async function createMissingNotifications(tx: Transaction, rows: { stockItemId: string; customerId: string }[]) {
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
    const result = await tx.stockMatchNotification.createMany({ data: missing });
    return result.count;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return 0;
    throw error;
  }
}

export async function matchStockItem(tx: Transaction, item: StockItem) {
  if (item.status !== "AVAILABLE") return 0;
  const wishlists = await tx.wishlist.findMany({
    where: { active: true, customer: { optedOut: false } },
  });
  const customerIds = [...new Set(
    wishlists.filter((wishlist) => matchesWishlist(wishlist, item)).map(({ customerId }) => customerId),
  )];
  await createMissingNotifications(tx, customerIds.map((customerId) => ({ stockItemId: item.id, customerId })));
  return customerIds.length;
}

export async function matchWishlist(tx: Transaction, wishlist: Wishlist) {
  if (!wishlist.active) return 0;
  const customer = await tx.customer.findUnique({
    where: { id: wishlist.customerId },
    select: { optedOut: true },
  });
  if (!customer || customer.optedOut) return 0;
  const items = await tx.stockItem.findMany({ where: { status: "AVAILABLE" } });
  const matchingItems = items.filter((item) => matchesWishlist(wishlist, item));
  await createMissingNotifications(tx, matchingItems.map((item) => ({ stockItemId: item.id, customerId: wishlist.customerId })));
  return matchingItems.length;
}
