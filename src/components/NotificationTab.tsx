import { updateStockNotificationTemplate } from "@/app/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { DEFAULT_STOCK_NOTIFICATION_MESSAGE } from "@/lib/business-rules";
import { renderStockNotificationMessage } from "@/lib/wishlist-match";
import { db } from "@/lib/db";
import { describeMessageStatus } from "@/lib/message-status";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  return <NotificationsContent searchParams={searchParams} />;
}

async function NotificationsContent({ searchParams }: { searchParams: SearchParams }) {
  const [staff, params] = await Promise.all([requireStaffPage(), searchParams]);
  const status = typeof params.status === "string" ? params.status : undefined;
  const where = staff.role === "OWNER" ? {} : { stockItem: { branchId: staff.branchId ?? "" } };
  const [template, notifications] = await Promise.all([
    db.stockNotificationTemplate.findUnique({ where: { id: "wishlist" } }),
    db.stockMatchNotification.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        stockItem: { include: { branch: { select: { name: true } } } },
      },
      orderBy: { sentAt: "desc" },
      take: 100,
    }),
  ]);
  const message = template?.message ?? DEFAULT_STOCK_NOTIFICATION_MESSAGE;
  const preview = renderStockNotificationMessage(message, {
    customerName: "Dinda Putri",
    stockName: "Kemeja Linen",
    size: "M",
    branchName: "Yogyakarta",
  });

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="OPERASIONAL · PESAN"
        title="Notifikasi wishlist"
        description="Atur pesan untuk notifikasi stok berikutnya dan lihat catatan simulasinya."
      />
      <Notice status={status} />

      <section className="form-card">
        <h2>Template pesan</h2>
        <p>Perubahan hanya berlaku untuk notifikasi baru. Riwayat yang sudah tercatat tidak diubah; WhatsApp tidak benar-benar dikirim.</p>
        <form action={updateStockNotificationTemplate}>
          <div className="field">
            <label htmlFor="stock-notification-message">Isi pesan</label>
            <textarea
              id="stock-notification-message"
              name="message"
              required
              maxLength={500}
              rows={4}
              defaultValue={message}
            />
            <span className="field-hint">Placeholder: {"{nama}"}, {"{barang}"}, {"{ukuran}"}, dan {"{cabang}"}.</span>
          </div>
          <div className="section-spacer warning-callout">
            <strong>Contoh pesan</strong>
            <p className="preview-message">{preview}</p>
          </div>
          <div className="form-actions"><button className="button" type="submit">Simpan template</button></div>
        </form>
      </section>

      <section className="table-card section-spacer">
        <div className="table-titlebar">
          <div><h2>Riwayat notifikasi</h2><p>{notifications.length} catatan terbaru{notifications.length === 100 ? " (maksimal 100)" : ""}. Status ini simulasi, bukan bukti delivery WhatsApp.</p></div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>PELANGGAN</th><th>BARANG</th><th>PESAN</th><th>STATUS</th><th>WAKTU</th></tr></thead>
            <tbody>
              {notifications.map((notification) => {
                const body = notification.body || renderStockNotificationMessage(DEFAULT_STOCK_NOTIFICATION_MESSAGE, {
                  customerName: notification.customer.name,
                  stockName: notification.stockItem.name,
                  size: notification.stockItem.size,
                  branchName: notification.stockItem.branch.name,
                });
                const messageStatus = describeMessageStatus(notification.status);
                return (
                  <tr key={notification.id}>
                    <td><strong>{notification.customer.name}</strong><br /><small>{notification.stockItem.branch.name}</small></td>
                    <td>{notification.stockItem.name}<br /><small>{notification.stockItem.category} · {notification.stockItem.size}</small></td>
                    <td>{body}</td>
                    <td><span className={`status ${messageStatus.isSimulated ? "" : "neutral"}`}>{messageStatus.label}</span></td>
                    <td>{new Intl.DateTimeFormat("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Jakarta",
                    }).format(notification.sentAt)}</td>
                  </tr>
                );
              })}
              {!notifications.length && <tr><td className="table-empty" colSpan={5}>Belum ada notifikasi wishlist yang tercatat untuk cabang ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
