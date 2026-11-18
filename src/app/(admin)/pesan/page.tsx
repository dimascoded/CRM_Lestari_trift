import Link from "next/link";
import {
  createReminderTemplate,
  deleteReminderTemplate,
  markFollowedUp,
  runReminderScheduler,
  sendReminderCampaign,
  setReminderTemplateActive,
  updateReminderTemplate,
} from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import NotificationTab from "@/components/NotificationTab";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { FOLLOWUP_QUEUES, getFollowUpQueues, type FollowUpQueue } from "@/lib/followup-service";
import { reminderEnabled } from "@/lib/rollout";
import { FOLLOWUP_NOTE_MAX_LENGTH, SEGMENTS, REMINDER_COOLDOWN_DAYS } from "@/lib/business-rules";
import { db } from "@/lib/db";
import { describeMessageStatus } from "@/lib/message-status";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const tabs = [
  { id: "antrean", label: "Antrean" },
  { id: "reminder", label: "Reminder" },
  { id: "notifikasi", label: "Notifikasi" },
  { id: "log", label: "Log" },
] as const;
type Tab = (typeof tabs)[number]["id"];

const queueLabels: Record<FollowUpQueue, string> = {
  JATUH_TEMPO: "Jatuh tempo",
  SATU_STAMP: "Satu stamp lagi",
  TIDAK_AKTIF: "Tidak aktif",
  WISHLIST_BELUM: "Wishlist belum diproses",
};

export default async function PesanPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage();
  const params = await searchParams;
  const value = typeof params.tab === "string" ? params.tab : "antrean";
  const tab: Tab = tabs.find(({ id }) => id === value)?.id ?? "antrean";
  const status = typeof params.status === "string" ? params.status : undefined;
  const detail = typeof params.count === "string" ? params.count : typeof params.detail === "string" ? params.detail : undefined;
  return (
    <div className="page-content">
      <PageHeader eyebrow="OPERASIONAL · PESAN" title="Pesan & tindak lanjut" description="Kelola antrean pelanggan dan tinjau catatan simulasi pesan." />
      <Notice status={status} detail={detail} />
      <nav className="tabs" aria-label="Tab pesan">{tabs.map(({ id, label }) =>
        <Link className={`tab${tab === id ? " active" : ""}`} href={`/pesan?tab=${id}`} key={id}>{label}</Link>,
      )}</nav>
      {tab === "antrean" && <FollowUpTab staff={staff} />}
      {tab === "reminder" && <ReminderTab searchParams={params} />}
      {tab === "notifikasi" && <NotificationTab searchParams={Promise.resolve(params)} />}
      {tab === "log" && <ReminderLogTab staff={staff} />}
    </div>
  );
}

async function FollowUpTab({ staff }: { staff: { role: string; branchId: string | null } }) {
  const queues = await getFollowUpQueues({ branchId: staff.role === "OWNER" ? null : staff.branchId });
  return <div className="followup-queues">
    {FOLLOWUP_QUEUES.map((queue) => <section className="table-card" key={queue}>
      <div className="table-titlebar"><div><h2>{queueLabels[queue]}</h2><p>{queues[queue].length} pelanggan untuk ditindaklanjuti.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>PELANGGAN</th><th>SEGMEN</th><th>ALASAN</th><th>TRANSAKSI TERAKHIR</th><th>PERSETUJUAN</th><th>AKSI</th></tr></thead><tbody>
        {queues[queue].map((row) => <tr key={row.customerId}>
          <td><Link href={`/pelanggan/${encodeURIComponent(row.customerId)}`}>{row.customerName}</Link></td>
          <td>{row.segment}</td><td>{row.reason}</td>
          <td>{row.lastTransactionAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(row.lastTransactionAt) : "Belum pernah"}</td>
          <td>{row.optedOut ? "Opt-out" : row.marketingConsent ? "Setuju" : "Belum setuju"}</td>
          <td><form action={markFollowedUp} className="inline-form">
            <input type="hidden" name="customerId" value={row.customerId} /><input type="hidden" name="queue" value={queue} />
            <input name="note" maxLength={FOLLOWUP_NOTE_MAX_LENGTH} placeholder="Catatan opsional" aria-label={`Catatan tindak lanjut ${row.customerName}`} />
            <button className="inline-action" type="submit">Tandai sudah dihubungi</button>
          </form></td>
        </tr>)}
        {!queues[queue].length && <tr><td className="table-empty" colSpan={6}>Belum ada data pada antrean ini.</td></tr>}
      </tbody></table></div>
    </section>)}
  </div>;
}

