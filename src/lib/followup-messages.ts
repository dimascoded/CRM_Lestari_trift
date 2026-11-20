import { REDEMPTION_DISCOUNT_PERCENT } from "./business-rules";
import type { FollowUpQueue } from "./followup-service";

export function followUpMessage(queue: FollowUpQueue, customerName: string) {
  const firstName = customerName.trim().split(/\s+/)[0] ?? customerName;
  switch (queue) {
    case "JATUH_TEMPO":
      return `Halo ${firstName}, sudah waktunya cek koleksi baru Lestari Thrift. Ada stok baru yang mungkin cocok untukmu.`;
    case "SATU_STAMP":
      return `Halo ${firstName}, tinggal 1 stamp lagi untuk dapat diskon ${REDEMPTION_DISCOUNT_PERCENT}% di semua cabang Lestari Thrift.`;
    case "TIDAK_AKTIF":
      return `Halo ${firstName}, kami kangen! Ada koleksi baru di Lestari Thrift yang mungkin kamu suka.`;
    case "WISHLIST_BELUM":
      return `Halo ${firstName}, ada barang yang cocok dengan wishlist kamu di Lestari Thrift.`;
  }
}
