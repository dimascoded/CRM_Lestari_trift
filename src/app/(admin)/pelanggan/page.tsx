import Link from "next/link";
import { setCustomerActive } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { daysBefore, normalizeWhatsApp, SEGMENTS, SEGMENT_WINDOW_DAYS } from "@/lib/business-rules";
import { db } from "@/lib/db";
import { getCustomerSegment } from "@/lib/segment-service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const pageSize = 25;

export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return <CustomersContent searchParams={searchParams} />;
}

async function CustomersContent({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage(["OWNER", "MANAGER", "CASHIER"]);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const archived = params.archived === "1";
  const requestedSegment = typeof params.segment === "string" ? params.segment : "";
  const segmentFilter = (Object.values(SEGMENTS) as string[]).includes(requestedSegment) ? requestedSegment : "";
  const status = typeof params.status === "string" ? params.status : undefined;
  const requestedPage = Number(params.page);
  const safePage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = {
    active: !archived,
    ...(staff.role === "OWNER" ? {} : { registeredAtId: staff.branchId ?? "" }),
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { whatsapp: { contains: query } },
            ...(query.replace(/\D/g, "").length >= 7 ? [{ whatsapp: { equals: normalizeWhatsApp(query) } }] : []),
          ],
        }
      : {}),
  };
  const allCustomers = await db.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      registeredAt: true,
      stamps: { where: { redeemedAt: null, voidedAt: null }, select: { id: true } },
      transactions: {
        where: { voidRecord: null, createdAt: { gte: daysBefore(SEGMENT_WINDOW_DAYS) } },
        select: { createdAt: true },
      },
      wishlists: { where: { active: true }, select: { id: true } },
      _count: { select: { transactions: { where: { voidRecord: null } }, wishlists: true } },
    },
  });
  const filteredCustomers = allCustomers.filter((customer) => {
    if (!segmentFilter) return true;
    return getCustomerSegment({
      transactionDates: customer.transactions.map(({ createdAt }) => createdAt),
      activeWishlistCount: customer.wishlists.length,
    }) === segmentFilter;
  });
  const totalCount = filteredCustomers.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(safePage, pageCount);
  const customers = filteredCustomers.slice((page - 1) * pageSize, page * pageSize);
  const canManage = staff.role === "OWNER" || staff.role === "MANAGER";
  const queryParams = new URLSearchParams();
  if (query) queryParams.set("q", query);
  queryParams.set("archived", archived ? "1" : "0");
  if (segmentFilter) queryParams.set("segment", segmentFilter);
  const pageUrl = (pageNumber: number) => {
    const nextParams = new URLSearchParams(queryParams);
    if (pageNumber > 1) nextParams.set("page", String(pageNumber));
    return `/pelanggan?${nextParams.toString()}`;
  };
  const archiveUrl = new URLSearchParams();
  if (query) archiveUrl.set("q", query);
  archiveUrl.set("archived", archived ? "0" : "1");

  return (
    <div className="page-content">
      <PageHeader eyebrow="OPERASIONAL · PELANGGAN" title="Database pelanggan" description="Cari, perbarui, dan arsipkan profil tanpa menghapus riwayat transaksi atau persetujuan." />
      <Notice status={status} />
      <section className="table-card section-spacer">
        <div className="table-titlebar">
          <div><h2>{archived ? "Pelanggan diarsipkan" : "Pelanggan aktif"}</h2><p>{totalCount} pelanggan{query ? ` cocok dengan “${query}”` : ""}.</p></div>
          <div className="customer-tools">
            <form className="search-form" method="get">
              <input type="hidden" name="archived" value={archived ? "1" : "0"} />
              <input className="search-input" type="search" name="q" defaultValue={query} placeholder="Cari nama atau WhatsApp..." aria-label="Cari pelanggan" />
              <select name="segment" defaultValue={segmentFilter} aria-label="Filter segmen"><option value="">Semua segmen</option>{Object.entries(SEGMENTS).map(([key, label]) => <option value={label} key={key}>{label}</option>)}</select>
              <button className="button" type="submit">Cari</button>
            </form>
            <Link className="button secondary" href={`/pelanggan?${archiveUrl.toString()}`}>{archived ? "Lihat pelanggan aktif" : "Lihat arsip"}</Link>
          </div>
        </div>
        <div className="table-scroll"><table><thead><tr><th>PELANGGAN</th><th>SEGMEN</th><th>DAFTAR DI</th><th>STAMP AKTIF</th><th>TRANSAKSI</th><th>WISHLIST</th><th>PESAN</th><th>STATUS</th>{canManage && <th>AKSI</th>}</tr></thead>
          <tbody>{customers.map((customer) => {
            return (
              <tr key={customer.id}>
                <td><div className="customer-cell"><span className="customer-initial">{customer.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase()}</span><span><Link href={`/pelanggan/${encodeURIComponent(customer.id)}`}><strong>{customer.name}</strong></Link><small>{customer.whatsapp} · {customer.acquisitionChannel}</small></span></div></td>
                <td>{getCustomerSegment({ transactionDates: customer.transactions.map(({ createdAt }) => createdAt), activeWishlistCount: customer.wishlists.length })}</td>
                <td>{customer.registeredAt.name}</td>
                <td><span className="tag">{customer.stamps.length} stamp</span></td>
                <td>{customer._count.transactions}</td>
                <td>{customer._count.wishlists}</td>
                <td><span className={`status ${customer.marketingConsent && !customer.optedOut ? "" : "neutral"}`}>{customer.marketingConsent && !customer.optedOut ? "Setuju" : customer.optedOut ? "Berhenti" : "Belum setuju"}</span></td>
                <td><span className={`status ${customer.active ? "" : "neutral"}`}>{customer.active ? "Aktif" : "Diarsipkan"}</span></td>
                {canManage && <td>{staff.role === "OWNER" || customer.registeredAtId === staff.branchId
                  ? <div className="customer-row-actions">
                      <Link className="inline-action" href={`/pelanggan/${encodeURIComponent(customer.id)}#profil`}>Ubah</Link>
                      <form action={setCustomerActive}>
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input type="hidden" name="active" value={String(!customer.active)} />
                        {customer.active
                          ? <ConfirmSubmitButton className="inline-action danger" confirmMessage={`Arsipkan ${customer.name}? Riwayat dan stamp tetap disimpan.`}>Arsipkan</ConfirmSubmitButton>
                          : <button className="inline-action" type="submit">Pulihkan</button>}
                      </form>
                    </div>
                  : <span className="field-hint">Kelola di cabang asal</span>}
                </td>}
              </tr>
            );
          })}
            {!customers.length && <tr><td className="table-empty" colSpan={canManage ? 9 : 8}>{query || segmentFilter ? "Tidak ada pelanggan yang cocok. Periksa nama, nomor, segmen, atau filter arsip." : archived ? "Belum ada pelanggan di arsip." : "Belum ada pelanggan aktif."}</td></tr>}
          </tbody>
        </table></div>
        {pageCount > 1 && <nav className="table-pagination" aria-label="Halaman daftar pelanggan">
          <span>Halaman {page} dari {pageCount}</span>
          <div>
            {page > 1 && <Link className="button small secondary" href={pageUrl(page - 1)}>Sebelumnya</Link>}
            {page < pageCount && <Link className="button small secondary" href={pageUrl(page + 1)}>Berikutnya</Link>}
          </div>
        </nav>}
      </section>
    </div>
  );
}
