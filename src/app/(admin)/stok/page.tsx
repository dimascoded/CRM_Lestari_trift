import Link from "next/link";
import { addStockItem, confirmStockToday, markStockSold, removeStockItem, restoreStockItem, updateStockItem } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { currentTime, DEAD_STOCK_DAYS, daysBefore, jakartaDayKey, STOCK_CATEGORIES, STOCK_SIZES } from "@/lib/business-rules";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StockPage({ searchParams }: { searchParams: SearchParams }) {
  return <StockContent searchParams={searchParams} />;
}

async function StockContent({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage(["OWNER", "MANAGER", "STOCK_STAFF"]);
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const detail = typeof params.matches === "string" ? params.matches : undefined;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const branchId = typeof params.branch === "string" ? params.branch : "";
  const category = typeof params.category === "string" ? params.category : "";
  const requestedStatus = typeof params.itemStatus === "string" ? params.itemStatus : "";
  const itemStatus = ["AVAILABLE", "SOLD", "REMOVED"].includes(requestedStatus) ? requestedStatus : "";
  const activeTab = "log";
  const editId = typeof params.edit === "string" ? params.edit : "";
  const showAdd = params.add === "1";
  const now = currentTime();
  const today = jakartaDayKey(now);
  const deadStockDate = daysBefore(DEAD_STOCK_DAYS, now);
  const [branches, branchCounts, branchLogs, items, categoryRows, available, deadStock, notificationCount, editItem, logs] = await Promise.all([
    db.branch.findMany({ orderBy: { name: "asc" } }),
    db.stockItem.groupBy({ by: ["branchId"], where: { status: "AVAILABLE" }, _count: { _all: true } }),
    db.stockUpdateLog.findMany({ orderBy: { updatedAt: "desc" }, take: 1000, select: { id: true, branchId: true, type: true, updatedAt: true } }),
    db.stockItem.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(category ? { category } : {}),
        ...(itemStatus ? { status: itemStatus } : {}),
        ...(query ? { OR: [{ name: { contains: query } }, { category: { contains: query } }] } : {}),
      },
      include: { branch: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.stockItem.findMany({ select: { category: true }, distinct: ["category"], orderBy: { category: "asc" } }),
    db.stockItem.count({ where: { status: "AVAILABLE" } }),
    db.stockItem.count({ where: { status: "AVAILABLE", enteredAt: { lt: deadStockDate } } }),
    db.stockMatchNotification.count(),
    editId ? db.stockItem.findUnique({ where: { id: editId } }) : Promise.resolve(null),
    db.stockUpdateLog.findMany({ include: { branch: true }, orderBy: { updatedAt: "desc" }, take: 12 }),
  ]);
  const branchCountMap = new Map(branchCounts.map(({ branchId: id, _count }) => [id, _count._all]));
  const managedBranches = staff.role === "OWNER" ? branches : branches.filter(({ id }) => id === staff.branchId);
  const editableItem = editItem && (staff.role === "OWNER" || editItem.branchId === staff.branchId) ? editItem : null;
  const lastChangeByBranch = new Map<string, Date>();
  const confirmedTodayBranches = new Set<string>();
  for (const log of branchLogs) {
    if (log.type === "CHANGE" && !lastChangeByBranch.has(log.branchId)) {
      lastChangeByBranch.set(log.branchId, log.updatedAt);
    }
    if (log.type === "CONFIRM" && jakartaDayKey(log.updatedAt) === today) {
      confirmedTodayBranches.add(log.branchId);
    }
  }
  const categories = categoryRows.map(({ category: itemCategory }) => itemCategory);

  return (
    <div className="page-content">
      <PageHeader eyebrow="OPERASIONAL · INVENTARIS" title="Katalog stok lintas cabang" description="Tambah, ubah, tandai terjual, dan arsipkan barang tanpa menghapus riwayat." action={<Link className="button" href="/stok?add=1">＋ Tambah barang</Link>} />
      <Notice status={status} detail={detail} />
      <div className="metric-strip">
        <div className="metric-box"><span>Barang tersedia</span><strong>{available}</strong></div>
        <div className="metric-box"><span>Stok mati · lebih dari {DEAD_STOCK_DAYS} hari</span><strong>{deadStock}</strong></div>
        <div className="metric-box"><span>Notifikasi wishlist tersimpan</span><strong>{notificationCount}</strong></div>
      </div>

      <section className="branch-update-grid section-spacer">
        {managedBranches.map((branch) => {
          const lastChange = lastChangeByBranch.get(branch.id);
          const changedToday = lastChange ? jakartaDayKey(lastChange) === today : false;
          const confirmedToday = confirmedTodayBranches.has(branch.id);
          return (
            <article className="branch-update-card" key={branch.id}>
              <div className="branch-update-heading"><strong>{branch.name}</strong><span className={`status ${changedToday ? "" : "warning"}`}>{changedToday ? "Ada perubahan hari ini" : "Belum ada perubahan hari ini"}</span></div>
              <p>{branchCountMap.get(branch.id) ?? 0} barang tersedia</p>
              <small>Perubahan katalog terakhir: {lastChange ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(lastChange) : "Belum ada"}</small>
              <small>Konfirmasi stok: {confirmedToday ? "Sudah dicatat hari ini" : "Belum dicatat hari ini"}</small>
              <form action={confirmStockToday}><input type="hidden" name="branchId" value={branch.id} /><label className="field">Jumlah barang fisik<input name="countedItems" type="number" min="0" step="1" required /></label><button className="button small secondary" type="submit">{confirmedToday ? "Catat konfirmasi ulang" : "Konfirmasi stok hari ini"}</button></form>
            </article>
          );
        })}
      </section>

      {showAdd && <StockForm branches={managedBranches} action={addStockItem} title="Tambah barang" />}
      {editableItem && <StockForm branches={managedBranches} action={updateStockItem} item={editableItem} title={`Ubah barang · ${editableItem.name}`} />}
      {editId && !editableItem && <div className="notice error">Barang tidak ditemukan atau dikelola oleh cabang lain.</div>}

      <div className="stock-workspace section-spacer">
        <section className="table-card">
          <div className="table-titlebar"><div><h2>Stok semua cabang</h2><p>Daftar barang dan status ketersediaan lintas cabang.</p></div>
            <form className="filter-row" method="get">
              <input type="hidden" name="tab" value={activeTab} />
              <input className="search-input" name="q" defaultValue={query} placeholder="Cari nama barang..." aria-label="Cari stok" />
              <select name="category" defaultValue={category} aria-label="Filter kategori"><option value="">Semua kategori</option>{categories.map((itemCategory) => <option key={itemCategory}>{itemCategory}</option>)}</select>
              <select name="branch" defaultValue={branchId} aria-label="Filter cabang"><option value="">Semua cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
              <select name="itemStatus" defaultValue={itemStatus} aria-label="Filter status barang"><option value="">Semua status</option><option value="AVAILABLE">Tersedia</option><option value="SOLD">Terjual</option><option value="REMOVED">Diarsipkan</option></select>
              <button className="button secondary" type="submit">Filter</button>
            </form>
          </div>
          <div className="table-scroll"><table><thead><tr><th>BARANG</th><th>KATEGORI</th><th>UKURAN</th><th>CABANG</th><th>MASUK</th><th>STATUS</th><th>AKSI</th></tr></thead>
            <tbody>{items.map((item) => {
              const dead = item.status === "AVAILABLE" && item.enteredAt < deadStockDate;
              const statusLabel = item.status === "REMOVED" ? "Diarsipkan" : item.status === "SOLD" ? "Terjual" : dead ? "Stok mati" : "Tersedia";
              const statusTone = item.status === "AVAILABLE" && !dead ? "" : "neutral";
              const canManageItem = staff.role === "OWNER" || item.branchId === staff.branchId;
              const editParams = new URLSearchParams();
              if (query) editParams.set("q", query);
              if (category) editParams.set("category", category);
              if (branchId) editParams.set("branch", branchId);
              if (itemStatus) editParams.set("itemStatus", itemStatus);
              editParams.set("tab", activeTab);
              editParams.set("edit", item.id);
              return <tr key={item.id}>
                <td><div className="stock-name"><span className="stock-thumb">♧</span><strong>{item.name}</strong></div></td><td>{item.category}</td><td><span className="tag">{item.size}</span></td><td>{item.branch.name}</td>
                <td>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(item.enteredAt)}</td>
                <td><span className={`status ${dead ? "warning" : statusTone}`}>{statusLabel}</span></td>
                <td><div className="stock-actions">
                  {canManageItem ? <>
                    {item.status === "AVAILABLE" && <>
                      <Link className="inline-action" href={`/stok?${editParams.toString()}`}>Ubah</Link>
                      <form action={markStockSold} className="inline-form"><input type="hidden" name="stockId" value={item.id} /><ConfirmSubmitButton className="inline-action" confirmMessage={`Tandai ${item.name} sebagai terjual?`}>Tandai terjual</ConfirmSubmitButton></form>
                      <form action={removeStockItem} className="inline-form"><input type="hidden" name="stockId" value={item.id} /><ConfirmSubmitButton className="inline-action danger" confirmMessage={`Keluarkan ${item.name} dari katalog aktif? Riwayatnya tetap tersimpan.`}>Arsipkan</ConfirmSubmitButton></form>
                    </>}
                    {item.status === "REMOVED" && <form action={restoreStockItem} className="inline-form"><input type="hidden" name="stockId" value={item.id} /><button className="inline-action" type="submit">Pulihkan</button></form>}
                    {item.status === "SOLD" && "—"}
                  </> : <span className="field-hint">Kelola di cabang {item.branch.name}</span>}
                </div></td>
              </tr>;
            })}{!items.length && <tr><td className="table-empty" colSpan={7}>Belum ada stok yang cocok dengan filter ini.</td></tr>}</tbody>
          </table></div>
        </section>

        <aside className="panel stock-side-panel">
          <div className="panel-header"><div><h2 className="panel-title">Log aktivitas stok</h2><p className="panel-subtitle">Perubahan dan konfirmasi jumlah aktual.</p></div></div>
          <div className="activity-list">
            {logs.map((log) => <div className="activity-row" key={log.id}><span className="activity-dot" /><div className="activity-body"><strong>{log.branch.name}</strong><small>{log.type === "CONFIRM" ? `Hitung fisik ${log.countedItems ?? "—"} · sistem ${log.systemCount ?? "—"}` : "Katalog stok diperbarui"}</small></div><span className="activity-amount">{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(log.updatedAt)}</span></div>)}
            {!logs.length && <div className="empty-state">Belum ada log pembaruan.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StockForm({ branches, action, item, title }: {
  branches: { id: string; name: string }[];
  action: (formData: FormData) => void | Promise<void>;
  item?: { id: string; name: string; category: string; size: string; branchId: string };
  title: string;
}) {
  return (
    <section className="form-card stock-form-card section-spacer" id="stock-form">
      <h2>{title}</h2><p>Lengkapi detail barang dan cabang penyimpanan.</p>
      <form action={action}>
        {item && <input type="hidden" name="stockId" value={item.id} />}
        <div className="form-grid">
          <div className="field"><label htmlFor="stock-name">Nama barang</label><input id="stock-name" name="name" required maxLength={100} defaultValue={item?.name} placeholder="Contoh: Kemeja linen vintage" /></div>
          <div className="field"><label htmlFor="stock-category">Kategori</label><select id="stock-category" name="category" required defaultValue={item?.category ?? ""}><option value="" disabled>Pilih kategori</option>{STOCK_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
          <div className="field"><label htmlFor="stock-size">Ukuran</label><select id="stock-size" name="size" required defaultValue={item?.size ?? ""}><option value="" disabled>Pilih ukuran</option>{STOCK_SIZES.map((size) => <option key={size}>{size}</option>)}</select></div>
          <div className="field"><label htmlFor="stock-branch">Cabang</label><select id="stock-branch" name="branchId" required defaultValue={item?.branchId ?? (branches.length === 1 ? branches[0].id : "")}><option value="" disabled>Pilih cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
        </div>
        <div className="form-actions"><button className="button" type="submit">{item ? "Simpan perubahan" : "Simpan barang"}</button><Link className="button secondary" href="/stok">Batal</Link></div>
      </form>
    </section>
  );
}
