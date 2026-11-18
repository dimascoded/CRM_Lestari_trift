# Instruksi Perubahan: Lestari Thrift CRM

Stack: Next.js App Router, TypeScript, Prisma, SQLite. Pola yang dipertahankan: server actions di `src/app/actions.ts`, halaman server component, notifikasi via `?status=` dan `Notice`. Bahasa UI: Indonesia. Zona waktu: `Asia/Jakarta`. Kerjakan berurutan T1 sampai T10. Jalankan `npx prisma migrate dev` dan perbarui seed setelah T2.

## Konstanta (`src/lib/business-rules.ts`)

Pertahankan: `STAMP_MINIMUM_TRANSACTION = 100_000`, `STAMPS_PER_REDEMPTION = 3`, `REDEMPTION_DISCOUNT_PERCENT = 10`, `DEAD_STOCK_DAYS = 60`, `REMINDER_COOLDOWN_DAYS = 7`.
Tambahkan: `REMINDER_LEAD_DAYS = 2`, `REMINDER_GRACE_DAYS = 3`, `REMINDER_HISTORY_SIZE = 5`, `ON_TIME_MINUTES = 60`.

## T1. Skema Prisma

Ubah (sesuaikan nama model yang ada):

```prisma
model Transaction {
  discountAmount Int     @default(0)
  redemptionId   String? @unique
}
model Redemption {
  transaction Transaction?
}
model StockMatchNotification {
  @@unique([stockItemId, customerId])
}
model StockUpdateLog {
  type String @default("CHANGE") // CHANGE | CONFIRM
}
model ReminderLog {
  body         String    @default("")
  scheduledFor DateTime?
  status       String    @default("SENT") // SCHEDULED | SENT | FAILED
}
model Branch {
  rolloutStage Int @default(1) // 1 pilot, 2, 3
}
model KpiTarget {
  id       String  @id @default(cuid())
  code     String  @unique
  label    String
  unit     String
  baseline Float?
  target   Float
}
```

Seed `KpiTarget` (baseline adalah estimasi):

| code | label | unit | baseline | target |
|---|---|---|---|---|
| S1 | Akun pelanggan ganda | % | 8 | 2 |
| S2 | Cabang dengan penukaran stamp berhasil | % | 0 | 100 |
| S3 | Pelanggan beli lebih dari sekali per bulan | orang | 40 | 50 |
| S4 | Kepatuhan update stok harian | % | 50 | 90 |
| S5 | Stok mati | barang | 25 | 20 |
| S6 | Reminder tepat jadwal | % | (kosong) | 95 |
| S7a | Rata-rata transaksi per pelanggan aktif per bulan | kali | 1.6 | 1.84 |
| S7b | Pelanggan beli dalam 7 hari setelah reminder | % | (kosong) | 20 |

Seed `Branch.rolloutStage`: Yogyakarta 1, Semarang 2, Magelang 2, Bali 3.

## T2. Diskon stamp otomatis

File: `src/app/actions.ts` (`recordTransaction`), `src/app/kasir/page.tsx`, `src/components/Notice.tsx`.

1. Tambahkan checkbox `useStampDiscount` (default tercentang) di form transaksi.
2. Jalankan seluruh proses dalam satu `db.$transaction`:
   1. Ambil `STAMPS_PER_REDEMPTION` stamp pelanggan dengan `redeemedAt: null`, urut `createdAt asc`, sebelum membuat stamp transaksi ini.
   2. Jika `useStampDiscount` dan jumlahnya sama dengan 3: `discountAmount = Math.floor(amount * REDEMPTION_DISCOUNT_PERCENT / 100)`; buat `Redemption` (customerId, branchId, discountPercent); set `redeemedAt = new Date()` pada 3 stamp itu.
   3. Buat `Transaction` dengan `amount` (nominal sebelum diskon), `discountAmount`, `redemptionId`.
   4. Buat stamp baru bila `amount >= STAMP_MINIMUM_TRANSACTION` dan belum ada stamp untuk `customerId_dayKey` hari ini. Tangani `P2002` seperti kode sekarang.
