import Link from "next/link";
import { registerCustomer, recordTransaction } from "@/app/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { normalizeWhatsApp, REDEMPTION_DISCOUNT_PERCENT, STAMP_MINIMUM_TRANSACTION, STAMPS_PER_REDEMPTION, rupiah } from "@/lib/business-rules";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function KasirPage({ searchParams }: { searchParams: SearchParams }) {
  return <KasirContent searchParams={searchParams} />;
}

async function KasirContent({ searchParams }: { searchParams: SearchParams }) {
  await requireStaffPage(["OWNER", "MANAGER", "CASHIER"]);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const customerId = typeof params.customer === "string" ? params.customer : "";
  const showNewCustomer = params.new === "1";
  const status = typeof params.status === "string" ? params.status : undefined;
  const discount = typeof params.discount === "string" ? params.discount : undefined;
  const amount = typeof params.amount === "string" ? params.amount : undefined;
  const branches = await db.branch.findMany({ orderBy: { name: "asc" } });
  const [customers, selected] = await Promise.all([
    query
      ? db.customer.findMany({
          where: {
            OR: [
              { name: { contains: query } },
              { whatsapp: { contains: query } },
              ...(query.replace(/\D/g, "").length >= 7
                ? [{ whatsapp: { equals: normalizeWhatsApp(query) } }]
                : []),
            ],
          },
          orderBy: { name: "asc" },
          take: 10,
          select: { id: true, name: true, whatsapp: true, registeredAt: { select: { name: true } } },
        })
      : Promise.resolve([]),
    customerId
      ? db.customer.findUnique({
          where: { id: customerId },
          include: {
            registeredAt: true,
            stamps: { where: { redeemedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            transactions: { orderBy: { createdAt: "desc" }, take: 3, include: { branch: true } },
          },
        })
      : Promise.resolve(null),
  ]);
  const activeStamps = selected?.stamps.length ?? 0;

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="OPERASIONAL · KASIR"
        title="Kasir"
        description="Cari pelanggan lintas cabang, catat transaksi, dan berikan diskon stamp otomatis."
        action={<Link className="button secondary" href="/kasir?new=1">＋ Pelanggan baru</Link>}
      />
      <Notice status={status} discount={discount} amount={amount} />

      {showNewCustomer ? (
        <section className="form-card cashier-form">
          <h2>Daftarkan pelanggan</h2>
          <p>Pendaftaran hanya memerlukan nama dan nomor WhatsApp. Nomor diperiksa di seluruh cabang.</p>
          <form action={registerCustomer}>
            <div className="form-grid">
              <div className="field"><label htmlFor="customer-name">Nama pelanggan</label><input id="customer-name" name="name" required maxLength={100} placeholder="Contoh: Dinda Putri" /></div>
              <div className="field"><label htmlFor="customer-whatsapp">Nomor WhatsApp</label><input id="customer-whatsapp" name="whatsapp" required inputMode="tel" placeholder="08xx atau +62..." /></div>
              <div className="field full"><label htmlFor="registration-branch">Cabang pendaftaran</label><select id="registration-branch" name="branchId" required defaultValue=""><option value="" disabled>Pilih cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            </div>
            <div className="form-actions"><button className="button" type="submit">Daftarkan pelanggan</button><Link className="button secondary" href="/kasir">Batal</Link></div>
          </form>
        </section>
      ) : (
        <>
          <section className="form-card cashier-search">
            <h2>Cari pelanggan</h2>
            <p>Pencarian lintas cabang berdasarkan nama atau nomor WhatsApp.</p>
            <form className="search-form" method="get">
              <input className="search-input" type="search" name="q" defaultValue={query} placeholder="Nama atau nomor WhatsApp..." aria-label="Cari pelanggan" />
              <button className="button secondary" type="submit">Cari</button>
            </form>
            {query && <div className="customer-results">
              {customers.map((customer) => (
                <Link className={`customer-result${customer.id === selected?.id ? " selected" : ""}`} href={`/kasir?customer=${encodeURIComponent(customer.id)}`} key={customer.id}>
                  <span><strong>{customer.name}</strong><small>{customer.whatsapp} · Terdaftar di {customer.registeredAt.name}</small></span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
              {!customers.length && <div className="empty-state">Pelanggan tidak ditemukan. <Link href="/kasir?new=1">Daftarkan pelanggan baru</Link>.</div>}
              {customers.length === 10 && <p className="field-hint">Maksimal 10 hasil ditampilkan. Tambahkan kata kunci untuk mempersempit pencarian.</p>}
            </div>}
          </section>

          {selected ? (
            <section className="cashier-customer">
              <div className="panel cashier-profile">
                <div className="panel-header"><div><h2 className="panel-title">{selected.name}</h2><p className="panel-subtitle">{selected.whatsapp} · Terdaftar di {selected.registeredAt.name}</p></div><Link className="inline-action" href="/kasir">Tutup ×</Link></div>
                <div className="cashier-stamp">
                  <div className="progress-label"><strong>Stamp aktif</strong><span>{activeStamps}/{STAMPS_PER_REDEMPTION}</span></div>
                  <div className="progress-bar"><span style={{ width: `${Math.min(activeStamps / STAMPS_PER_REDEMPTION * 100, 100)}%` }} /></div>
                  {activeStamps >= STAMPS_PER_REDEMPTION && <div className="success-callout">Pelanggan punya 3 stamp. Diskon {REDEMPTION_DISCOUNT_PERCENT}% diterapkan otomatis pada transaksi ini.</div>}
                </div>
                <div className="cashier-history">
                  <strong>Tiga transaksi terakhir</strong>
                  {selected.transactions.map((transaction) => (
                    <div className="activity-row" key={transaction.id}>
                      <div className="activity-body"><strong>{transaction.branch.name}</strong><small>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(transaction.createdAt)}</small></div>
                      <span className="activity-amount">{rupiah(transaction.amount - transaction.discountAmount)}</span>
                    </div>
                  ))}
                  {!selected.transactions.length && <div className="empty-state">Belum ada transaksi.</div>}
                </div>
              </div>

              <section className="form-card cashier-form">
                <h2>Catat transaksi</h2>
                <p>Minimum untuk mendapat stamp {rupiah(STAMP_MINIMUM_TRANSACTION)} · Maksimal satu stamp per hari per pelanggan.</p>
                <form action={recordTransaction}>
                  <input type="hidden" name="customerId" value={selected.id} />
                  <div className="form-grid">
                    <div className="field"><label htmlFor="transaction-branch">Cabang</label><select id="transaction-branch" name="branchId" required defaultValue=""><option value="" disabled>Pilih cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
                    <div className="field"><label htmlFor="transaction-amount">Nominal sebelum diskon (Rp)</label><input id="transaction-amount" name="amount" type="number" min="1" step="1" required placeholder="150000" /></div>
                  </div>
                  <label className="checkbox-field"><input type="checkbox" name="useStampDiscount" defaultChecked /> Gunakan diskon stamp jika tersedia ({REDEMPTION_DISCOUNT_PERCENT}%)</label>
                  <div className="form-actions"><button className="button" type="submit">Simpan transaksi</button></div>
                </form>
              </section>
            </section>
          ) : (
            <div className="empty-state panel">Cari dan pilih pelanggan untuk membuka profil serta form transaksi.</div>
          )}
        </>
      )}
    </div>
  );
}