async function ReminderTab({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireStaffPage(["OWNER", "MANAGER", "MARKETING"]);
  const enabled = await reminderEnabled();
  const editId = typeof searchParams.edit === "string" ? searchParams.edit : "";
  const templates = await db.reminderTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { logs: true } } },
  });
  const editing = templates.find(({ id }) => id === editId);
  if (!enabled) return <div className="warning-callout">Fitur belum aktif di tahap roll-out cabang ini.</div>;
  return <div className="management-grid">
    <section className="form-card">
      <h2>{editing ? "Ubah template reminder" : "Buat template reminder"}</h2>
      <p>Pengiriman simulasi mengecualikan opt-out dan membatasi satu pesan per {REMINDER_COOLDOWN_DAYS} hari per pelanggan.</p>
      <form action={editing ? updateReminderTemplate : createReminderTemplate}>
        {editing && <input type="hidden" name="templateId" value={editing.id} />}
        <div className="form-grid">
          <div className="field full"><label htmlFor="reminder-name">Nama template</label><input id="reminder-name" name="name" required maxLength={100} defaultValue={editing?.name ?? ""} /></div>
          <div className="field full"><label htmlFor="reminder-message">Isi pesan</label><textarea id="reminder-message" name="message" required maxLength={1000} defaultValue={editing?.message ?? ""} /></div>
          <div className="field"><label htmlFor="reminder-segment">Jenis reminder</label><select id="reminder-segment" name="segment" defaultValue={editing?.segment ?? "ALL"}><option value="ALL">Semua pelanggan</option><option value="NEW">Pelanggan baru</option><option value="PERSONAL">Reminder personal</option></select></div>
          <div className="field"><label htmlFor="target-segment">Segmen sasaran</label><select id="target-segment" name="targetSegment" defaultValue={editing?.targetSegment ?? ""}><option value="">Semua segmen</option>{Object.entries(SEGMENTS).map(([key, label]) => <option key={key} value={label}>{label}</option>)}</select></div>
          <div className="field"><label htmlFor="reminder-schedule">Jadwal (opsional)</label><input id="reminder-schedule" name="schedule" type="datetime-local" defaultValue={editing?.schedule ? localDateTime(editing.schedule) : ""} /></div>
        </div>
        <div className="form-actions"><button className="button" type="submit">{editing ? "Simpan perubahan" : "Simpan template"}</button>{editing && <Link className="button secondary" href="/pesan?tab=reminder">Batal</Link>}</div>
      </form>
      <div className="section-spacer warning-callout">Simulasi tercatat di database; tidak ada pesan WhatsApp yang dikirim.</div>
    </section>
    <section className="panel">
      <div className="panel-header"><div><h2 className="panel-title">Template reminder</h2><p className="panel-subtitle">Hanya catatan simulasi lokal.</p></div></div>
      <div className="panel-body"><form action={runReminderScheduler}><ConfirmSubmitButton className="button" confirmMessage="Jalankan simulasi reminder? Tidak ada pesan yang dikirim.">Jalankan penjadwal</ConfirmSubmitButton></form></div>
      <div className="wishlist-list">{templates.map((template) => <article className="template-card" key={template.id}>
        <div className="template-top"><strong>{template.name}</strong><span className={`status ${template.active ? "" : "neutral"}`}>{template.active ? "Aktif" : "Nonaktif"}</span></div>
        <span className="tag">{template.segment}{template.targetSegment ? ` · ${template.targetSegment}` : ""}</span><p>{template.message}</p>
        <small>{template._count.logs} simulasi tercatat</small>
        <div className="template-actions">
          <Link className="inline-action" href={`/pesan?tab=reminder&edit=${encodeURIComponent(template.id)}`}>Ubah</Link>
          {template.active && <form action={sendReminderCampaign}><input type="hidden" name="templateId" value={template.id} /><ConfirmSubmitButton className="inline-action" confirmMessage={`Jalankan simulasi “${template.name}”?`}>Jalankan</ConfirmSubmitButton></form>}
          <form action={setReminderTemplateActive}><input type="hidden" name="templateId" value={template.id} /><input type="hidden" name="active" value={String(!template.active)} /><button className="inline-action" type="submit">{template.active ? "Nonaktifkan" : "Aktifkan"}</button></form>
          {!template._count.logs && <form action={deleteReminderTemplate}><input type="hidden" name="templateId" value={template.id} /><ConfirmSubmitButton className="inline-action danger" confirmMessage={`Hapus template “${template.name}”?`}>Hapus</ConfirmSubmitButton></form>}
        </div>
      </article>)}</div>
    </section>
  </div>;
}

function localDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

async function ReminderLogTab({ staff }: { staff: { role: string; branchId: string | null } }) {
  const logs = await db.reminderLog.findMany({
    where: staff.role === "OWNER" ? {} : { customer: { registeredAtId: staff.branchId ?? "" } },
    include: { customer: { select: { id: true, name: true } }, template: { select: { name: true } } },
    orderBy: { sentAt: "desc" },
    take: 100,
  });
  return <section className="table-card"><div className="table-titlebar"><div><h2>Log reminder simulasi</h2><p>Riwayat bukan bukti delivery WhatsApp.</p></div></div>
    <div className="table-scroll"><table><thead><tr><th>PELANGGAN</th><th>TEMPLATE</th><th>WAKTU</th><th>STATUS</th></tr></thead><tbody>
      {logs.map((log) => <tr key={log.id}><td><Link href={`/pelanggan/${encodeURIComponent(log.customer.id)}`}>{log.customer.name}</Link></td><td>{log.template.name}</td><td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(log.sentAt)}</td><td>{describeMessageStatus(log.status).label}</td></tr>)}
      {!logs.length && <tr><td className="table-empty" colSpan={4}>Belum ada data pada periode ini.</td></tr>}
    </tbody></table></div>
  </section>;
}