3. Redirect: `/kasir?status=<stamp-added|already-stamped|below-minimum>&discount=<discountAmount>`.
4. `Notice`: bila `discount > 0`, tambahkan teks "Diskon stamp {rupiah} diterapkan, total bayar {rupiah(amount - discount)}."
5. Hapus form "Tukar stamp" dari kasir. Hapus action `redeemStamps` beserta status `redeemed`, `not-enough-stamps`, `invalid-redemption` dari `Notice`.
6. Di kartu pelanggan terpilih (lihat T7): jika stamp belum ditukar >= 3, tampilkan banner "Pelanggan punya 3 stamp. Diskon 10% diterapkan otomatis pada transaksi ini."
7. Di portal: bila stamp aktif >= 3, tampilkan "Diskon 10% siap dipakai di pembelian berikutnya".

## T3. Wishlist hanya dari pelanggan

1. Hapus form "Tambahkan wishlist pelanggan" dari `src/app/kasir/page.tsx` dan impor `createWishlist` di file itu.
2. Buat `src/lib/wishlist-match.ts`:
   - `matchStockItem(tx, item)`: cari wishlist `active: true`, `customer.optedOut: false`, dengan `category` kosong atau sama, `size` kosong atau sama, `keyword` kosong atau terkandung di `item.name` (tanpa beda huruf besar kecil). Buat `StockMatchNotification` dengan `createMany({ skipDuplicates: true })`. Kembalikan jumlah pelanggan unik.
   - `matchWishlist(tx, wishlist)`: cari `StockItem` `status: "AVAILABLE"` yang cocok dengan kriteria wishlist; buat notifikasi dengan `skipDuplicates`.
3. Panggil `matchStockItem` di `addStockItem` (ganti blok pencocokan yang ada) dan di `updateStockItem` setelah update.
4. Panggil `matchWishlist` di `createWishlist` dan saat `toggleWishlist` mengaktifkan kembali.
5. Notifikasi wishlist tidak dihitung dalam batas 1 pesan per minggu.

## T4. Reminder otomatis sesuai kebiasaan beli

File baru: `src/lib/reminders.ts` dengan `processDueReminders(templateId?: string)`. Ubah `src/app/actions.ts`.

1. `renderMessage(template.message, customer)`: ganti `{nama}` dengan nama depan pelanggan. Simpan hasilnya di `ReminderLog.body`.
2. Segmen `ALL` dan `NEW`:
   - Jika `template.schedule` kosong atau `<= now`, kirim ke pelanggan yang memenuhi syarat segmen, bukan `optedOut`, dan belum menerima reminder dalam `REMINDER_COOLDOWN_DAYS` hari.
   - Buat log `status: "SENT"`, `scheduledFor = template.schedule ?? now`, `sentAt = now`.
3. Segmen `PERSONAL`:
   1. Untuk pelanggan dengan minimal 3 transaksi, ambil `REMINDER_HISTORY_SIZE` transaksi terakhir.
   2. `avgGapDays` = rata-rata selisih hari antar transaksi berurutan.
   3. `expected = transaksiTerakhir + avgGapDays`.
   4. Kirim bila `now` berada pada `[expected - REMINDER_LEAD_DAYS, expected + REMINDER_GRACE_DAYS]`, tidak ada transaksi setelah transaksi terakhir, bukan `optedOut`, dan lolos cooldown.
   5. `scheduledFor = expected - REMINDER_LEAD_DAYS`.
4. Route handler `src/app/api/cron/reminders/route.ts` (GET) memanggil `processDueReminders()` dan mengembalikan `{ sent: number }`.
5. Jika `node-cron` tersedia, jalankan tiap jam lewat `src/instrumentation.ts` dengan `register()` hanya di runtime `nodejs`.
6. Ubah `sendReminderCampaign` menjadi pemanggil `processDueReminders(templateId)`. Ganti label tombol menjadi "Jalankan penjadwal" dan tambahkan satu tombol global "Jalankan penjadwal sekarang" di tab Reminder.
7. Hapus status `template-not-ready` bila tidak terpakai.

## T5. Konfirmasi stok harian

