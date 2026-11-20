import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { DASHBOARD_DEFAULT_PERIOD_DAYS, DASHBOARD_PERIOD_DAYS, STOCK_COMPLIANCE_WINDOW_DAYS, jakartaDayKey, rupiah } from "@/lib/business-rules";
import { getDashboardSummary } from "@/lib/dashboard-service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage(["OWNER", "MANAGER"]);
  const params = await searchParams;
  const periodValue = typeof params.period === "string" ? Number(params.period) : DASHBOARD_DEFAULT_PERIOD_DAYS;
  const period = DASHBOARD_PERIOD_DAYS.includes(periodValue as (typeof DASHBOARD_PERIOD_DAYS)[number])
    ? periodValue as (typeof DASHBOARD_PERIOD_DAYS)[number]
    : DASHBOARD_DEFAULT_PERIOD_DAYS;
  const branchId = staff.role === "OWNER"
    ? typeof params.branch === "string" && params.branch ? params.branch : null
    : staff.branchId;
  const data = await getDashboardSummary({ periodDays: period, branchId });
  const maxSales = Math.max(1, ...data.salesSeries.map(({ value }) => value));
  const dateLabel = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
  const summary = [
    ["Pelanggan aktif", data.summary.activeCustomers.toLocaleString("id-ID")],
    ["Pelanggan baru", data.summary.newCustomers.toLocaleString("id-ID")],
    ["Pendapatan bersih", rupiah(data.summary.netSales)],
    ["Transaksi", data.summary.transactions.toLocaleString("id-ID")],
    ["Rata-rata nilai transaksi", rupiah(data.summary.averageTransaction)],
    ["Stamp diberikan", data.summary.stamps.toLocaleString("id-ID")],
    ["Penukaran stamp", `${data.summary.redemptionCount} · diskon ${rupiah(data.summary.stampDiscounts)}`],
    ["Pelanggan repeat", data.summary.repeatCustomers.toLocaleString("id-ID")],
    ["Setuju pesan", `${data.summary.consentPercent.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`],
  ];
  const formatKpi = (value: number, unit: string) =>
    `${unit === "kali" ? value.toFixed(2) : value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}${unit === "%" ? "%" : ` ${unit}`}`;

  return <div className="page-content dashboard-page">
    <PageHeader eyebrow={`CRM · ${jakartaDayKey()}`} title="Ringkasan CRM" description="Pantau pelanggan, penjualan, wishlist, stok, pesan, dan KPI dalam satu tampilan." />
    <form className="dashboard-filter" method="get">
      <label>Periode<select name="period" defaultValue={String(period)}>{DASHBOARD_PERIOD_DAYS.map((days) => <option value={days} key={days}>{days} hari</option>)}</select></label>
      {staff.role === "OWNER" && <label>Cabang<select name="branch" defaultValue={branchId ?? ""}><option value="">Semua cabang</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      <button className="button secondary" type="submit">Terapkan filter</button>
    </form>
    <nav className="anchor-nav" aria-label="Lompat ke bagian dashboard">
      {[["#ringkasan", "Ringkasan"], ["#penjualan", "Penjualan"], ["#pelanggan", "Pelanggan"], ["#wishlist", "Wishlist"], ["#stok", "Stok"], ["#pesan", "Pesan"], ["#kpi", "KPI"]].map(([href, label]) =>
        <a href={href} key={href}>{label}</a>,
      )}
    </nav>

    <section className="dashboard-section" id="ringkasan"><div className="dashboard-section-heading"><h2>Ringkasan</h2></div>
      <div className="compact-stats">{summary.map(([label, value]) => <div className="compact-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {!data.summary.transactions && !data.summary.activeCustomers && <p className="empty-state">Belum ada data pada periode ini.</p>}
    </section>

    <section className="dashboard-section" id="penjualan"><div className="dashboard-section-heading"><h2>Penjualan</h2><Link href="/laporan?tab=performa">Laporan performa ↗</Link></div>
      {!data.salesSeries.length ? <p className="empty-state">Belum ada data pada periode ini.</p> : <>
        <div className="sales-bars" aria-label="Grafik pendapatan bersih">{data.salesSeries.map(({ key, value }) =>
          <div className="sales-bar-item" key={key} title={`${key}: ${rupiah(value)}`}><span className="sales-bar" style={{ height: `${Math.max(3, value / maxSales * 100)}%` }} /><small>{key.slice(5)}</small></div>,
        )}</div>
        <div className="table-scroll"><table><thead><tr><th>CABANG</th><th>PENDAPATAN BERSIH</th><th>TRANSAKSI</th><th>STAMP</th></tr></thead><tbody>
          {data.branches.map((branch) => { const row = data.salesByBranch.find((item) => item.branchId === branch.id); return <tr key={branch.id}><td>{branch.name}</td><td>{rupiah(row?.netSales ?? 0)}</td><td>{row?.transactions ?? 0}</td><td>{row?.stamps ?? 0}</td></tr>; })}
          {!data.branches.length && <tr><td className="table-empty" colSpan={4}>Belum ada data pada periode ini.</td></tr>}
        </tbody></table></div>
      </>}
    </section>

    <section className="dashboard-section" id="pelanggan"><div className="dashboard-section-heading"><h2>Pelanggan</h2><Link href="/pelanggan">Database pelanggan ↗</Link></div>
      <div className="dashboard-two-column">
        <div><h3>Komposisi segmen</h3>{Object.entries(data.customersBySegment).map(([label, count]) => <div className="dashboard-line" key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
        <div><h3>Saluran akuisisi</h3>{data.customersByChannel.map(({ label, count }) => <div className="dashboard-line" key={label}><span>{label}</span><strong>{count}</strong></div>)}{!data.customersByChannel.length && <p className="empty-state">Belum ada data pada periode ini.</p>}</div>
      </div>
      <p className="dashboard-note">Persetujuan pesan aktif: {data.summary.consentPercent.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari pelanggan aktif.</p>
    </section>

    <section className="dashboard-section" id="wishlist"><div className="dashboard-section-heading"><h2>Wishlist</h2><Link href="/pesan?tab=notifikasi">Pesan & notifikasi ↗</Link></div>
      <p className="dashboard-note">Wishlist aktif: {data.wishlist.activeCount} · Notifikasi simulasi periode ini: {data.wishlist.notifications} · Antrean belum diproses: {data.wishlist.followups}</p>
      <div className="dashboard-two-column">
        <ComparisonTable title="5 kategori paling dicari" rows={data.wishlist.categories} />
        <ComparisonTable title="5 ukuran paling dicari" rows={data.wishlist.sizes} />
      </div>
      {!data.wishlist.activeCount && <p className="empty-state">Belum ada data pada periode ini.</p>}
    </section>

    <section className="dashboard-section" id="stok"><div className="dashboard-section-heading"><h2>Stok</h2><Link href="/stok">Kelola stok ↗</Link></div>
      <div className="compact-stats"><div className="compact-stat"><span>Barang tersedia</span><strong>{data.stock.available}</strong></div><div className="compact-stat"><span>Stok mati</span><strong>{data.stock.dead}</strong></div></div>
      <h3>Kepatuhan update stok · {STOCK_COMPLIANCE_WINDOW_DAYS} hari</h3><div className="table-scroll"><table><thead><tr><th>CABANG</th><th>HARI TERPENUHI</th><th>KEPATUHAN</th></tr></thead><tbody>
        {data.stock.compliance.map((row) => <tr key={row.branchId}><td>{row.branchName}</td><td>{row.days}/{STOCK_COMPLIANCE_WINDOW_DAYS}</td><td>{Math.round(row.days / STOCK_COMPLIANCE_WINDOW_DAYS * 100)}%</td></tr>)}
        {!data.stock.compliance.length && <tr><td className="table-empty" colSpan={3}>Belum ada data pada periode ini.</td></tr>}
      </tbody></table></div>
      {!data.stock.available && !data.stock.dead && <p className="empty-state">Belum ada data pada periode ini.</p>}
    </section>

    <section className="dashboard-section" id="pesan"><div className="dashboard-section-heading"><h2>Pesan</h2><Link href="/pesan?tab=antrean">Buka antrean tindak lanjut ↗</Link></div>
      <div className="compact-stats"><div className="compact-stat"><span>Reminder simulasi</span><strong>{data.messages.reminderCount}</strong></div><div className="compact-stat"><span>Konversi 7 hari</span><strong>{data.messages.conversionPercent.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</strong></div><div className="compact-stat"><span>Total antrean tindak lanjut</span><strong>{data.messages.followups}</strong></div></div>
      {!data.messages.reminderCount && !data.messages.followups && <p className="empty-state">Belum ada data pada periode ini.</p>}
    </section>

    <section className="dashboard-section" id="kpi"><div className="dashboard-section-heading"><h2>KPI BDN</h2><Link href="/laporan">Laporan lengkap ↗</Link></div>
      <div className="table-scroll"><table><thead><tr><th>KODE</th><th>INDIKATOR</th><th>BASELINE</th><th>TARGET</th><th>CAPAIAN</th><th>STATUS</th></tr></thead><tbody>
        {data.kpis.map((kpi) => <tr key={kpi.code}><td><strong>{kpi.code}</strong></td><td>{kpi.label}</td><td>{kpi.baseline === null ? "—" : formatKpi(kpi.baseline, kpi.unit)}</td><td>{formatKpi(kpi.target, kpi.unit)}</td><td>{formatKpi(kpi.value, kpi.unit)}</td><td><span className={`status ${kpi.status === "Tercapai" ? "" : kpi.status === "Berjalan" ? "warning" : "neutral"}`}>{kpi.status}</span>{kpi.code === "S2" && !!kpi.missingQaBranches?.length && <small className="table-subtext">Belum diuji: {kpi.missingQaBranches.join(", ")}</small>}</td></tr>)}
      </tbody></table></div>
    </section>

    <div className="dashboard-two-column dashboard-bottom">
      <section className="dashboard-section"><div className="dashboard-section-heading"><h2>Tahap roll-out</h2><Link href="/strategi">Strategi CRM ↗</Link></div>
        {data.branches.map((branch) => <div className="dashboard-line" key={branch.id}><span>{branch.name}</span><strong>Tahap {branch.rolloutStage}</strong></div>)}
        {!data.branches.length && <p className="empty-state">Belum ada data pada periode ini.</p>}
      </section>
      <section className="dashboard-section"><div className="dashboard-section-heading"><h2>Transaksi terbaru</h2><Link href="/kasir">Kasir ↗</Link></div>
        {data.latestTransactions.map((transaction) => <div className="dashboard-line" key={transaction.id}><span><strong>{transaction.customer.name}</strong><small>{transaction.branch.name} · {dateLabel.format(transaction.createdAt)}</small></span><strong>{rupiah(transaction.amount - transaction.discountAmount)}</strong></div>)}
        {!data.latestTransactions.length && <p className="empty-state">Belum ada data pada periode ini.</p>}
      </section>
    </div>
  </div>;
}
function ComparisonTable({ title, rows }: { title: string; rows: { label: string; wishlists: number; availableStock: number }[] }) {
  const max = Math.max(1, ...rows.flatMap(({ wishlists, availableStock }) => [wishlists, availableStock]));
  return <div><h3>{title}</h3>{rows.length ? <div className="dashboard-comparison">{rows.map((row) => <div className="comparison-row" key={row.label}>
    <strong>{row.label}</strong><span>Wishlist aktif: {row.wishlists}</span><div className="comparison-track"><i style={{ width: `${row.wishlists / max * 100}%` }} /></div>
    <span>Stok tersedia: {row.availableStock}</span><div className="comparison-track stock"><i style={{ width: `${row.availableStock / max * 100}%` }} /></div>
  </div>)}</div> : <p className="empty-state">Belum ada data pada periode ini.</p>}</div>;
}
