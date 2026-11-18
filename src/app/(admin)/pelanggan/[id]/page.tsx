import Link from "next/link";
import { notFound } from "next/navigation";
import { recordCashierConsent, updateCustomerRecord } from "@/app/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { MESSAGE_CONSENT_TEXT, STAMPS_PER_REDEMPTION, rupiah } from "@/lib/business-rules";
import { db } from "@/lib/db";
import { getCustomerSegment } from "@/lib/segment-service";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomerDetailPage({ params, searchParams }: Props) {
  const [staff, { id }, query] = await Promise.all([
    requireStaffPage(["OWNER", "MANAGER", "CASHIER"]),
    params,
    searchParams,
  ]);
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      registeredAt: true,
      transactions: { where: { voidRecord: null }, orderBy: { createdAt: "desc" }, take: 90, select: { createdAt: true } },
      stamps: {
        orderBy: { createdAt: "desc" },
        include: { branch: { select: { name: true } }, transaction: { select: { voidRecord: true } } },
      },
      redemptions: {
        orderBy: { createdAt: "desc" },
        include: { branch: { select: { name: true } }, stamps: { include: { stamp: true } } },
      },
      wishlists: { orderBy: { createdAt: "desc" } },
      messageConsents: { orderBy: { createdAt: "desc" } },
      stockNotifications: {
        orderBy: { sentAt: "desc" },
        take: 50,
        include: { stockItem: { include: { branch: { select: { name: true } } } } },
      },
      reminderLogs: {
        orderBy: { sentAt: "desc" },
        take: 50,
        include: { template: { select: { name: true } } },
      },
      followUpNotes: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!customer) notFound();
  if (staff.role !== "OWNER" && staff.branchId !== customer.registeredAtId) notFound();
  const segment = getCustomerSegment({
    transactionDates: customer.transactions.map(({ createdAt }) => createdAt),
    activeWishlistCount: customer.wishlists.filter(({ active }) => active).length,
  });
  const activeStamps = customer.stamps.filter(({ redeemedAt, voidedAt, transaction }) =>
    !redeemedAt && !voidedAt && !transaction.voidRecord,
  );
  const activeStampCount = activeStamps.length;
  const status = typeof query.status === "string" ? query.status : undefined;
  const date = (value: Date) => new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
  }).format(value);
  const birthDateParts = customer.birthDate
    ? Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(customer.birthDate).map(({ type, value }) => [type, value]))
    : null;
  const birthDateValue = birthDateParts
    ? `${birthDateParts.year}-${birthDateParts.month}-${birthDateParts.day}`
    : "";

  return <div className="page-content">
    <PageHeader eyebrow="PELANGGAN · PROFIL" title={customer.name} description={`${customer.whatsapp} · Terdaftar di ${customer.registeredAt.name}`} action={<Link className="button secondary" href="/pelanggan">Kembali ke pelanggan</Link>} />
    <Notice status={status} />
    <div className="stats-grid">
      <div className="stat-card"><div className="stat-top"><span>Segmen</span></div><div className="stat-number">{segment}</div><div className="stat-foot"><span>{customer.acquisitionChannel}</span></div></div>
      <div className="stat-card"><div className="stat-top"><span>Stamp aktif</span></div><div className="stat-number">{activeStampCount}/{STAMPS_PER_REDEMPTION}</div><div className="progress-bar"><span style={{ width: `${Math.min(activeStampCount / STAMPS_PER_REDEMPTION * 100, 100)}%` }} /></div></div>
      <div className="stat-card"><div className="stat-top"><span>Persetujuan pesan</span></div><div className="stat-number">{customer.optedOut ? "Opt-out" : customer.marketingConsent ? "Setuju" : "Belum setuju"}</div><div className="stat-foot"><span>{customer.active ? "Pelanggan aktif" : "Diarsipkan"}</span></div></div>
    </div>
    {!customer.marketingConsent && !customer.optedOut && <form action={recordCashierConsent} className="warning-callout section-spacer">
      <input type="hidden" name="customerId" value={customer.id} /><input type="hidden" name="consentText" value={MESSAGE_CONSENT_TEXT} />
      <label className="checkbox-field"><input type="checkbox" name="marketingConsent" required /> Pelanggan menyatakan setuju: “{MESSAGE_CONSENT_TEXT}”</label>
      <button className="button small" type="submit">Catat persetujuan</button>
    </form>}

    <section className="form-card section-spacer">
      <h2>Profil dan asal pelanggan</h2>
      <form action={updateCustomerRecord}>
        <input type="hidden" name="customerId" value={customer.id} />
        <div className="form-grid">
          <div className="field"><label htmlFor="detail-name">Nama</label><input id="detail-name" name="name" required maxLength={100} defaultValue={customer.name} /></div>
          <div className="field"><label htmlFor="detail-whatsapp">WhatsApp</label><input id="detail-whatsapp" name="whatsapp" required defaultValue={customer.whatsapp} /></div>
          <div className="field"><label htmlFor="detail-category">Kategori favorit</label><input id="detail-category" name="favoriteCategory" maxLength={80} defaultValue={customer.favoriteCategory ?? ""} /></div>
          <div className="field"><label htmlFor="detail-size">Ukuran favorit</label><input id="detail-size" name="favoriteSize" maxLength={40} defaultValue={customer.favoriteSize ?? ""} /></div>
          <div className="field"><label htmlFor="detail-birth">Tanggal lahir</label><input id="detail-birth" name="birthDate" type="date" defaultValue={birthDateValue} /></div>
          <div className="field"><label htmlFor="detail-instagram">Instagram</label><input id="detail-instagram" name="instagram" maxLength={100} defaultValue={customer.instagram ?? ""} /></div>
        </div>
        <p className="field-hint">Asal pelanggan: {customer.acquisitionChannel}. Data persetujuan disimpan sebagai riwayat.</p>
        <div className="form-actions"><button className="button" type="submit">Simpan profil</button></div>
      </form>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Riwayat persetujuan pesan</h2><p>Status, sumber, dan waktu persetujuan.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>STATUS</th><th>SUMBER</th><th>VERSI KEBIJAKAN</th><th>WAKTU</th></tr></thead><tbody>
        {customer.messageConsents.map((consent) => <tr key={consent.id}><td>{consent.status}</td><td>{consent.source}</td><td>{consent.policyVersion}</td><td>{date(consent.createdAt)}</td></tr>)}
        {!customer.messageConsents.length && <tr><td className="table-empty" colSpan={4}>Belum ada riwayat persetujuan.</td></tr>}
      </tbody></table></div>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Stamp dan penukaran</h2><p>Riwayat disimpan, termasuk stamp yang dibatalkan atau ditukar.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>JENIS</th><th>CABANG</th><th>STATUS</th><th>WAKTU</th></tr></thead><tbody>
        {customer.stamps.map((stamp) => <tr key={stamp.id}><td>Stamp transaksi</td><td>{stamp.branch.name}</td><td>{stamp.voidedAt || stamp.transaction.voidRecord ? "Dibatalkan" : stamp.redeemedAt ? "Ditukar" : "Aktif"}</td><td>{date(stamp.createdAt)}</td></tr>)}
        {customer.redemptions.map((redemption) => <tr key={redemption.id}><td>Penukaran {redemption.stampCount} stamp · diskon {redemption.discountPercent}%</td><td>{redemption.branch.name}</td><td>{redemption.voidedAt ? "Dibatalkan" : "Tercatat"}</td><td>{date(redemption.createdAt)}</td></tr>)}
        {!customer.stamps.length && !customer.redemptions.length && <tr><td className="table-empty" colSpan={4}>Belum ada riwayat stamp.</td></tr>}
      </tbody></table></div>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>20 transaksi terbaru lintas cabang</h2></div></div>
      <div className="table-scroll"><table><thead><tr><th>CABANG</th><th>NOMINAL BERSIH</th><th>STATUS</th><th>WAKTU</th></tr></thead><tbody>
        {(await db.transaction.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { branch: { select: { name: true } }, voidRecord: true },
        })).map((transaction) => <tr key={transaction.id}><td>{transaction.branch.name}</td><td>{rupiah(transaction.amount - transaction.discountAmount)}</td><td>{transaction.voidRecord ? "Dibatalkan" : "Selesai"}</td><td>{date(transaction.createdAt)}</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Wishlist dan notifikasi stok</h2></div></div>
      <div className="table-scroll"><table><thead><tr><th>WISHLIST</th><th>STATUS</th><th>NOTIFIKASI</th></tr></thead><tbody>
        {customer.wishlists.map((wishlist) => <tr key={wishlist.id}><td>{[wishlist.category, wishlist.size, wishlist.keyword].filter(Boolean).join(" · ") || "Semua barang"}</td><td>{wishlist.active ? "Aktif" : "Nonaktif"}</td><td>{customer.stockNotifications.filter(({ stockItem }) => (!wishlist.category || wishlist.category === stockItem.category) && (!wishlist.size || wishlist.size === stockItem.size) && (!wishlist.keyword || stockItem.name.toLocaleLowerCase("id-ID").includes(wishlist.keyword.toLocaleLowerCase("id-ID")))).length}</td></tr>)}
        {!customer.wishlists.length && <tr><td className="table-empty" colSpan={3}>Belum ada wishlist aktif.</td></tr>}
      </tbody></table></div>
      <div className="activity-list">{customer.stockNotifications.map((notification) => <div className="activity-row" key={notification.id}><span className="activity-dot" /><div className="activity-body"><strong>{notification.stockItem.name}</strong><small>{notification.stockItem.branch.name} · simulasi, bukan bukti delivery</small></div><span className="activity-amount">{date(notification.sentAt)}</span></div>)}</div>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Riwayat reminder simulasi</h2></div></div>
      <div className="activity-list">{customer.reminderLogs.map((log) => <div className="activity-row" key={log.id}><span className="activity-dot" /><div className="activity-body"><strong>{log.template.name}</strong><small>{log.status} · simulasi, bukan bukti delivery</small></div><span className="activity-amount">{date(log.sentAt)}</span></div>)}{!customer.reminderLogs.length && <div className="empty-state">Belum ada reminder simulasi.</div>}</div>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Catatan tindak lanjut terbaru</h2></div></div>
      <div className="activity-list">{customer.followUpNotes.map((note) => <div className="activity-row" key={note.id}><span className="activity-dot" /><div className="activity-body"><strong>{note.queue}</strong><small>{note.note || "Tanpa catatan"}</small></div><span className="activity-amount">{date(note.createdAt)}</span></div>)}{!customer.followUpNotes.length && <div className="empty-state">Belum ada catatan tindak lanjut.</div>}</div>
    </section>
  </div>;
}