1. Tambahkan action `confirmStockToday(formData)` dengan field `branchId`: buat `StockUpdateLog { branchId, type: "CONFIRM" }`, `revalidatePath("/")`, `revalidatePath("/stok")`, redirect `/stok?status=stock-confirmed`.
2. Tambahkan pesan `stock-confirmed`: "Stok cabang dikonfirmasi untuk hari ini."
3. Di `/stok`, tampilkan satu kartu per cabang: nama, jumlah barang tersedia, waktu update terakhir, tombol "Konfirmasi stok hari ini".
4. Sebuah cabang dianggap update pada hari tertentu bila punya `StockUpdateLog` (tipe apa pun) pada `dayKey` itu.

## T6. Panel KPI BDN

File baru: `src/lib/kpi.ts` dengan `getKpis()`; tampilkan di `src/app/page.tsx`, ganti panel "Stamp digital" yang statis.

Rumus:

| code | Rumus |
|---|---|
| S1 | Persentase akun dengan `whatsapp` ganda terhadap total akun (kelompokkan per `whatsapp`, hitung grup > 1). Tampilkan juga jumlah `DuplicateCheckLog` sebagai "percobaan ganda tercegah". |
| S2 | Cabang berbeda yang punya `Redemption` dibagi jumlah cabang, dalam %. |
| S3 | Jumlah pelanggan dengan minimal 2 transaksi dalam 30 hari terakhir. |
| S4 | Jumlah pasangan (cabang, hari) yang punya update dalam 7 hari terakhir, dibagi (jumlah cabang x 7), dalam %. |
| S5 | Jumlah `StockItem` `AVAILABLE` dengan `enteredAt` lebih dari `DEAD_STOCK_DAYS` hari. |
| S6 | Persentase `ReminderLog` dengan `sentAt - scheduledFor <= ON_TIME_MINUTES` menit, dalam 30 hari terakhir. |
| S7a | Total transaksi 30 hari terakhir dibagi jumlah pelanggan yang bertransaksi dalam periode itu. |
| S7b | Pelanggan unik yang punya transaksi dalam 7 hari setelah reminder, dibagi pelanggan unik yang dikirimi reminder, dalam %. Hitung dari log 30 hari terakhir. |

Status per baris: "Tercapai" bila capaian memenuhi target; "Berjalan" bila sudah menempuh minimal 50% jarak baseline ke target; selain itu "Belum". Untuk target yang lebih kecil lebih baik (S1, S5), arah dibalik. Baris tanpa baseline: "Tercapai" atau "Belum" saja.

Tabel menampilkan kolom: Kode, Indikator, Baseline, Target, Capaian, Status. Tambahkan panel "Tahap roll-out": tiap cabang dengan `rolloutStage` (1 Pilot, 2 Tahap 2, 3 Tahap 3).

## T7. Kasir (`src/app/kasir/page.tsx`)

1. Hapus `customersForSelect` dan semua `<select>` pelanggan. Ganti dengan form GET `q` dan hasil berupa daftar maksimal 10 pelanggan; pilih lewat `?customer=<id>`.
2. Kartu pelanggan terpilih: nama, WhatsApp, cabang daftar, progres stamp aktif (mis. 2/3), banner T2 butir 6, tiga transaksi terakhir.
3. Panel transaksi (cabang, nominal, checkbox diskon stamp, tombol simpan) hanya muncul bila pelanggan terpilih.
4. Tombol "＋ Pelanggan baru" di `PageHeader`. Tautan `?new=1` menampilkan form pendaftaran menggantikan panel transaksi.
5. Pindahkan tabel "Database pelanggan" ke `src/app/pelanggan/page.tsx`; tambahkan menu "Database pelanggan" di navigasi.
6. Hapus layout `two-column` dari halaman kasir.

## T8. Stok dan Manajemen

`src/app/stok/page.tsx`:
1. Urutan: kartu cabang (T5), tabel stok (filter q, kategori, cabang), panel kanan.
2. Form "Tambah barang" tampil bila `?add=1`; tombol "＋ Tambah barang" di `PageHeader`.
3. Ganti `<details>` "Ubah" dengan tautan `?edit=<stockId>` yang menampilkan form edit di atas tabel. Hapus kelas `.stock-edit-form` dari CSS.
4. Panel kanan: dua tab lewat `?tab=notifikasi|log` (default `notifikasi`).

`src/app/manajemen/page.tsx`: tab lewat `?tab=`, tiap tab hanya merender datanya sendiri.

