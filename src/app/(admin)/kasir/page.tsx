import Link from "next/link";
import { recordCashierConsent, registerCustomer, recordTransaction, voidTransaction } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import {
  currentTime,
  ACQUISITION_CHANNELS,
  jakartaDayKey,
  MESSAGE_CONSENT_TEXT,
  normalizeWhatsApp,
  REDEMPTION_DISCOUNT_PERCENT,
  PROFILE_PROMPT_AFTER_TRANSACTIONS,
  SEGMENT_WINDOW_DAYS,
  STAMP_MINIMUM_TRANSACTION,
  STAMPS_PER_REDEMPTION,
  TRANSACTION_VOID_REASON_MAX_LENGTH,
  rupiah,
} from "@/lib/business-rules";
import { db } from "@/lib/db";
import { getCustomerSegment } from "@/lib/segment-service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function KasirPage({ searchParams }: { searchParams: SearchParams }) {
  return <KasirContent searchParams={searchParams} />;
}

async function KasirContent({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage(["OWNER", "MANAGER", "CASHIER"]);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const customerId = typeof params.customer === "string" ? params.customer : "";
  const showNewCustomer = params.new === "1";
  const status = typeof params.status === "string" ? params.status : undefined;
  const discount = typeof params.discount === "string" ? params.discount : undefined;
  const amount = typeof params.amount === "string" ? params.amount : undefined;
  const todayKey = jakartaDayKey(currentTime());
  const canVoid = staff.role === "OWNER" || staff.role === "MANAGER";
  const branches = await db.branch.findMany({ orderBy: { name: "asc" } });
  const staffBranch = branches.find(({ id }) => id === staff.branchId);
  const [customers, selected, segmentTransactions] = await Promise.all([
    query
      ? db.customer.findMany({
          where: {
            active: true,
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
          where: { id: customerId, active: true },
          include: {
            registeredAt: true,
            stamps: { where: { redeemedAt: null, voidedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            transactions: {
              orderBy: { createdAt: "desc" },
              take: 3,
              include: { branch: true, voidRecord: { select: { voidedAt: true } } },
            },
            wishlists: { where: { active: true }, select: { id: true } },
          },
        })
      : Promise.resolve(null),
    customerId
      ? db.transaction.findMany({
          where: { customerId, voidRecord: null, createdAt: { gte: new Date(currentTime().getTime() - SEGMENT_WINDOW_DAYS * 86400000) } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const activeStamps = selected?.stamps.length ?? 0;
  const nonVoidedTransactionCount = selected
    ? await db.transaction.count({ where: { customerId: selected.id, voidRecord: null } })
    : 0;
  const profileIncomplete = selected && (!selected.favoriteCategory || !selected.favoriteSize || !selected.birthDate || !selected.instagram);
  const segment = selected
    ? getCustomerSegment({
        transactionDates: segmentTransactions.map(({ createdAt }) => createdAt),
        activeWishlistCount: selected.wishlists.length,
      })
    : null;

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
          <p>Nama dan nomor WhatsApp wajib. Persetujuan pesan bersifat opsional dan tidak dicentang otomatis.</p>
          <form action={registerCustomer}>
            <div className="form-grid">
              <div className="field"><label htmlFor="customer-name">Nama pelanggan</label><input id="customer-name" name="name" required maxLength={100} placeholder="Contoh: Dinda Putri" /></div>
              <div className="field"><label htmlFor="customer-whatsapp">Nomor WhatsApp</label><input id="customer-whatsapp" name="whatsapp" required inputMode="tel" placeholder="08xx atau +62..." /></div>
              <div className="field"><label htmlFor="registration-channel">Asal pelanggan</label><select id="registration-channel" name="acquisitionChannel" defaultValue="DATANG_LANGSUNG">{Object.entries(ACQUISITION_CHANNELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
              <div className="field full"><label htmlFor="registration-branch">Cabang pendaftaran</label>{staff.role === "OWNER"
                ? <select id="registration-branch" name="branchId" required defaultValue=""><option value="" disabled>Pilih cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
                : <><strong>{staffBranch?.name ?? "Cabang staf"}</strong><input type="hidden" name="branchId" value={staff.branchId ?? ""} /></>}</div>
            </div>
            <label className="checkbox-field"><input type="checkbox" name="marketingConsent" /> Pelanggan menyatakan setuju: “{MESSAGE_CONSENT_TEXT}”</label>
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
                <div className={`customer-result${customer.id === selected?.id ? " selected" : ""}`} key={customer.id}>
                  <span><Link href={`/pelanggan/${encodeURIComponent(customer.id)}`}><strong>{customer.name}</strong></Link><small>{customer.whatsapp} · Terdaftar di {customer.registeredAt.name}</small></span>
                  <Link href={`/kasir?customer=${encodeURIComponent(customer.id)}`} aria-label={`Pilih ${customer.name}`}>Pilih →</Link>
                </div>
              ))}
              {!customers.length && <div className="empty-state">Pelanggan tidak ditemukan. <Link href="/kasir?new=1">Daftarkan pelanggan baru</Link>.</div>}
              {customers.length === 10 && <p className="field-hint">Maksimal 10 hasil ditampilkan. Tambahkan kata kunci untuk mempersempit pencarian.</p>}
            </div>}
          </section>

          {selected ? (
            <section className="cashier-customer">
              <div className="panel cashier-profile">
                <div className="panel-header"><div><h2 className="panel-title">{selected.name}</h2><p className="panel-subtitle">{selected.whatsapp} · Terdaftar di {selected.registeredAt.name}</p><span className="tag">{segment}</span></div><Link className="inline-action" href="/kasir">Tutup ×</Link></div>
                <div className="cashier-stamp">
                  <div className="progress-label"><strong>Stamp aktif</strong><span>{activeStamps}/{STAMPS_PER_REDEMPTION}</span></div>
                  <div className="progress-bar"><span style={{ width: `${Math.min(activeStamps / STAMPS_PER_REDEMPTION * 100, 100)}%` }} /></div>
                </div>
                {!selected.marketingConsent && !selected.optedOut && <form id="persetujuan" action={recordCashierConsent} className="warning-callout section-spacer">
                  <input type="hidden" name="customerId" value={selected.id} />
                  <input type="hidden" name="consentText" value={MESSAGE_CONSENT_TEXT} />
                  <label className="checkbox-field"><input type="checkbox" name="marketingConsent" required /> Pelanggan menyatakan setuju: “{MESSAGE_CONSENT_TEXT}”</label>
                  <button className="button small" type="submit">Catat persetujuan</button>
                </form>}
                {nonVoidedTransactionCount >= PROFILE_PROMPT_AFTER_TRANSACTIONS && profileIncomplete && <div className="warning-callout cashier-banner">Lengkapi profil pelanggan. <Link href={`/pelanggan/${encodeURIComponent(selected.id)}`}>Buka profil</Link></div>}
                {activeStamps >= STAMPS_PER_REDEMPTION && <div className="success-callout cashier-banner">Pelanggan punya {STAMPS_PER_REDEMPTION} stamp. Diskon {REDEMPTION_DISCOUNT_PERCENT}% diterapkan otomatis pada transaksi ini.</div>}
              </div>

              <section className="form-card cashier-form">
                <h2>Catat transaksi</h2>
                <p>Minimum untuk mendapat stamp {rupiah(STAMP_MINIMUM_TRANSACTION)} · Maksimal satu stamp per hari per pelanggan.</p>
                <p className="field-hint">Tawarkan stamp: {activeStamps}/{STAMPS_PER_REDEMPTION} stamp aktif</p>
                <form action={recordTransaction}>
                  <input type="hidden" name="customerId" value={selected.id} />
                  <div className="form-grid">
                    <div className="field"><label htmlFor="transaction-branch">Cabang</label>{staff.role === "OWNER"
                      ? <select id="transaction-branch" name="branchId" required defaultValue=""><option value="" disabled>Pilih cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
                      : <><strong>{staffBranch?.name ?? "Cabang staf"}</strong><input type="hidden" name="branchId" value={staff.branchId ?? ""} /></>}</div>
                    <div className="field"><label htmlFor="transaction-amount">Nominal sebelum diskon (Rp)</label><input id="transaction-amount" name="amount" type="number" min="1" step="1" required placeholder="100000" /></div>
                  </div>
                  <label className="checkbox-field"><input type="checkbox" name="stampOffered" defaultChecked /> Stamp sudah ditawarkan ke pelanggan</label>
                  <label className="checkbox-field"><input type="checkbox" name="useStampDiscount" defaultChecked /> Gunakan diskon stamp jika tersedia ({REDEMPTION_DISCOUNT_PERCENT}%)</label>
                  <div className="form-actions"><button className="button" type="submit">Simpan transaksi</button></div>
                </form>
              </section>

              <details className="cashier-history-details">
                <summary>Riwayat transaksi</summary>
                <div className="cashier-history">
                  {selected.transactions.map((transaction) => (
                    <div className="cashier-transaction" key={transaction.id}>
                      <div className="activity-row">
                        <div className="activity-body">
                          <strong>{transaction.branch.name}</strong>
                          <small>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(transaction.createdAt)}{transaction.voidRecord ? " · Dibatalkan" : ""}</small>
                        </div>
                        {transaction.voidRecord
                          ? <span className="status neutral">Dibatalkan</span>
                          : <span className="activity-amount">{rupiah(transaction.amount - transaction.discountAmount)}</span>}
                      </div>
                      {canVoid &&
                        (staff.role === "OWNER" || staff.branchId === transaction.branchId) &&
                        !transaction.voidRecord &&
                        jakartaDayKey(transaction.createdAt) === todayKey && (
                          <form action={voidTransaction} className="transaction-void-form">
                            <input type="hidden" name="transactionId" value={transaction.id} />
                            <label className="field">
                              Alasan pembatalan
                              <input name="reason" required maxLength={TRANSACTION_VOID_REASON_MAX_LENGTH} placeholder="Contoh: nominal salah input" />
                            </label>
                            <ConfirmSubmitButton
                              className="inline-action danger"
                              confirmMessage="Batalkan transaksi ini? Riwayat tidak dihapus, tetapi stamp hasil transaksi akan dibatalkan."
                            >
                              Batalkan
                            </ConfirmSubmitButton>
                          </form>
                        )}
                    </div>
                  ))}
                  {!selected.transactions.length && <div className="empty-state">Belum ada transaksi.</div>}
                </div>
              </details>
            </section>
          ) : (
            <div className="empty-state panel">Cari dan pilih pelanggan untuk membuka profil serta form transaksi.</div>
          )}
        </>
      )}
    </div>
  );
}
