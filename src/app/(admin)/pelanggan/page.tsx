import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { normalizeWhatsApp } from "@/lib/business-rules";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return <CustomersContent searchParams={searchParams} />;
}

async function CustomersContent({ searchParams }: { searchParams: SearchParams }) {
  await requireStaffPage(["OWNER", "MANAGER", "CASHIER"]);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" ? params.status : undefined;
  const customers = await db.customer.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query } },
            { whatsapp: { contains: query } },
            ...(query.replace(/\D/g, "").length >= 7 ? [{ whatsapp: { equals: normalizeWhatsApp(query) } }] : []),
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      registeredAt: true,
      stamps: { where: { redeemedAt: null }, select: { id: true } },
      _count: { select: { transactions: true, wishlists: true } },
    },
  });
  return (
    <div className="page-content">
      <PageHeader eyebrow="OPERASIONAL · PELANGGAN" title="Database pelanggan" description="Profil terpusat dan aktivitas pelanggan lintas cabang." />
      <Notice status={status} />
      <section className="table-card">
        <div className="table-titlebar">
          <div><h2>Daftar pelanggan</h2><p>{customers.length} pelanggan ditampilkan{query ? ` untuk “${query}”` : ""}.</p></div>
          <form className="search-form" method="get">
            <input className="search-input" type="search" name="q" defaultValue={query} placeholder="Cari nama atau WhatsApp..." aria-label="Cari pelanggan" />
            <button className="button secondary" type="submit">Cari</button>
          </form>
        </div>
        <div className="table-scroll"><table><thead><tr><th>PELANGGAN</th><th>DAFTAR DI</th><th>STAMP AKTIF</th><th>TRANSAKSI</th><th>WISHLIST</th><th>PESAN</th></tr></thead>
          <tbody>{customers.map((customer) => (
            <tr key={customer.id}>
              <td><div className="customer-cell"><span className="customer-initial">{customer.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase()}</span><span><strong>{customer.name}</strong><small>{customer.whatsapp}</small></span></div></td>
              <td>{customer.registeredAt.name}</td><td><span className="tag">{customer.stamps.length} stamp</span></td>
              <td>{customer._count.transactions}</td><td>{customer._count.wishlists}</td>
              <td><span className={`status ${customer.optedOut ? "neutral" : ""}`}>{customer.optedOut ? "Opt-out" : "Aktif"}</span></td>
            </tr>
          ))}{!customers.length && <tr><td className="table-empty" colSpan={6}>Tidak ada pelanggan yang cocok dengan pencarian.</td></tr>}</tbody>
        </table></div>
      </section>
    </div>
  );
}
