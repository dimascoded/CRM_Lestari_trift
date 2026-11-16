import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { currentTime, jakartaDayKey, rupiah } from "@/lib/business-rules";
import { getKpis } from "@/lib/kpi";
import { db } from "@/lib/db";

const rolloutLabels: Record<number, string> = { 1: "Pilot", 2: "Tahap 2", 3: "Tahap 3" };

export default function DashboardPage() {
  return <DashboardContent />;
}

async function DashboardContent() {
  await requireStaffPage(["OWNER", "MANAGER"]);
  const now = currentTime();
  const today = jakartaDayKey(now);
  const [customers, stampsToday, availableStock, wishlistMatches, branches, transactions, kpis] = await Promise.all([
    db.customer.count(),
    db.stamp.count({ where: { dayKey: today } }),
    db.stockItem.count({ where: { status: "AVAILABLE" } }),
    db.stockMatchNotification.count(),
    db.branch.findMany({
      orderBy: [{ rolloutStage: "asc" }, { name: "asc" }],
      include: {
        stockItems: { where: { status: "AVAILABLE" }, select: { id: true } },
        stockUpdateLogs: { orderBy: { updatedAt: "desc" }, take: 1 },
      },
    }),
    db.transaction.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { customer: true, branch: true },
    }),
    getKpis(),
  ]);
  const currentDate = new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(now);

  return (
    <div className="page-content">
      <PageHeader
        eyebrow={currentDate.toLocaleUpperCase("id-ID")}
        title="Ringkasan Lestari Thrift"
        description="Pantau sasaran BDN, roll-out cabang, pelanggan, dan transaksi terbaru."
        action={<span className="date-pill">Hari ini · {currentDate}</span>}
      />
      <div className="stats-grid">
        <StatCard label="Total pelanggan" value={customers.toLocaleString("id-ID")} note="Database terpusat" icon="◉" />
        <StatCard label="Stamp hari ini" value={stampsToday.toLocaleString("id-ID")} note="Di seluruh cabang" icon="✳" />
        <StatCard label="Stok tersedia" value={availableStock.toLocaleString("id-ID")} note="Lintas cabang" icon="▦" />
        <StatCard label="Notifikasi wishlist" value={wishlistMatches.toLocaleString("id-ID")} note="Simulasi tersimpan" icon="♡" />
      </div>

      <section className="table-card section-spacer">
        <div className="table-titlebar"><div><h2>Indikator target BDN</h2><p>Capaian aktual dibanding baseline dan sasaran.</p></div></div>
        <div className="table-scroll">
          <table><thead><tr><th>KODE</th><th>INDIKATOR</th><th>BASELINE</th><th>TARGET</th><th>CAPAIAN</th><th>STATUS</th></tr></thead>
            <tbody>{kpis.map((kpi) => (
              <tr key={kpi.code}>
                <td><strong>{kpi.code}</strong></td>
                <td>{kpi.label}{kpi.duplicateAttempts !== undefined && <small className="table-subtext">{kpi.duplicateAttempts.toLocaleString("id-ID")} percobaan ganda tercegah</small>}</td>
                <td>{kpi.baseline === null ? "—" : formatKpi(kpi.baseline, kpi.unit)}</td>
                <td>{formatKpi(kpi.target, kpi.unit)}</td>
                <td><strong>{formatKpi(kpi.value, kpi.unit)}</strong></td>
                <td><span className={`status ${kpi.status === "Tercapai" ? "" : kpi.status === "Berjalan" ? "warning" : "neutral"}`}>{kpi.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="dashboard-grid section-spacer">
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Tahap roll-out</h2><p className="panel-subtitle">Progres penerapan per cabang</p></div><Link className="panel-link" href="/manajemen?tab=stok">Kepatuhan stok ↗</Link></div>
          <div className="branch-list">
            {branches.map((branch) => {
              const lastUpdate = branch.stockUpdateLogs[0]?.updatedAt;
              return (
                <div className="branch-row rollout-row" key={branch.id}>
                  <div className="branch-name"><span className="branch-avatar">{branch.name.slice(0, 2).toUpperCase()}</span>{branch.name}</div>
                  <div><strong>{rolloutLabels[branch.rolloutStage] ?? `Tahap ${branch.rolloutStage}`}</strong><small className="table-subtext">{branch.stockItems.length} barang tersedia</small></div>
                  <div className="branch-update">{lastUpdate ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(lastUpdate) : "Belum update"}</div>
                  <span className={`status ${lastUpdate && jakartaDayKey(lastUpdate) === today ? "" : "warning"}`}>{lastUpdate && jakartaDayKey(lastUpdate) === today ? "Diperbarui" : "Perlu update"}</span>
                </div>
              );
            })}
            {!branches.length && <div className="empty-state">Belum ada cabang.</div>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Aktivitas transaksi</h2><p className="panel-subtitle">Catatan terbaru lintas cabang</p></div><Link className="panel-link" href="/kasir">Buka kasir ↗</Link></div>
          <div className="activity-list">
            {transactions.map((transaction) => (
              <div className="activity-row" key={transaction.id}>
                <span className="activity-dot" />
                <div className="activity-body"><strong>{transaction.customer.name}</strong><small>{transaction.branch.name} · {new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(transaction.createdAt)}</small></div>
                <span className="activity-amount">{rupiah(transaction.amount - transaction.discountAmount)}</span>
              </div>
            ))}
            {!transactions.length && <div className="empty-state">Belum ada transaksi.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatKpi(value: number, unit: string) {
  const formatted = unit === "kali" ? value.toFixed(2) : value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  return `${formatted}${unit === "%" ? "%" : ` ${unit}`}`;
}

function StatCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-number">{value}</div><div className="stat-foot"><span>{note}</span></div></div>;
}
