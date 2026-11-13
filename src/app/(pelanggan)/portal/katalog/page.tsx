import { PageHeader } from "@/components/PageHeader";
import { StockCatalog } from "@/components/StockCatalog";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PortalCatalogPage({ searchParams }: { searchParams: SearchParams }) {
  return <PortalCatalogContent searchParams={searchParams} />;
}

async function PortalCatalogContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const get = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  return (
    <div className="page-content">
      <PageHeader eyebrow="PORTAL PELANGGAN" title="Katalog stok lintas cabang" description="Lihat barang yang tersedia dan saring berdasarkan kategori, ukuran, atau cabang." />
      <StockCatalog category={get("category")} size={get("size")} branch={get("branch")} action="/portal/katalog" />
    </div>
  );
}
