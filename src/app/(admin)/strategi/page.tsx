import Link from "next/link";
import { setBranchRolloutStage } from "@/app/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { ACQUISITION_CHANNELS, CRM_VISION, currentTime, jakartaDayKey, SEGMENTS } from "@/lib/business-rules";
import { db } from "@/lib/db";
import { getKpis, type KpiRow } from "@/lib/kpi";
import { countCustomersBySegment } from "@/lib/segment-service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StrategyPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage();
  const params = await searchParams;
  const [branches, segments, kpis, channelGroups, channelEntries, stamps, customerBranches, stockToday] = await Promise.all([
    db.branch.findMany({ orderBy: { name: "asc" } }),
    countCustomersBySegment(),
    getKpis(),
    Promise.resolve(Object.entries(ACQUISITION_CHANNELS)),
    db.customer.groupBy({ by: ["acquisitionChannel"], where: { active: true }, _count: { _all: true } }),
    db.stamp.count({ where: { voidedAt: null } }),
    db.transaction.groupBy({ by: ["customerId", "branchId"], where: { voidRecord: null } }),
    db.stockUpdateLog.groupBy({
      by: ["branchId"],
      where: { updatedAt: { gte: new Date(`${jakartaDayKey(currentTime())}T00:00:00+07:00`) } },
    }),
  ]);
  const kpiByCode = new Map(kpis.map((kpi) => [kpi.code, kpi]));
  const multiBranchCustomers = new Set(
    customerBranches.reduce((counts, row) => counts.set(row.customerId, (counts.get(row.customerId) ?? 0) + 1), new Map<string, number>()),
  );
  const channelCount = new Map(channelEntries.map(({ acquisitionChannel, _count }) => [acquisitionChannel, _count._all]));
  const activeChannelEntries = channelGroups.map(([key, label]) => ({ label, count: channelCount.get(key) ?? 0 }));
  const availableBranches = new Set(stockToday.map(({ branchId }) => branchId)).size;
  const status = typeof params.status === "string" ? params.status : undefined;
  const mapping: { name: string; feature: string; href: string; code: KpiRow["code"] }[] = [
    { name: "Database terpusat", feature: "Profil pelanggan lintas cabang", href: "/pelanggan", code: "S1" },
    { name: "Stamp digital", feature: "Stamp dan penukaran lintas cabang", href: "/kasir", code: "S3" },
    { name: "Wishlist & notifikasi stok", feature: "Pencocokan stok tersedia", href: "/pesan?tab=notifikasi", code: "S5" },
    { name: "Reminder personal", feature: "Reminder simulasi dan jadwal", href: "/pesan?tab=reminder", code: "S6" },
    { name: "Pemantauan", feature: "KPI, stok, dan tindak lanjut", href: "/laporan", code: "S4" },
  ];

  return <div className="page-content">
    <PageHeader eyebrow="UTAMA · STRATEGI CRM" title="Strategi CRM" description="Visi, prioritas, segmen pelanggan, roll-out, dan pemetaan enabler Lestari." />
    <Notice status={status} />
    <section className="panel strategy-vision"><div className="panel-header"><div><h2 className="panel-title">Visi CRM</h2><p>{CRM_VISION}</p></div></div>
      <div className="stats-grid">{[
        ["Loyalitas", "Bangun kebiasaan belanja dan apresiasi lintas cabang."],
        ["Pendapatan", "Tawarkan produk yang relevan pada waktu yang tepat."],
        ["Biaya", "Gunakan data dan simulasi terukur sebelum komunikasi."],
      ].map(([label, text]) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span></div><p>{text}</p></div>)}</div>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Customer Strategy Cube</h2><p>Jumlah pelanggan aktif berdasarkan segmen dan saluran akuisisi.</p></div></div>
      <div className="stats-grid">{Object.entries(SEGMENTS).map(([key, label]) => <div className="stat-card" key={key}><div className="stat-top"><span>{label}</span></div><div className="stat-number">{segments[label] ?? 0}</div></div>)}</div>
      <div className="strategy-offers"><div><strong>Stamp lintas cabang</strong><small>Progres stamp digital pelanggan</small></div><div><strong>Wishlist & notifikasi stok</strong><small>Pencocokan barang pada tahap roll-out yang aktif</small></div><div><strong>Reminder personal</strong><small>Jadwal simulasi berdasarkan riwayat transaksi</small></div></div>
      <div className="table-scroll"><table><thead><tr><th>SALURAN AKUISISI</th><th>PELANGGAN AKTIF</th></tr></thead><tbody>
        {activeChannelEntries.map(({ label, count }) => <tr key={label}><td>{label}</td><td>{count}</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Tahap roll-out per cabang</h2><p>Fitur wishlist/notifikasi tersedia mulai tahap 2; reminder mengikuti cabang tertinggi tahap 3.</p></div></div>
      <div className="branch-update-grid">{branches.map((branch) => <article className="branch-update-card" key={branch.id}>
        <strong>{branch.name}</strong><span className="tag">Tahap {branch.rolloutStage}</span>
        {staff.role === "OWNER" && <form action={setBranchRolloutStage}><input type="hidden" name="branchId" value={branch.id} />
          <div className="field"><label htmlFor={`rollout-${branch.id}`}>Ubah tahap</label><select id={`rollout-${branch.id}`} name="rolloutStage" defaultValue={String(branch.rolloutStage)}><option value="1">Tahap 1 · Pilot</option><option value="2">Tahap 2</option><option value="3">Tahap 3</option></select></div>
          <button className="button small" type="submit">Simpan tahap</button>
        </form>}
      </article>)}</div>
    </section>

    <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Pemetaan BDN</h2><p>IT enabler, fitur layar, dan status KPI.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>IT ENABLER</th><th>FITUR</th><th>LAYAR</th><th>KPI</th><th>STATUS</th></tr></thead><tbody>
        {mapping.map((item) => { const kpi = kpiByCode.get(item.code); return <tr key={item.name}><td>{item.name}</td><td>{item.feature}</td><td><Link href={item.href}>Buka ↗</Link></td><td>{item.code}</td><td>{kpi?.status ?? "Belum"}</td></tr>; })}
      </tbody></table></div>
    </section>

    <section className="section-spacer"><h2>Quick win terhitung</h2><div className="stats-grid">
      <div className="stat-card"><div className="stat-top"><span>Stamp digital tercatat</span></div><div className="stat-number">{stamps}</div></div>
      <div className="stat-card"><div className="stat-top"><span>Pelanggan lintas cabang</span></div><div className="stat-number">{multiBranchCustomers.size}</div></div>
      <div className="stat-card"><div className="stat-top"><span>Cabang memperbarui stok hari ini</span></div><div className="stat-number">{availableBranches}/{branches.length}</div></div>
    </div></section>
  </div>;
}
