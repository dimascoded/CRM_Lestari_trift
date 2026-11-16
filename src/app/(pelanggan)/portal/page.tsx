import Link from "next/link";
import { beginPortalLogin, createWishlist, logoutPortalCustomer, toggleWishlist, updateCustomerProfile, updateMessagePreference, verifyPortalLogin } from "@/app/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { StockCatalog } from "@/components/StockCatalog";
import { getCustomerSession } from "@/lib/auth";
import { REDEMPTION_DISCOUNT_PERCENT, STAMPS_PER_REDEMPTION, rupiah } from "@/lib/business-rules";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const portalTabs = [
  { id: "beranda", label: "Beranda" },
  { id: "katalog", label: "Katalog stok" },
  { id: "wishlist", label: "Wishlist" },
  { id: "profil", label: "Profil & preferensi" },
] as const;
type PortalTab = (typeof portalTabs)[number]["id"];

export default function PortalPage({ searchParams }: { searchParams: SearchParams }) {
  return <PortalContent searchParams={searchParams} />;
}

async function PortalContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, customerSession] = await Promise.all([searchParams, getCustomerSession()]);
  const status = typeof params.status === "string" ? params.status : undefined;
  const loginStep = params.login === "verify";
  const phone = typeof params.phone === "string" ? params.phone : "";
  const requestedTab = typeof params.tab === "string" ? params.tab : "beranda";
  const tab: PortalTab = portalTabs.find(({ id }) => id === requestedTab)?.id ?? "beranda";
  const category = typeof params.category === "string" ? params.category : "";
  const size = typeof params.size === "string" ? params.size : "";
  const branch = typeof params.branch === "string" ? params.branch : "";
  const customer = customerSession
    ? await db.customer.findUnique({
        where: { id: customerSession.customer.id },
        include: {
          stamps: { orderBy: { createdAt: "desc" }, include: { branch: true } },
          transactions: { orderBy: { createdAt: "desc" }, take: 3, include: { branch: true } },
          wishlists: { orderBy: { createdAt: "desc" } },
          stockNotifications: {
            orderBy: { sentAt: "desc" },
            take: 5,
            include: { stockItem: { include: { branch: true } } },
          },
        },
      })
    : null;

  if (!customer) {
    return (
      <div className="page-content portal-login">
        <PageHeader eyebrow="PORTAL PELANGGAN" title="Masuk ke portal" description="Gunakan nomor WhatsApp yang terdaftar untuk melihat stamp, wishlist, dan katalog." />
        <Notice status={status} />
        <section className="form-card login-card">
          <span className="simulation-label">OTP PENGEMBANGAN</span>
          {loginStep ? (
            <>
              <h2>Masukkan kode verifikasi</h2>
              <p>Di lingkungan pengembangan, kode acak ditampilkan di terminal server dan berlaku 5 menit. Login portal production menunggu integrasi OTP WhatsApp.</p>
              <form action={verifyPortalLogin}>
                <input type="hidden" name="whatsapp" value={phone} />
                <div className="field"><label htmlFor="portal-code">Kode verifikasi</label><input id="portal-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" /></div>
                <div className="form-actions"><button className="button" type="submit">Verifikasi dan masuk</button><Link className="button secondary" href="/portal">Kembali</Link></div>
              </form>
            </>
          ) : (
            <>
              <h2>Masuk dengan WhatsApp</h2>
              <p>Masukkan nomor WhatsApp yang terdaftar. Kode hanya dikirim melalui alur OTP yang terverifikasi.</p>
              <form action={beginPortalLogin}>
                <div className="field"><label htmlFor="portal-whatsapp">Nomor WhatsApp</label><input id="portal-whatsapp" name="whatsapp" inputMode="tel" autoComplete="tel" required placeholder="08xx atau +62..." /></div>
                <div className="form-actions"><button className="button" type="submit">Lanjutkan</button></div>
              </form>
            </>
          )}
        </section>
      </div>
    );
  }

  const activeStamps = customer.stamps.filter(({ redeemedAt }) => !redeemedAt);
  const hasDiscount = activeStamps.length >= STAMPS_PER_REDEMPTION;
  const progress = activeStamps.length % STAMPS_PER_REDEMPTION;

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="PORTAL PELANGGAN"
        title={`Halo, ${customer.name.split(/\s+/)[0]}!`}
        description="Kartu stamp, katalog, wishlist, dan preferensi pesan Anda."
        action={<form action={logoutPortalCustomer}><button className="button secondary" type="submit">Keluar</button></form>}
      />
      <Notice status={status} />
      <nav className="tabs portal-tabs" aria-label="Menu portal pelanggan">
        {portalTabs.map(({ id, label }) => <Link className={`tab${tab === id ? " active" : ""}`} href={`/portal?tab=${id}`} key={id}>{label}</Link>)}
      </nav>

      {tab === "katalog" && <StockCatalog category={category} size={size} branch={branch} action="/portal?tab=katalog" />}

      {tab === "beranda" && (
        <>
          <section className="portal-banner">
            <div className="portal-banner-copy"><small>MEMBER LESTARI THRIFT</small><h2>Temukan favoritmu, {customer.name.split(/\s+/)[0]}.</h2><p>Stamp dan wishlist Anda berlaku di seluruh cabang Lestari.</p></div>
            <div className="portal-banner-art"><div className="portal-stamp-art">lestari</div></div>
          </section>
          {hasDiscount && <div className="success-callout portal-discount">Diskon {REDEMPTION_DISCOUNT_PERCENT}% siap dipakai di pembelian berikutnya.</div>}
          <div className="split-dashboard">
            <section className="panel">
              <div className="panel-header"><div><h2 className="panel-title">Kartu stamp digital</h2><p className="panel-subtitle">Stamp bisa dikumpulkan lintas cabang</p></div><span className="tag">{activeStamps.length} aktif</span></div>
              <div className="stamp-card">
                <div className="stamp-total">{activeStamps.length}<small> / {STAMPS_PER_REDEMPTION} menuju diskon</small></div>
                <div className="stamp-progress">{Array.from({ length: STAMPS_PER_REDEMPTION }, (_, index) => <span className={`stamp-dot ${index < progress ? "filled" : ""}`} key={index}>{index < progress ? "✳" : "＋"}</span>)}</div>
                <p className="stamp-note">{hasDiscount ? `Diskon ${REDEMPTION_DISCOUNT_PERCENT}% akan diterapkan otomatis saat kasir mencatat transaksi berikutnya.` : `${STAMPS_PER_REDEMPTION - progress} stamp lagi untuk mendapatkan diskon ${REDEMPTION_DISCOUNT_PERCENT}%.`}</p>
              </div>
              <div className="activity-list">
                {customer.stamps.slice(0, 5).map((stamp) => <div className="activity-row" key={stamp.id}><span className="activity-dot" /><div className="activity-body"><strong>{stamp.branch.name}</strong><small>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(stamp.createdAt)}</small></div><span className={`status ${stamp.redeemedAt ? "neutral" : ""}`}>{stamp.redeemedAt ? "Ditukar" : "1 stamp"}</span></div>)}
              </div>
            </section>
            <section className="panel">
              <div className="panel-header"><div><h2 className="panel-title">Riwayat transaksi</h2><p className="panel-subtitle">Tiga transaksi terakhir</p></div></div>
              <div className="activity-list">
                {customer.transactions.map((transaction) => <div className="activity-row" key={transaction.id}><span className="activity-dot" /><div className="activity-body"><strong>{transaction.branch.name}</strong><small>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(transaction.createdAt)}</small></div><span className="activity-amount">{rupiah(transaction.amount - transaction.discountAmount)}</span></div>)}
                {!customer.transactions.length && <div className="empty-state">Belum ada transaksi.</div>}
              </div>
              <div className="panel-header"><div><h2 className="panel-title">Notifikasi stok</h2><p className="panel-subtitle">Simulasi pesan barang yang cocok</p></div></div>
              <div className="activity-list">
                {customer.stockNotifications.map(({ id, stockItem, sentAt }) => <div className="activity-row" key={id}><span className="activity-dot" /><div className="activity-body"><strong>{stockItem.name}</strong><small>{stockItem.category} · {stockItem.size} · {stockItem.branch.name}</small></div><span className="activity-amount">{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }).format(sentAt)}</span></div>)}
                {!customer.stockNotifications.length && <div className="empty-state">Belum ada notifikasi stok.</div>}
              </div>
            </section>
          </div>
        </>
      )}

      {tab === "wishlist" && (
        <section className="form-card portal-section">
          <h2>Wishlist</h2><p>Tambahkan kategori, ukuran, atau kata kunci yang sedang dicari.</p>
          <form action={createWishlist}>
            <div className="form-grid">
              <div className="field"><label htmlFor="wishlist-category">Kategori</label><select id="wishlist-category" name="category" defaultValue=""><option value="">Semua</option><option>Atasan</option><option>Bawahan</option><option>Dress</option><option>Outer</option><option>Aksesori</option><option>Sepatu</option></select></div>
              <div className="field"><label htmlFor="wishlist-size">Ukuran</label><select id="wishlist-size" name="size" defaultValue=""><option value="">Semua</option>{["XS", "S", "M", "L", "XL", "XXL", "All size"].map((size) => <option key={size}>{size}</option>)}</select></div>
              <div className="field full"><label htmlFor="wishlist-keyword">Kata kunci</label><input id="wishlist-keyword" name="keyword" placeholder="linen, floral, denim..." /></div>
            </div>
            <div className="form-actions"><button className="button" type="submit">＋ Tambah wishlist</button></div>
          </form>
          <div className="wishlist-list section-spacer">
            {customer.wishlists.map((item) => <div className="template-card" key={item.id}>
              <div className="template-top"><strong>{[item.category, item.size, item.keyword].filter(Boolean).join(" · ") || "Semua barang"}</strong><span className={`status ${item.active ? "" : "neutral"}`}>{item.active ? "Aktif" : "Nonaktif"}</span></div>
              <form action={toggleWishlist} className="template-actions"><input type="hidden" name="wishlistId" value={item.id} /><input type="hidden" name="active" value={String(!item.active)} /><button className={`inline-action ${item.active ? "danger" : ""}`} type="submit">{item.active ? "Nonaktifkan" : "Aktifkan kembali"}</button></form>
            </div>)}
            {!customer.wishlists.length && <div className="empty-state">Belum ada wishlist.</div>}
          </div>
        </section>
      )}

      {tab === "profil" && (
        <section className="form-card portal-section">
          <h2>Profil dan preferensi pesan</h2><p>Data tambahan bersifat opsional. Anda dapat berhenti menerima reminder kapan saja.</p>
          <form action={updateCustomerProfile}>
            <div className="form-grid">
              <div className="field"><label htmlFor="favorite-category">Kategori favorit</label><input id="favorite-category" name="favoriteCategory" defaultValue={customer.favoriteCategory ?? ""} /></div>
              <div className="field"><label htmlFor="favorite-size">Ukuran favorit</label><input id="favorite-size" name="favoriteSize" defaultValue={customer.favoriteSize ?? ""} /></div>
              <div className="field"><label htmlFor="birth-date">Tanggal lahir</label><input id="birth-date" name="birthDate" type="date" defaultValue={customer.birthDate?.toISOString().slice(0, 10) ?? ""} /></div>
              <div className="field"><label htmlFor="instagram">Instagram</label><input id="instagram" name="instagram" defaultValue={customer.instagram ?? ""} placeholder="@username" /></div>
            </div>
            <div className="form-actions"><button className="button secondary" type="submit">Simpan profil</button></div>
          </form>
          <div className="section-spacer">
            <form action={updateMessagePreference}><input type="hidden" name="optedOut" value={String(!customer.optedOut)} /><button className={`button small ${customer.optedOut ? "secondary" : "danger"}`} type="submit">{customer.optedOut ? "Aktifkan reminder kembali" : "Berhenti menerima pesan"}</button></form>
            <p className="field-hint profile-status">Status: {customer.optedOut ? "opt-out, tidak menerima pesan" : "dapat menerima pesan yang memenuhi aturan"}</p>
          </div>
        </section>
      )}
    </div>
  );
}
