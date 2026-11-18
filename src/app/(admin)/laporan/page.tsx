import Link from "next/link";
import { recordRedemptionQaCheck } from "@/app/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { currentTime, DEAD_STOCK_DAYS, KPI_REPORTING_WINDOW_DAYS, REMINDER_CONVERSION_WINDOW_DAYS, REDEMPTION_QA_NOTE_MAX_LENGTH, STOCK_COMPLIANCE_WINDOW_DAYS, daysBefore, jakartaDayKey } from "@/lib/business-rules";
import { getKpis } from "@/lib/kpi";
import { db } from "@/lib/db";
import { SIMULATED_SENT_STATUS, describeMessageStatus } from "@/lib/message-status";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const tabs = [
  { id: "performa", label: "Performa" },
  { id: "stok", label: "Stok" },
  { id: "duplikat", label: "Duplikat" },
  { id: "qa", label: "QA" },
] as const;
type ManagementTab = (typeof tabs)[number]["id"];

export default function ManagementPage({ searchParams }: { searchParams: SearchParams }) {
  return <ManagementContent searchParams={searchParams} />;
}

async function ManagementContent({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage(["OWNER", "MANAGER", "MARKETING"]);
  const params = await searchParams;
  const requestedTab = typeof params.tab === "string" ? params.tab : "performa";
  const tab: ManagementTab = tabs.find(({ id }) => id === requestedTab)?.id ?? "performa";
  const status = typeof params.status === "string" ? params.status : undefined;
  const detail = typeof params.count === "string" ? params.count : undefined;
  return (
    <div className="page-content">
      <PageHeader eyebrow="LAPORAN" title="Laporan CRM" description="Pantau performa operasional, kualitas penukaran, stok, dan data ganda." />
      <Notice status={status} detail={detail} />
      <nav className="tabs management-tabs" aria-label="Tab laporan">
        {tabs.map(({ id, label }) => <Link className={`tab${tab === id ? " active" : ""}`} href={`/laporan?tab=${id}`} key={id}>{label}</Link>)}
      </nav>
      {tab === "performa" && <PerformanceTab />}
      {tab === "stok" && <StockTab />}
      {tab === "duplikat" && <DuplicateTab />}
      {tab === "qa" && <QaTab canRecord={["OWNER", "MANAGER"].includes(staff.role)} branchId={staff.role === "MANAGER" ? staff.branchId ?? "" : null} />}
    </div>
  );
}

async function PerformanceTab() {
  const now = currentTime();
  const start30 = daysBefore(KPI_REPORTING_WINDOW_DAYS, now);
  const [logs, repeatGroups, kpis, offeredGroups, branches] = await Promise.all([
    db.reminderLog.findMany({
      where: { sentAt: { gte: start30 }, status: SIMULATED_SENT_STATUS },
      orderBy: { sentAt: "desc" },
      take: 100,
      include: { customer: { select: { id: true, name: true } }, template: { select: { name: true } } },
    }),
    db.transaction.groupBy({
      by: ["customerId"],
      where: { createdAt: { gte: start30 }, voidRecord: null },
      _count: { _all: true },
    }),
    getKpis(),
    db.transaction.groupBy({
      by: ["branchId", "stampOffered"],
      where: { createdAt: { gte: start30 }, voidRecord: null },
      _count: { _all: true },
    }),
    db.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const customerIds = [...new Set(logs.map(({ customerId }) => customerId))];
  const transactions = customerIds.length ? await db.transaction.findMany({
    where: { customerId: { in: customerIds }, createdAt: { gte: start30 }, voidRecord: null },
    select: { customerId: true, createdAt: true },
  }) : [];
  const converted = new Set(logs.filter((log) => transactions.some(({ customerId, createdAt }) =>
    customerId === log.customerId && createdAt > log.sentAt && createdAt <= new Date(log.sentAt.getTime() + REMINDER_CONVERSION_WINDOW_DAYS * 86400000),
  )).map(({ customerId }) => customerId)).size;
  const repeatCount = repeatGroups.filter(({ _count }) => _count._all >= 2).length;
  const kpi = (code: string) => kpis.find((item) => item.code === code)?.value ?? 0;
  const branchNames = new Map(branches.map(({ id, name }) => [id, name]));
  return (
    <>
      <div className="metric-strip">
        <Metric label="Reminder simulasi · 30 hari" value={logs.length} />
        <Metric label="Konversi setelah simulasi · 7 hari" value={`${kpi("S7b").toLocaleString("id-ID", { maximumFractionDigits: 1 })}% · ${converted} pelanggan`} />
        <Metric label="Pelanggan repeat · 30 hari" value={repeatCount} />
        <Metric label="Transaksi / pelanggan aktif" value={kpi("S7a").toLocaleString("id-ID", { maximumFractionDigits: 2 })} />
      </div>
      <section className="table-card section-spacer">
        <div className="table-titlebar"><div><h2>Tingkat penawaran stamp per cabang</h2><p>30 hari terakhir; jumlah transaksi dengan penawaran stamp dibagi transaksi tidak batal.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>CABANG</th><th>DITAWARKAN</th><th>TRANSAKSI</th><th>TINGKAT PENAWARAN</th></tr></thead><tbody>
          {branches.map((branch) => {
            const groups = offeredGroups.filter(({ branchId }) => branchId === branch.id);
            const total = groups.reduce((sum, group) => sum + group._count._all, 0);
            const offered = groups.find(({ stampOffered }) => stampOffered)?._count._all ?? 0;
            return <tr key={branch.id}><td>{branchNames.get(branch.id)}</td><td>{offered}</td><td>{total}</td><td>{total ? `${(offered / total * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—"}</td></tr>;
          })}
          {!branches.length && <tr><td className="table-empty" colSpan={4}>Belum ada data pada periode ini.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="table-card section-spacer">
        <div className="table-titlebar"><div><h2>Log reminder simulasi</h2><p>Catatan simulasi dan transaksi pelanggan dalam 30 hari terakhir; bukan bukti delivery WhatsApp.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>PELANGGAN</th><th>TEMPLATE</th><th>WAKTU SIMULASI</th><th>STATUS</th><th>KONVERSI SETELAH SIMULASI</th></tr></thead>
          <tbody>{logs.map((log) => {
            const convertedAfter = transactions.some(({ customerId, createdAt }) => customerId === log.customerId && createdAt > log.sentAt && createdAt <= new Date(log.sentAt.getTime() + REMINDER_CONVERSION_WINDOW_DAYS * 86400000));
            const messageStatus = describeMessageStatus(log.status);
            return <tr key={log.id}><td>{log.customer.name}</td><td>{log.template.name}</td><td>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(log.sentAt)}</td><td>{messageStatus.label}</td><td>{convertedAfter ? "Ya" : "Belum"}</td></tr>;
          })}{!logs.length && <tr><td className="table-empty" colSpan={5}>Belum ada pengiriman dalam 30 hari terakhir.</td></tr>}</tbody>
        </table></div>
      </section>
    </>
  );
}

async function StockTab() {
  const now = currentTime();
  const today = jakartaDayKey(now);
  const since7 = daysBefore(STOCK_COMPLIANCE_WINDOW_DAYS, now);
  const recentDayKeys = new Set(Array.from({ length: STOCK_COMPLIANCE_WINDOW_DAYS }, (_, index) => jakartaDayKey(daysBefore(STOCK_COMPLIANCE_WINDOW_DAYS - 1 - index, now))));
  const [branches, logs, stampGroups, deadItems] = await Promise.all([
    db.branch.findMany({ orderBy: { name: "asc" } }),
    db.stockUpdateLog.findMany({
      where: {
        updatedAt: { gte: since7 },
        OR: [{ type: "CHANGE" }, { type: "CONFIRM", countedItems: { not: null } }],
      },
      select: { branchId: true, updatedAt: true },
    }),
    db.stamp.groupBy({ by: ["branchId"], where: { dayKey: today, voidedAt: null }, _count: { _all: true } }),
    db.stockItem.findMany({
      where: { status: "AVAILABLE", enteredAt: { lt: daysBefore(DEAD_STOCK_DAYS, now) } },
      include: { branch: { select: { name: true } } },
      orderBy: { enteredAt: "asc" },
    }),
  ]);
  const updatedDays = new Map<string, Set<string>>();
  for (const log of logs) {
    const dayKey = jakartaDayKey(log.updatedAt);
    if (!recentDayKeys.has(dayKey)) continue;
    const days = updatedDays.get(log.branchId) ?? new Set<string>();
    days.add(dayKey);
    updatedDays.set(log.branchId, days);
  }
  const stampsToday = new Map(stampGroups.map(({ branchId, _count }) => [branchId, _count._all]));
  return (
    <>
      <section className="table-card">
        <div className="table-titlebar"><div><h2>Kepatuhan update stok cabang</h2><p>Hari dengan perubahan katalog atau konfirmasi jumlah aktual dalam tujuh hari terakhir.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>CABANG</th><th>UPDATE</th><th>KEPATUHAN 7 HARI</th><th>STAMP HARI INI</th><th>STATUS HARI INI</th></tr></thead>
          <tbody>{branches.map((branch) => {
            const days = updatedDays.get(branch.id)?.size ?? 0;
            const todayUpdated = updatedDays.get(branch.id)?.has(today) ?? false;
            return <tr key={branch.id}><td><strong>{branch.name}</strong></td><td>{days}/{STOCK_COMPLIANCE_WINDOW_DAYS} hari</td><td>{Math.round(days / STOCK_COMPLIANCE_WINDOW_DAYS * 100)}%</td><td>{stampsToday.get(branch.id) ?? 0}</td><td><span className={`status ${todayUpdated ? "" : "warning"}`}>{todayUpdated ? "Diperbarui" : "Perlu update"}</span></td></tr>;
          })}</tbody>
        </table></div>
      </section>
      <section className="table-card section-spacer">
        <div className="table-titlebar"><div><h2>Laporan stok mati</h2><p>Barang tersedia lebih dari {DEAD_STOCK_DAYS} hari sejak masuk.</p></div><span className="tag orange">{deadItems.length} barang</span></div>
        <div className="table-scroll"><table><thead><tr><th>BARANG</th><th>KATEGORI</th><th>CABANG</th><th>UMUR</th></tr></thead><tbody>
          {deadItems.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.category}</td><td>{item.branch.name}</td><td>{Math.floor((now.getTime() - item.enteredAt.getTime()) / 86400000)} hari</td></tr>)}
          {!deadItems.length && <tr><td className="table-empty" colSpan={4}>Tidak ada stok mati saat ini.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}

async function QaTab({ canRecord, branchId }: { canRecord: boolean; branchId: string | null }) {
  const [kpis, branches, checks] = await Promise.all([
    getKpis(),
    db.branch.findMany({ where: branchId === null ? {} : { id: branchId }, orderBy: { name: "asc" } }),
    db.redemptionQaCheck.findMany({
      where: branchId === null ? {} : { branchId },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const s2 = kpis.find(({ code }) => code === "S2");
  return (
    <>
      <div className="metric-strip"><Metric label="S2 · Uji tukar stamp lulus" value={`${(s2?.value ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} /></div>
      {!!s2?.missingQaBranches?.length && <div className="warning-callout">Belum diuji: {s2.missingQaBranches.join(", ")}.</div>}
      {canRecord && <section className="branch-update-grid section-spacer">{branches.map((branch) => (
        <article className="branch-update-card" key={branch.id}><strong>{branch.name}</strong>
          <form action={recordRedemptionQaCheck}>
            <input type="hidden" name="branchId" value={branch.id} />
            <div className="field"><label htmlFor={`qa-passed-${branch.id}`}>Hasil uji</label><select id={`qa-passed-${branch.id}`} name="passed"><option value="true">Lulus</option><option value="false">Gagal</option></select></div>
            <div className="field"><label htmlFor={`qa-note-${branch.id}`}>Catatan</label><input id={`qa-note-${branch.id}`} name="note" maxLength={REDEMPTION_QA_NOTE_MAX_LENGTH} /></div>
            <button className="button small" type="submit">Catat hasil uji</button>
          </form>
        </article>
      ))}</section>}
      <section className="table-card section-spacer"><div className="table-titlebar"><div><h2>Riwayat uji</h2><p>Hasil uji tukar stamp per cabang.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>CABANG</th><th>HASIL</th><th>CATATAN</th><th>WAKTU</th></tr></thead><tbody>
          {checks.map((check) => <tr key={check.id}><td>{check.branch.name}</td><td>{check.passed ? "Lulus" : "Gagal"}</td><td>{check.note || "—"}</td><td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(check.createdAt)}</td></tr>)}
          {!checks.length && <tr><td className="table-empty" colSpan={4}>Belum ada data uji.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}

async function DuplicateTab() {
  const [kpis, checks] = await Promise.all([
    getKpis(),
    db.duplicateCheckLog.findMany({
      include: { branch: true, existingCustomer: true },
      orderBy: { attemptedAt: "desc" },
      take: 100,
    }),
  ]);
  const duplicatePercent = kpis.find(({ code }) => code === "S1")?.value ?? 0;
  return (
    <>
      <div className="metric-strip"><Metric label="Akun dengan WhatsApp ganda" value={`${duplicatePercent.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} /><Metric label="Percobaan ganda tercegah" value={checks.length} /></div>
      <section className="table-card section-spacer">
        <div className="table-titlebar"><div><h2>Riwayat percobaan pendaftaran ganda</h2><p>Nomor yang sudah terdaftar ditolak saat pendaftaran.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>NAMA SAAT DIDAFTARKAN</th><th>PELANGGAN TERDAFTAR</th><th>CABANG</th><th>WAKTU</th></tr></thead>
          <tbody>{checks.map((check) => <tr key={check.id}><td><strong>{check.attemptedName}</strong></td><td>{check.existingCustomer.name}<br /><small>{check.existingCustomer.whatsapp}</small></td><td>{check.branch.name}</td><td>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(check.attemptedAt)}</td></tr>)}
            {!checks.length && <tr><td className="table-empty" colSpan={4}>Belum ada percobaan nomor ganda.</td></tr>}</tbody>
        </table></div>
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric-box"><span>{label}</span><strong>{value}</strong></div>;
}
