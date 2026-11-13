import { db } from "@/lib/db";

type Props = {
  category?: string;
  size?: string;
  branch?: string;
  action: string;
};

export async function StockCatalog({ category = "", size = "", branch = "", action }: Props) {
  const [branches, categoryRows, sizeRows, items] = await Promise.all([
    db.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.stockItem.findMany({ where: { status: "AVAILABLE" }, select: { category: true }, distinct: ["category"], orderBy: { category: "asc" } }),
    db.stockItem.findMany({ where: { status: "AVAILABLE" }, select: { size: true }, distinct: ["size"], orderBy: { size: "asc" } }),
    db.stockItem.findMany({
      where: {
        status: "AVAILABLE",
        ...(category ? { category } : {}),
        ...(size ? { size } : {}),
        ...(branch ? { branchId: branch } : {}),
      },
      include: { branch: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 100,
    }),
  ]);
  return (
    <>
      <section className="form-card catalog-filter">
        <form className="filter-row" method="get" action={action}>
          <label className="visually-hidden" htmlFor="catalog-category">Kategori</label>
          <select id="catalog-category" name="category" defaultValue={category}><option value="">Semua kategori</option>{categoryRows.map(({ category: value }) => <option key={value} value={value}>{value}</option>)}</select>
          <label className="visually-hidden" htmlFor="catalog-size">Ukuran</label>
          <select id="catalog-size" name="size" defaultValue={size}><option value="">Semua ukuran</option>{sizeRows.map(({ size: value }) => <option key={value} value={value}>{value}</option>)}</select>
          <label className="visually-hidden" htmlFor="catalog-branch">Cabang</label>
          <select id="catalog-branch" name="branch" defaultValue={branch}><option value="">Semua cabang</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button className="button secondary" type="submit">Terapkan filter</button>
        </form>
      </section>
      <section className="catalog-grid section-spacer" aria-label="Barang tersedia">
        {items.map((item) => (
          <article className="catalog-card" key={item.id}>
            <span className="catalog-icon">♧</span>
            <div><h2>{item.name}</h2><p>{item.category} · Ukuran {item.size}</p><small>{item.branch.name}</small></div>
          </article>
        ))}
        {!items.length && <div className="empty-state panel">Tidak ada barang tersedia yang cocok dengan filter.</div>}
      </section>
    </>
  );
}
