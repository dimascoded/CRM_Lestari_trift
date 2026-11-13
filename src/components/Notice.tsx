import { rupiah } from "@/lib/business-rules";

const messages: Record<string, { text: string; tone?: "success" | "warning" | "error" }> = {
  "invalid-customer": { text: "Nama, nomor WhatsApp valid, dan cabang wajib diisi.", tone: "error" },
  duplicate: { text: "Nomor WhatsApp sudah terdaftar. Cari pelanggan yang ada, jangan daftarkan ulang.", tone: "warning" },
  "customer-created": { text: "Pelanggan berhasil didaftarkan. Kartu stamp digital sudah aktif.", tone: "success" },
  "invalid-transaction": { text: "Lengkapi pelanggan, cabang, dan nominal transaksi yang valid.", tone: "error" },
  "customer-not-found": { text: "Pelanggan tidak ditemukan.", tone: "error" },
  "below-minimum": { text: "Transaksi tercatat. Belum mendapat stamp karena belum mencapai nominal minimal.", tone: "warning" },
  "already-stamped": { text: "Transaksi tercatat, tetapi stamp ditolak: pelanggan sudah mendapat stamp hari ini.", tone: "warning" },
  "stamp-added": { text: "Transaksi tercatat dan 1 stamp berhasil ditambahkan.", tone: "success" },
  "invalid-stock": { text: "Lengkapi nama barang, kategori, ukuran, dan cabang.", tone: "error" },
  "invalid-stock-id": { text: "Pilih barang yang valid.", tone: "error" },
  "stock-sold": { text: "Barang ditandai terjual dan pembaruan cabang tercatat.", tone: "success" },
  "stock-updated": { text: "Detail barang berhasil diperbarui dan log cabang dicatat.", tone: "success" },
  "stock-already-sold": { text: "Barang ini sudah ditandai terjual.", tone: "warning" },
  "stock-added": { text: "Stok tersimpan dan wishlist yang cocok sudah diperiksa.", tone: "success" },
  "stock-confirmed": { text: "Stok cabang dikonfirmasi untuk hari ini.", tone: "success" },
  "invalid-wishlist": { text: "Pilih pelanggan dan isi setidaknya satu kriteria wishlist.", tone: "error" },
  "invalid-wishlist-id": { text: "Item wishlist tidak valid.", tone: "error" },
  "wishlist-created": { text: "Wishlist berhasil ditambahkan.", tone: "success" },
  "invalid-template": { text: "Lengkapi nama, isi pesan, dan segmen reminder.", tone: "error" },
  "invalid-template-id": { text: "Pilih template reminder yang valid.", tone: "error" },
  "template-not-found": { text: "Template tidak ditemukan atau sudah dinonaktifkan.", tone: "error" },
  "template-created": { text: "Template reminder berhasil disimpan.", tone: "success" },
  "preference-updated": { text: "Preferensi pesan pelanggan berhasil diperbarui.", tone: "success" },
  "invalid-phone": { text: "Masukkan nomor WhatsApp yang valid.", tone: "error" },
  "login-failed": { text: "Kode simulasi salah. Gunakan kode 123456.", tone: "error" },
  "invalid-role": { text: "Peran yang dipilih tidak valid.", tone: "error" },
};

export function Notice({
  status,
  detail,
  discount,
  amount,
}: {
  status?: string;
  detail?: string;
  discount?: string;
  amount?: string;
}) {
  if (!status) return null;
  if (status === "campaign-sent") {
    return <div className="notice success">Simulasi reminder selesai. {detail ?? "0"} pelanggan menerima pesan.</div>;
  }
  const message = messages[status];
  if (!message) return null;
  const discountAmount = Number(discount);
  const transactionAmount = Number(amount);
  const text = discountAmount > 0 && Number.isFinite(transactionAmount)
    ? `Diskon stamp ${rupiah(discountAmount)} diterapkan, total bayar ${rupiah(transactionAmount - discountAmount)}. ${message.text}`
    : status === "stock-added" && detail
      ? `Stok tersimpan. ${detail} wishlist cocok ditemukan; simulasi notifikasi WhatsApp dibuat.`
      : message.text;
  return <div className={`notice ${message.tone ?? "success"}`}>{text}</div>;
}