| tab | isi |
|---|---|
| `reminder` (default) | form template, daftar template, tombol "Jalankan penjadwal sekarang" |
| `performa` | metrik pengiriman, konversi S7b, repeat, S7a, log pengiriman |
| `stok` | tabel kepatuhan cabang (persentase 7 hari), laporan stok mati |
| `duplikat` | persentase S1 dan daftar percobaan ganda |

Ganti N+1 query stamp per cabang dengan satu `groupBy` per `branchId` untuk `dayKey` hari ini. Ganti pemuatan seluruh pelanggan repeat dengan agregasi `groupBy`.

## T9. Peran dan portal

1. Cookie `role` dengan nilai `kasir | stok | manajer | marketing | pemilik`. Tambahkan pemilih peran di topbar `AppShell` (server action menulis cookie).
2. Menu per peran:
   - kasir: Kasir, Database pelanggan
   - stok: Stok
   - marketing: Manajemen
   - manajer: Kasir, Stok, Manajemen, Database pelanggan
   - pemilik: Beranda, semua menu
3. Hapus teks tetap: "Nadia", "Nadia Anggraini", "4 cabang terhubung", "Semua cabang aktif". Ambil dari peran aktif dan `db.branch.count()`.
4. Portal pindah ke route group `src/app/(pelanggan)/portal/` dengan `layout.tsx` sendiri tanpa sidebar admin dan navigasi bawah di layar kecil. Pindahkan `AppShell` ke route group admin `(admin)`.
5. Login pelanggan: form nomor WhatsApp (normalisasi dengan `normalizeWhatsApp`), lalu kode `123456`, lalu cookie `customerId`. Hapus dropdown akun demo. Tampilkan label "Simulasi login".
6. Tab portal lewat `?tab=`: `beranda` (banner, kartu stamp, status diskon, notifikasi stok, ringkasan 3 riwayat terakhir), `katalog`, `wishlist`, `profil`.
7. `/portal/katalog`: daftar `StockItem` `AVAILABLE` semua cabang, hanya baca, filter kategori, ukuran, cabang.

## T10. CSS (`src/app/globals.css`)

1. Ubah semua `font-size` di bawah 12px menjadi minimal 12px; teks isi minimal 13px.
2. Hapus `.stock-edit-form` dan aturan terkait.
3. Tambahkan gaya tab (`.tabs`, `.tab`, `.tab.active`) dan bar bawah portal.

## Pengujian (jalankan sebelum selesai)

Tambahkan uji otomatis atau skrip untuk skenario berikut:

1. Pendaftaran nomor WhatsApp yang sama ditolak dan menambah `DuplicateCheckLog`.
2. Transaksi di bawah Rp100.000 tidak membuat stamp.
3. Transaksi kedua di hari yang sama tidak membuat stamp kedua.
4. Pelanggan dengan 3 stamp aktif: transaksi berikutnya otomatis diberi diskon 10% dari nominal sebelum diskon, 3 stamp tertua `redeemedAt` terisi, `Redemption` terbuat, di keempat cabang.
5. Dengan `useStampDiscount` tidak dicentang: tidak ada diskon, stamp tetap utuh.
6. Pelanggan dengan 4 stamp: hanya 3 yang ditukar.
7. Wishlist dibuat setelah barang cocok sudah ada: notifikasi terbuat tepat satu.
8. Barang diubah kategori atau ukurannya: pencocokan ulang tidak membuat notifikasi ganda.
9. Reminder tidak dikirim ke pelanggan opt-out atau yang menerima reminder dalam 7 hari terakhir.
10. Reminder `PERSONAL` terkirim di dalam jendela `[expected - 2 hari, expected + 3 hari]` dan tidak di luarnya.
11. `confirmStockToday` membuat log `CONFIRM` dan cabang dihitung update untuk hari itu.
12. `getKpis()` mengembalikan delapan baris (S1, S2, S3, S4, S5, S6, S7a, S7b) dengan status.

## Selesai bila

- Semua skenario pengujian lulus dan `npm run build` tanpa error.
- Tidak ada form pelanggan-dropdown di kasir dan tidak ada form tukar stamp manual.
- Tidak ada elemen yang saling menumpuk pada lebar 1440px, 1024px, dan 390px.
- Beranda menampilkan tabel KPI dan tahap roll-out dari data database.
