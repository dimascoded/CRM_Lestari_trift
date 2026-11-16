export const STAMP_MINIMUM_TRANSACTION = 150_000;
export const STAMPS_PER_REDEMPTION = 3;
export const REDEMPTION_DISCOUNT_PERCENT = 10;
export const DEAD_STOCK_DAYS = 60;
export const REMINDER_COOLDOWN_DAYS = 7;
export const REMINDER_LEAD_DAYS = 2;
export const REMINDER_GRACE_DAYS = 3;
export const REMINDER_HISTORY_SIZE = 5;
export const ON_TIME_MINUTES = 60;
export const MESSAGE_CONSENT_POLICY_VERSION = "2026-11-v1";
export const MESSAGE_CONSENT_TEXT =
  "Saya setuju menerima pesan WhatsApp dari Lestari Thrift berupa reminder belanja dan pemberitahuan stok wishlist, maksimal 1 pesan dalam 7 hari. Saya dapat menarik persetujuan kapan saja.";

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
