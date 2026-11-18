import { rupiah } from "@/lib/business-rules";

const messages: Record<string, { text: string; tone?: "success" | "warning" | "error" }> = {
  "invalid-customer": { text: "Nama, nomor WhatsApp valid, dan cabang wajib diisi.", tone: "error" },
  duplicate: { text: "Nomor WhatsApp sudah terdaftar atau diarsipkan. Cari pelanggan aktif atau minta manajer memulihkan profil arsip.", tone: "warning" },
  "customer-created": { text: "Pelanggan berhasil didaftarkan. Kartu stamp digital sudah aktif.", tone: "success" },
  "customer-not-found": { text: "Data pelanggan tidak ditemukan.", tone: "error" },
  "customer-forbidden": { text: "Anda hanya dapat mengubah pelanggan yang terdaftar di cabang Anda.", tone: "error" },
  "customer-updated": { text: "Profil pelanggan berhasil diperbarui.", tone: "success" },
  "customer-archived": { text: "Pelanggan diarsipkan. Riwayat dan transaksi tetap tersimpan.", tone: "success" },
  "customer-restored": { text: "Pelanggan dipulihkan dan dapat digunakan kembali.", tone: "success" },
  "customer-unchanged": { text: "Status pelanggan tidak berubah.", tone: "warning" },
  "invalid-transaction": { text: "Lengkapi pelanggan, cabang, dan nominal transaksi yang valid.", tone: "error" },
  "below-minimum": { text: "Transaksi tercatat. Belum mendapat stamp karena belum mencapai nominal minimal.", tone: "warning" },
  "already-stamped": { text: "Transaksi tercatat, tetapi stamp ditolak: pelanggan sudah mendapat stamp hari ini.", tone: "warning" },
  "stamp-added": { text: "Transaksi tercatat dan 1 stamp berhasil ditambahkan.", tone: "success" },
  "invalid-transaction-void": { text: "Isi alasan pembatalan (maksimal 500 karakter).", tone: "error" },
  "transaction-not-found": { text: "Transaksi tidak ditemukan.", tone: "error" },
  "transaction-already-voided": { text: "Transaksi ini sudah dibatalkan sebelumnya.", tone: "warning" },
  "transaction-outside-window": { text: "Transaksi hanya dapat dibatalkan oleh manajer atau owner pada hari kalender yang sama (WIB).", tone: "error" },
  "transaction-stamp-already-redeemed": { text: "Transaksi tidak dapat dibatalkan karena stamp yang diberikannya sudah ditukar.", tone: "error" },
  "transaction-redemption-history-incomplete": { text: "Penukaran tidak dibatalkan karena hubungan riwayat stamp tidak lengkap. Minta bantuan owner; tidak ada riwayat yang diubah.", tone: "error" },
  "transaction-voided": { text: "Transaksi dibatalkan dengan jejak tetap tersimpan; stamp hasil penukaran dipulihkan bila ada.", tone: "success" },
  "invalid-stock": { text: "Lengkapi nama barang, kategori, ukuran, dan cabang.", tone: "error" },
  "invalid-stock-id": { text: "Pilih barang yang valid.", tone: "error" },
  "stock-sold": { text: "Barang ditandai terjual dan pembaruan cabang tercatat.", tone: "success" },
  "stock-removed": { text: "Barang dikeluarkan dari katalog aktif; riwayat notifikasi tetap tersimpan.", tone: "success" },
  "stock-restored": { text: "Barang dipulihkan ke katalog aktif.", tone: "success" },
  "stock-unavailable": { text: "Barang tidak tersedia untuk tindakan tersebut.", tone: "warning" },
  "stock-not-removed": { text: "Hanya barang yang dikeluarkan dari katalog yang dapat dipulihkan.", tone: "warning" },
  "stock-updated": { text: "Detail barang berhasil diperbarui dan log cabang dicatat.", tone: "success" },
  "stock-already-sold": { text: "Barang ini sudah ditandai terjual.", tone: "warning" },
  "stock-added": { text: "Stok tersimpan dan wishlist yang cocok sudah diperiksa.", tone: "success" },
  "stock-confirmed": { text: "Stok cabang dikonfirmasi untuk hari ini.", tone: "success" },
  "stock-count-mismatch": { text: "Jumlah hitung fisik berbeda dengan catatan sistem. Konfirmasi tetap tersimpan; periksa kembali stok tersedia.", tone: "warning" },
  "invalid-stock-count": { text: "Jumlah hitung fisik wajib berupa bilangan bulat nol atau lebih.", tone: "error" },
  "consent-recorded": { text: "Persetujuan pesan dicatat dari kasir.", tone: "success" },
  "consent-required": { text: "Persetujuan hanya dapat dicatat setelah pelanggan mencentang pernyataan persetujuan.", tone: "error" },
  "consent-opted-out": { text: "Pelanggan telah memilih berhenti menerima pesan; jangan catat persetujuan dari kasir.", tone: "warning" },
  "rollout-feature-disabled": { text: "Fitur belum aktif di tahap roll-out cabang ini.", tone: "warning" },
  "qa-check-recorded": { text: "Hasil uji tukar stamp berhasil dicatat.", tone: "success" },
  "invalid-qa-check": { text: "Pilih cabang dan hasil uji yang valid.", tone: "error" },
  "invalid-rollout-stage": { text: "Tahap roll-out harus berupa angka 1 sampai 3.", tone: "error" },
  "rollout-stage-updated": { text: "Tahap roll-out cabang berhasil diperbarui.", tone: "success" },
  "followup-recorded": { text: "Tindak lanjut pelanggan dicatat; pelanggan disembunyikan dari antrean selama tujuh hari.", tone: "success" },
  "invalid-followup": { text: "Antrean atau catatan tindak lanjut tidak valid.", tone: "error" },
  "invalid-wishlist": { text: "Isi setidaknya satu kriteria wishlist.", tone: "error" },
  "invalid-wishlist-id": { text: "Item wishlist tidak valid.", tone: "error" },
  "wishlist-created": { text: "Wishlist berhasil ditambahkan.", tone: "success" },
  "wishlist-updated": { text: "Wishlist berhasil diperbarui.", tone: "success" },
  "wishlist-deleted": { text: "Wishlist berhasil dihapus.", tone: "success" },
  "invalid-template": { text: "Lengkapi nama, isi pesan, dan segmen reminder.", tone: "error" },
  "invalid-template-id": { text: "Pilih template reminder yang valid.", tone: "error" },
  "template-not-found": { text: "Template tidak ditemukan atau sudah dinonaktifkan.", tone: "error" },
  "template-created": { text: "Template reminder berhasil disimpan.", tone: "success" },
  "template-updated": { text: "Template reminder berhasil diperbarui.", tone: "success" },
  "template-activated": { text: "Template reminder diaktifkan.", tone: "success" },
  "template-deactivated": { text: "Template reminder dinonaktifkan; riwayatnya tetap tersimpan.", tone: "success" },
  "template-deleted": { text: "Template reminder berhasil dihapus.", tone: "success" },
  "template-has-history": { text: "Template memiliki riwayat. Nonaktifkan untuk mempertahankan audit.", tone: "warning" },
  "invalid-stock-notification-template": { text: "Isi template notifikasi wajib diisi dan maksimal 500 karakter.", tone: "error" },
  "stock-notification-template-updated": { text: "Template notifikasi wishlist berhasil diperbarui. Perubahan berlaku untuk notifikasi berikutnya.", tone: "success" },
  "invalid-staff": { text: "Periksa nama, email, peran, cabang, dan password staf.", tone: "error" },
  "duplicate-staff-email": { text: "Email tersebut sudah digunakan akun lain.", tone: "warning" },
  "staff-created": { text: "Akun staf berhasil dibuat.", tone: "success" },
  "staff-updated": { text: "Akun staf berhasil diperbarui.", tone: "success" },
  "staff-activated": { text: "Akun staf diaktifkan.", tone: "success" },
  "staff-deactivated": { text: "Akun staf dinonaktifkan dan semua sesi dicabut.", tone: "success" },
  "staff-unchanged": { text: "Status akun staf tidak berubah.", tone: "warning" },
  "staff-not-found": { text: "Akun staf tidak ditemukan.", tone: "error" },
  "staff-self-change-denied": { text: "Anda tidak dapat menurunkan atau menonaktifkan akun Pemilik yang sedang digunakan.", tone: "error" },
  "last-active-owner": { text: "Tidak dapat mengubah akun Pemilik terakhir yang masih aktif.", tone: "error" },
  "staff-password-updated": { text: "Password diperbarui. Silakan masuk kembali dengan password baru.", tone: "success" },
  "preference-updated": { text: "Preferensi pesan pelanggan berhasil diperbarui.", tone: "success" },
  "invalid-phone": { text: "Masukkan nomor WhatsApp yang valid.", tone: "error" },
  "login-failed": { text: "Email/password atau kode verifikasi tidak valid atau sudah kedaluwarsa.", tone: "error" },
  "login-code-sent": { text: "Jika nomor terdaftar, kode verifikasi lokal tersedia di terminal server dan berlaku 5 menit.", tone: "success" },
  "login-unavailable": { text: "Login portal pelanggan belum tersedia di production sampai provider OTP WhatsApp dikonfigurasi.", tone: "warning" },
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
    return <div className="notice success">Simulasi reminder selesai untuk {detail ?? "0"} pelanggan; tidak ada pesan WhatsApp yang dikirim.</div>;
  }
  const message = messages[status];
  if (!message) return null;
  const discountAmount = Number(discount);
  const transactionAmount = Number(amount);
  const text = discountAmount > 0 && Number.isFinite(transactionAmount)
    ? `Diskon stamp ${rupiah(discountAmount)} diterapkan, total bayar ${rupiah(transactionAmount - discountAmount)}. ${message.text}`
    : status === "stock-added" && detail
      ? `Stok tersimpan. ${detail} wishlist cocok ditemukan; simulasi notifikasi WhatsApp dibuat.`
      : status === "stock-count-mismatch" && detail
        ? `${message.text} Jumlah tersedia menurut sistem: ${detail}.`
        : message.text;
  return <div className={`notice ${message.tone ?? "success"}`}>{text}</div>;
}
