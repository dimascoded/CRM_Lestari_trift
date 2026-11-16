import Link from "next/link";
import { addStockItem, confirmStockToday, markStockSold, updateStockItem } from "@/app/actions";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffPage } from "@/lib/auth";
import { currentTime, DEAD_STOCK_DAYS, daysBefore, jakartaDayKey } from "@/lib/business-rules";
import { db } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StockPage({ searchParams }: { searchParams: SearchParams }) {
  return <StockContent searchParams={searchParams} />;
}

async function StockContent({ searchParams }: { searchParams: SearchParams }) {
  await requireStaffPage(["OWNER", "MANAGER", "STOCK_STAFF"]);
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const detail = typeof params.matches === "string" ? params.matches : undefined;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const branchId = typeof params.branch === "string" ? params.branch : "";
  const category = typeof params.category === "string" ? params.category : "";
  const activeTab = params.tab === "log" ? "log" : "notifikasi";
  const editId = typeof params.edit === "string" ? params.edit : "";
  const showAdd = params.add === "1";
  const now = currentTime();
  const today = jakartaDayKey(now);
  const deadStockDate = daysBefore(DEAD_STOCK_DAYS, now);
  const [branches, branchCounts, branchLogs, items, categoryRows, available, deadStock, notificationCount, editItem, notifications, logs] = await Promise.all([
    db.branch.findMany({ orderBy: { name: "asc" } }),
    db.stockItem.groupBy({ by: ["branchId"], where: { status: "AVAILABLE" }, _count: { _all: true } }),
    db.stockUpdateLog.findMany({ orderBy: { updatedAt: "desc" }, take: 1000, select: { id: true, branchId: true, type: true, updatedAt: true } }),
    db.stockItem.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(category ? { category } : {}),
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
    activeTab === "notifikasi"
      ? db.stockMatchNotification.findMany({
          include: { customer: true, stockItem: { include: { branch: true } } },
          orderBy: { sentAt: "desc" },
          take: 12,
        })
      : Promise.resolve([]),
    activeTab === "log"
      ? db.stockUpdateLog.findMany({ include: { branch: true }, orderBy: { updatedAt: "desc" }, take: 12 })
      : Promise.resolve([]),
  ]);
  const branchCountMap = new Map(branchCounts.map(({ branchId: id, _count }) => [id, _count._all]));
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
      <PageHeader eyebrow="OPERASIONAL · INVENTARIS" title="Katalog stok lintas cabang" description="Kelola stok dan konfirmasi pembaruan harian per cabang." action={<Link className="button" href="/stok?add=1">＋ Tambah barang</Link>} />
      <Notice status={status} detail={detail} />
      <div className="metric-strip">
        <div className="metric-box"><span>Barang tersedia</span><strong>{available}</strong></div>
        <div className="metric-box"><span>Stok mati · lebih dari {DEAD_STOCK_DAYS} hari</span><strong>{deadStock}</strong></div>
        <div className="metric-box"><span>Notifikasi wishlist tersimpan</span><strong>{notificationCount}</strong></div>
      </div>

      <section className="branch-update-grid section-spacer">
        {branches.map((branch) => {
          const lastChange = lastChangeByBranch.get(branch.id);
          const changedToday = lastChange ? jakartaDayKey(lastChange) === today : false;
          const confirmedToday = confirmedTodayBranches.has(branch.id);
          return (
            <article className="branch-update-card" key={branch.id}>
              <div className="branch-update-heading"><strong>{branch.name}</strong><span className={`status ${changedToday ? "" : "warning"}`}>{changedToday ? "Ada perubahan hari ini" : "Belum ada perubahan hari ini"}</span></div>
              <p>{branchCountMap.get(branch.id) ?? 0} barang tersedia</p>
              <small>Perubahan katalog terakhir: {lastChange ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(lastChange) : "Belum ada"}</small>
              <small>Konfirmasi stok: {confirmedToday ? "Sudah dicatat hari ini" : "Belum dicatat hari ini"}</small>
              <form action={confirmStockToday}><input type="hidden" name="branchId" value={branch.id} /><button className="button small secondary" type="submit">{confirmedToday ? "Catat konfirmasi ulang" : "Konfirmasi stok hari ini"}</button></form>
            </article>
          );
        })}
      </section>

      {showAdd && <StockForm branches={branches} action={addStockItem} title="Tambah barang" />}
      {editItem && <StockForm branches={branches} action={updateStockItem} item={editItem} title={`Ubah barang · ${editItem.name}`} />}
      {editId && !editItem && <div className="notice error">Barang yang akan diubah tidak ditemukan.</div>}

      <div className="stock-workspace section-spacer">
        <section className="table-card">
          <div className="table-titlebar"><div><h2>Stok semua cabang</h2><p>Daftar barang dan status ketersediaan lintas cabang.</p></div>
            <form className="filter-row" method="get">
              <input type="hidden" name="tab" value={activeTab} />
              <input className="search-input" name="q" defaultValue={query} placeholder="Cari nama barang..." aria-label="Cari stok" />
              <select name="category" defaultValue={category} aria-label="Filter kategori"><option value="">Semua kategori</option>{categories.map((itemCategory) => <option key={itemCategory}>{itemCategory}</option>)}</select>
              <select name="branch" defaultValue={branchId} aria-label="Filter cabang"><option value="">Semua cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
              <button className="button secondary" type="submit">Filter</button>
            </form>
          </div>
          <div className="table-scroll"><table><thead><tr><th>BARANG</th><th>KATEGORI</th><th>UKURAN</th><th>CABANG</th><th>MASUK</th><th>STATUS</th><th>AKSI</th></tr></thead>
            <tbody>{items.map((item) => {
              const dead = item.status === "AVAILABLE" && item.enteredAt < deadStockDate;
              return <tr key={item.id}>
                <td><div className="stock-name"><span className="stock-thumb">♧</span><strong>{item.name}</strong></div></td><td>{item.category}</td><td><span className="tag">{item.size}</span></td><td>{item.branch.name}</td>
                <td>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(item.enteredAt)}</td>
                <td><span className={`status ${dead ? "warning" : item.status === "SOLD" ? "neutral" : ""}`}>{dead ? "Stok mati" : item.status === "SOLD" ? "Terjual" : "Tersedia"}</span></td>
                <td>{item.status === "AVAILABLE" ? <div className="stock-actions"><Link className="inline-action" href={`/stok?edit=${encodeURIComponent(item.id)}&tab=${activeTab}`}>Ubah</Link><form action={markStockSold} className="inline-form"><input type="hidden" name="stockId" value={item.id} /><button className="inline-action" type="submit">Tandai terjual</button></form></div> : "—"}</td>
              </tr>;
            })}{!items.length && <tr><td className="table-empty" colSpan={7}>Belum ada stok yang cocok dengan filter ini.</td></tr>}</tbody>
          </table></div>
        </section>

        <aside className="panel stock-side-panel">
          <div className="panel-header"><div><h2 className="panel-title">Aktivitas stok</h2><p className="panel-subtitle">Notifikasi wishlist dan riwayat konfirmasi.</p></div></div>
          <nav className="tabs stock-tabs" aria-label="Aktivitas stok"><Link className={`tab${activeTab === "notifikasi" ? " active" : ""}`} href="/stok?tab=notifikasi">Notifikasi</Link><Link className={`tab${activeTab === "log" ? " active" : ""}`} href="/stok?tab=log">Log</Link></nav>
          <div className="activity-list">
            {activeTab === "notifikasi"
              ? notifications.map(({ id, customer, stockItem, sentAt }) => <div className="activity-row" key={id}><span className="activity-dot" /><div className="activity-body"><strong>{customer.name}</strong><small>“Hai {customer.name.split(/\s+/)[0]}, barang wishlist kamu ada: {stockItem.name} ({stockItem.size}) di cabang {stockItem.branch.name}.”</small></div><span className="activity-amount">{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }).format(sentAt)}</span></div>)
              : logs.map((log) => <div className="activity-row" key={log.id}><span className="activity-dot" /><div className="activity-body"><strong>{log.branch.name}</strong><small>{log.type === "CONFIRM" ? "Stok dikonfirmasi" : "Katalog stok diperbarui"}</small></div><span className="activity-amount">{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(log.updatedAt)}</span></div>)}
            {activeTab === "notifikasi" && !notifications.length && <div className="empty-state">Belum ada notifikasi wishlist.</div>}
            {activeTab === "log" && !logs.length && <div className="empty-state">Belum ada log pembaruan.</div>}
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
    <section className="form-card stock-form-card section-spacer">
      <h2>{title}</h2><p>Lengkapi detail barang dan cabang penyimpanan.</p>
      <form action={action}>
        {item && <input type="hidden" name="stockId" value={item.id} />}
        <div className="form-grid">
          <div className="field"><label htmlFor="stock-name">Nama barang</label><input id="stock-name" name="name" required maxLength={100} defaultValue={item?.name} placeholder="Contoh: Kemeja linen vintage" /></div>
          <div className="field"><label htmlFor="stock-category">Kategori</label><select id="stock-category" name="category" required defaultValue={item?.category ?? ""}><option value="" disabled>Pilih kategori</option>{["Atasan", "Bawahan", "Dress", "Outer", "Aksesori", "Sepatu", "Lainnya"].map((category) => <option key={category}>{category}</option>)}</select></div>
          <div className="field"><label htmlFor="stock-size">Ukuran</label><select id="stock-size" name="size" required defaultValue={item?.size ?? ""}><option value="" disabled>Pilih ukuran</option>{["XS", "S", "M", "L", "XL", "XXL", "All size"].map((size) => <option key={size}>{size}</option>)}</select></div>
          <div className="field"><label htmlFor="stock-branch">Cabang</label><select id="stock-branch" name="branchId" required defaultValue={item?.branchId ?? ""}><option value="" disabled>Pilih cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
        </div>
        <div className="form-actions"><button className="button" type="submit">{item ? "Simpan perubahan" : "Simpan barang"}</button><Link className="button secondary" href="/stok">Batal</Link></div>
      </form>
    </section>
  );
}
