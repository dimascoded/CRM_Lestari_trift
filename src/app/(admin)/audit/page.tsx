import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";

const actionLabels: Record<string, string> = {
  STAFF_LOGIN: "Staf masuk",
  STAFF_LOGOUT: "Staf keluar",
  CUSTOMER_CREATED: "Pelanggan dibuat",
  CUSTOMER_UPDATED: "Pelanggan diperbarui",
  CUSTOMER_ARCHIVED: "Pelanggan diarsipkan",
  CUSTOMER_RESTORED: "Pelanggan dipulihkan",
  CUSTOMER_CONSENT_GRANTED: "Persetujuan diberikan",
  CUSTOMER_CONSENT_RECONFIRMED: "Persetujuan ditegaskan",
  CUSTOMER_CONSENT_REVOKED: "Persetujuan dicabut",
  CUSTOMER_CONSENT_DECLINED: "Persetujuan ditolak",
  TRANSACTION_VOIDED: "Transaksi dibatalkan",
  STAFF_ACCOUNT_CREATED: "Akun staf dibuat",
  STAFF_ACCOUNT_UPDATED: "Akun staf diperbarui",
  STAFF_ACCOUNT_ACTIVATED: "Akun staf diaktifkan",
  STAFF_ACCOUNT_DEACTIVATED: "Akun staf dinonaktifkan",
  REMINDER_TEMPLATE_CREATED: "Template reminder dibuat",
  REMINDER_TEMPLATE_UPDATED: "Template reminder diperbarui",
  REMINDER_TEMPLATE_ACTIVATED: "Template reminder diaktifkan",
  REMINDER_TEMPLATE_DEACTIVATED: "Template reminder dinonaktifkan",
  REMINDER_TEMPLATE_DELETED: "Template reminder dihapus",
  STOCK_NOTIFICATION_TEMPLATE_UPDATED: "Template notifikasi stok diperbarui",
  REMINDER_CAMPAIGN_RUN: "Kampanye simulasi dijalankan",
  REMINDER_SCHEDULER_RUN: "Scheduler simulasi dijalankan",
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export default async function AuditLogPage() {
  await requireStaffPage(["OWNER"]);
  const entries = await db.auditLog.findMany({
    take: 100,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      user: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="PENGATURAN · AKUNTABILITAS"
        title="Jejak audit"
        description="Riwayat baca-saja untuk tindakan staf dan perubahan persetujuan. Ringkasan tidak memuat password, token, kode OTP, atau isi pesan."
      />
      <section className="table-card">
        <div className="table-titlebar">
          <div>
            <h2>Aktivitas terbaru</h2>
            <p>Menampilkan hingga 100 catatan terbaru. Waktu ditampilkan dalam WIB.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>WAKTU</th><th>AKSI</th><th>AKTOR</th><th>CABANG</th><th>RINGKASAN</th><th>ID ENTITAS</th></tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{dateFormatter.format(entry.createdAt)}</td>
                  <td>{actionLabels[entry.action] ?? entry.action}</td>
                  <td>{entry.user?.name ?? "Pelanggan / sistem"}</td>
                  <td>{entry.branch?.name ?? "Semua cabang"}</td>
                  <td>{entry.summary}</td>
                  <td><code>{entry.entityId ?? "—"}</code></td>
                </tr>
              ))}
              {!entries.length && <tr><td className="table-empty" colSpan={6}>Belum ada aktivitas yang tercatat.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
