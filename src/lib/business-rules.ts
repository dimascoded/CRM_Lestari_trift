export const STAMP_MINIMUM_TRANSACTION = 100_000;
export const STAMPS_PER_REDEMPTION = 3;
export const REDEMPTION_DISCOUNT_PERCENT = 10;
export const STOCK_CATEGORIES = ["Atasan", "Bawahan", "Dress", "Outer", "Aksesori", "Sepatu", "Lainnya"] as const;
export const STOCK_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "All size"] as const;
export const DEAD_STOCK_DAYS = 60;
export const REMINDER_COOLDOWN_DAYS = 7;
export const REMINDER_LEAD_DAYS = 2;
export const REMINDER_GRACE_DAYS = 3;
export const REMINDER_SEND_HOUR_JAKARTA = 9;
export const REMINDER_CONVERSION_WINDOW_DAYS = 7;
export const REMINDER_HISTORY_SIZE = 5;
export const KPI_REPORTING_WINDOW_DAYS = 30;
export const STOCK_COMPLIANCE_WINDOW_DAYS = 7;
export const DASHBOARD_PERIOD_DAYS = [7, 30, 90] as const;
export const DASHBOARD_DEFAULT_PERIOD_DAYS = 30;
export const LOCAL_SCHEDULER_INTERVAL_MINUTES = 15;
export const FOLLOWUP_NOTE_MAX_LENGTH = 500;
export const REDEMPTION_QA_NOTE_MAX_LENGTH = 500;
export const SEGMENT_WINDOW_DAYS = 90;
export const RUTIN_MIN_TRANSACTIONS = 3;
export const SEASONAL_INACTIVE_DAYS = 60;
export const FOLLOWUP_HIDE_DAYS = 7;
export const PROFILE_PROMPT_AFTER_TRANSACTIONS = 2;
export const ACQUISITION_CHANNELS = {
  DATANG_LANGSUNG: "Datang langsung",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  WHATSAPP: "WhatsApp",
  TEMAN: "Rekomendasi teman",
} as const;
export const SEGMENTS = {
  RUTIN: "Pembeli rutin",
  KOLEKTOR: "Pemburu item",
  BARU_MUSIMAN: "Baru atau musiman",
} as const;
export const CRM_VISION =
  "Menjadikan Lestari Thrift Shop sebagai pilihan anak muda untuk mengenal setiap pelanggannya dan hadir tepat waktu melalui pengalaman belanja yang terhubung di semua cabang.";
export const ON_TIME_MINUTES = 60;
export const MESSAGE_CONSENT_POLICY_VERSION = "2026-11-v1";
export const STAFF_LOGIN_MAX_ATTEMPTS = 5;
export const STAFF_LOGIN_WINDOW_MINUTES = 15;
export const TRANSACTION_VOID_WINDOW = "SAME_JAKARTA_DAY";
export const TRANSACTION_VOID_REASON_MAX_LENGTH = 500;
export const MESSAGE_CONSENT_TEXT =
  "Saya setuju menerima pesan WhatsApp dari Lestari Thrift berupa reminder belanja dan pemberitahuan stok wishlist, maksimal 1 pesan dalam 7 hari. Saya dapat menarik persetujuan kapan saja.";
export const DEFAULT_STOCK_NOTIFICATION_MESSAGE =
  "Hai {nama}, barang wishlist kamu ada: {barang} ({ukuran}) di cabang {cabang}.";

export function normalizeWhatsApp(value: string) {
  const input = value.trim();
  const digits = input.replace(/\D/g, "");
  if (input.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("0")) return `+62${digits.slice(1)}`;
  if (digits.startsWith("62")) return `+${digits}`;
  return `+62${digits}`;
}

export function currentTime() {
  return new Date();
}

export function daysBefore(days: number, from = currentTime()) {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

export function jakartaDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
