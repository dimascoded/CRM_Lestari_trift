# Instruksi Perubahan: CRM_Lestari_trift

Patuhi `AGENTS.md` repo: logika bisnis di `src/lib/*-service.ts`, konstanta di `src/lib/business-rules.ts`, Server Action memeriksa peran dan cabang lalu memanggil service, operasi multi-tabel memakai `db.$transaction`, WhatsApp dan OTP tetap simulasi, data sintetis saja. Sebelum memakai fitur Next.js yang belum dipakai repo (route dinamis `[id]`, `instrumentation.ts`), baca panduannya di `node_modules/next/dist/docs/`. Kerjakan berurutan T1 sampai T12. Setelah selesai jalankan `npm run lint`, `npm run build`, `npm run test:regression`. Portal pelanggan dipertahankan. Akun staf tetap dibuat lewat `npm run user:create`. Pendaftaran mandiri pelanggan tidak dibuat.

## T1. Minimum stamp

- `STAMP_MINIMUM_TRANSACTION = 100_000` di `business-rules.ts`.
- Ganti semua angka dan teks Rp150.000 di `README.md`, `docs/`, `tests/regression.mjs`, dan seed (`grep -rn "150" README.md docs tests prisma src`).

## T2. Skema dan konstanta baru

Tambahkan di `prisma/schema.prisma`, buat migration `crm_strategy`, tambahkan relasi balik di `Branch` dan `Customer`:

```prisma
model Customer {
  acquisitionChannel String @default("DATANG_LANGSUNG")
  followUpNotes      FollowUpNote[]
}
model Transaction {
  stampOffered Boolean @default(true)
}
model StockUpdateLog {
  countedItems Int?
  systemCount  Int?
}
model ReminderTemplate {
  targetSegment String? // null = semua segmen
}
model RedemptionQaCheck {
  id        String   @id @default(cuid())
  branchId  String
  branch    Branch   @relation(fields: [branchId], references: [id])
  userId    String?
  passed    Boolean
  note      String   @default("")
  createdAt DateTime @default(now())
  @@index([branchId])
}
model FollowUpNote {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  userId     String?
  queue      String
  note       String   @default("")
  createdAt  DateTime @default(now())
  @@index([customerId, queue, createdAt])
}
```

Tambahkan di `business-rules.ts`:

```ts
export const ACQUISITION_CHANNELS = {
  DATANG_LANGSUNG: "Datang langsung", INSTAGRAM: "Instagram", TIKTOK: "TikTok",
  WHATSAPP: "WhatsApp", TEMAN: "Rekomendasi teman",
} as const;
export const SEGMENTS = { RUTIN: "Pembeli rutin", KOLEKTOR: "Pemburu item", BARU_MUSIMAN: "Baru atau musiman" } as const;
export const SEGMENT_WINDOW_DAYS = 90;
export const RUTIN_MIN_TRANSACTIONS = 3;
export const SEASONAL_INACTIVE_DAYS = 60;
export const FOLLOWUP_HIDE_DAYS = 7;
export const REMINDER_SEND_HOUR_JAKARTA = 9;
export const PROFILE_PROMPT_AFTER_TRANSACTIONS = 2;
export const CRM_VISION = "Menjadikan Lestari Thrift Shop sebagai pilihan anak muda untuk mengenal setiap pelanggannya dan hadir tepat waktu melalui pengalaman belanja yang terhubung di semua cabang.";
```

## T3. Segmen dan asal pelanggan

1. Buat `src/lib/segment-service.ts` dengan `getCustomerSegment({ transactionDates, activeWishlistCount, now })`. Aturan berurutan:
   1. `RUTIN` bila jumlah transaksi tidak batal dalam `SEGMENT_WINDOW_DAYS` hari terakhir >= `RUTIN_MIN_TRANSACTIONS`.
   2. `KOLEKTOR` bila ada minimal 1 wishlist aktif.
   3. selain itu `BARU_MUSIMAN`.
2. Tambahkan fungsi `countCustomersBySegment()` yang mengembalikan jumlah pelanggan aktif per segmen.
3. `registerCustomerRecord` dan `registerCustomer` menerima `acquisitionChannel` (validasi terhadap `ACQUISITION_CHANNELS`, default `DATANG_LANGSUNG`). Tambahkan `<select name="acquisitionChannel">` di form pendaftaran kasir.
4. Tampilkan lencana segmen di kartu pelanggan `/kasir` dan kolom "SEGMEN" di `/pelanggan`. Tambahkan filter `?segment=` di `/pelanggan`.
5. `customersForTemplate` di `src/lib/reminders.ts`: bila `template.targetSegment` terisi, saring pelanggan eligible dengan `getCustomerSegment`. Tambahkan select "Segmen sasaran" (Semua, tiga segmen) di form template reminder dan simpan di `createReminderTemplate` dan `updateReminderTemplate`.

## T4. Persetujuan pesan dan seed

1. Tambahkan action `recordCashierConsent` di `actions.ts`: peran CASHIER, MANAGER, OWNER; wajib centang teks `MESSAGE_CONSENT_TEXT`; memanggil `setCustomerMarketingConsent` yang sudah ada dengan sumber `"CASHIER"`; menulis audit log; redirect kembali ke `/kasir?customer=<id>&status=consent-recorded`. Tambahkan pesan `consent-recorded` di `Notice.tsx`.
2. Di kartu pelanggan `/kasir` dan `/pelanggan/[id]` (T7), bila `marketingConsent` false dan `optedOut` false, tampilkan "Belum setuju pesan" dan form `recordCashierConsent`.
3. Ubah `prisma/seed.mjs`:
   - Setiap pelanggan contoh kecuali yang `optedOut: true` mendapat `marketingConsent: true` dan satu baris `MessageConsent` (status, `source: "SEED_DEMO"`, `policyVersion`, `consentText` dengan nilai dan format yang sama seperti `setCustomerMarketingConsent`). Sisakan 2 pelanggan tanpa persetujuan.
   - Beri `acquisitionChannel` bervariasi.
   - Buat riwayat transaksi relatif terhadap waktu seed sehingga minimal 3 pelanggan berada di jendela reminder PERSONAL, 2 pelanggan punya tepat 2 stamp aktif, 2 pelanggan tidak bertransaksi lebih dari 60 hari, dan setidaknya 1 wishlist cocok dengan stok yang ada.
   - Jangan membuat akun staf dan jangan membuat `RedemptionQaCheck`.

## T5. KPI S2, S4, S6

**S2** (`src/lib/kpi.ts`):
1. Halaman Laporan (T8) tab `qa`: form per cabang "Catat hasil uji tukar stamp" (`passed`, `note`), peran OWNER dan MANAGER, action `recordRedemptionQaCheck` dengan audit log.
2. Nilai S2 = `passed / total * 100` bila setiap cabang punya minimal 1 uji; selain itu 0 dan tampilkan daftar cabang yang belum diuji di bawah baris KPI.

**S4**:
1. `confirmStockToday` wajib menerima `countedItems` (integer >= 0). Simpan `countedItems` dan `systemCount` (jumlah `StockItem` `AVAILABLE` cabang itu). Bila berbeda, redirect dengan `status=stock-count-mismatch` dan tampilkan peringatan; log tetap tersimpan.
2. Tambahkan field jumlah di form konfirmasi per cabang di `/stok`.
3. KPI S4 menghitung pasangan (cabang, hari) yang punya log `CHANGE` atau log `CONFIRM` dengan `countedItems` terisi.
4. Perbarui teks di `/laporan` tab stok, README, dan `docs/operasional-crm.md`.

**S6**:
1. `personalSchedule` di `reminders.ts`: `scheduledFor` = pukul `REMINDER_SEND_HOUR_JAKARTA`:00 Asia/Jakarta pada hari `expected - REMINDER_LEAD_DAYS`. Kembalikan null bila `now < scheduledFor` atau `now > expected + REMINDER_GRACE_DAYS`.
2. Scheduler lokal opsional: variabel `ENABLE_LOCAL_SCHEDULER=true` (tambahkan ke `.env.example`, default tidak aktif). Buat `src/instrumentation.ts` dengan `register()`: hanya bila `process.env.NEXT_RUNTIME === "nodejs"` dan variabel aktif, jalankan `processDueReminders()` tiap 15 menit memakai `setInterval`, dengan penanda global agar tidak berjalan ganda. Tidak mengirim pesan nyata.
3. Perbarui README bagian scheduler.

## T6. Kasir

1. Cabang: bila `staff.role !== "OWNER"`, form transaksi dan form pendaftaran menampilkan nama cabang staf sebagai teks dan mengirim `branchId` lewat input hidden. OWNER tetap memakai select. `requireBranchAccess` di server tetap dipertahankan.
2. Tambahkan checkbox `stampOffered` ("Stamp sudah ditawarkan ke pelanggan", tercentang) di form transaksi. `recordTransaction` dan `recordTransactionRecord` menyimpannya di `Transaction.stampOffered`.
3. Di kartu pelanggan tampilkan baris "Tawarkan stamp: X/3 stamp aktif" sebelum form transaksi.
4. Ajakan profil: bila pelanggan punya minimal `PROFILE_PROMPT_AFTER_TRANSACTIONS` transaksi tidak batal dan salah satu dari `favoriteCategory`, `favoriteSize`, `birthDate`, `instagram` kosong, tampilkan banner "Lengkapi profil pelanggan" dengan tautan ke `/pelanggan/[id]`.

## T7. Halaman pelanggan utuh

Buat `src/app/(admin)/pelanggan/[id]/page.tsx` (peran OWNER, MANAGER, CASHIER). Isi:
1. Profil, lencana segmen, asal pelanggan, status persetujuan dan riwayat `MessageConsent`.
2. Stamp aktif dan progres, riwayat penukaran.
3. Transaksi lintas cabang (20 terbaru, dengan penanda batal).
4. Wishlist dan riwayat `StockMatchNotification`.
5. Riwayat `ReminderLog`.
6. `FollowUpNote` terbaru.
7. Form ubah profil yang memakai `updateCustomerRecord`.
8. Tautan ke halaman ini dari tabel `/pelanggan`, hasil pencarian `/kasir`, dan antrean (T9).

## T8. Menu, pesan, dan laporan

1. Buat route `src/app/(admin)/pesan/page.tsx` dengan tab `?tab=antrean|reminder|notifikasi|log` (default `antrean`):
   - `reminder`: pindahkan `ReminderTab` dari `manajemen/page.tsx` (peran OWNER, MANAGER, MARKETING).
   - `notifikasi`: pindahkan isi `notifikasi/page.tsx` (template dan riwayat, semua peran staf, cakupan cabang seperti sekarang).
   - `log`: log reminder dari tab performa lama.
   - `antrean`: lihat T9.
2. Ganti nama route `manajemen` menjadi `laporan` dengan tab `performa`, `stok`, `duplikat`, `qa`. Tab `performa` menambahkan tingkat penawaran stamp per cabang (30 hari: `stampOffered` true dibagi total transaksi tidak batal).
3. Hapus `/notifikasi` dan tab "notifikasi" di `/stok` (sisakan tab log). Perbarui semua `redirect`, `revalidatePath`, dan tautan (`grep -rn "manajemen\|/notifikasi" src tests docs README.md`).
4. Navigasi di `AppShell.tsx` dan `STAFF_HOME` di `src/lib/auth.ts`:

| Seksi | Item |
|---|---|
| UTAMA | Beranda `/`, Strategi CRM `/strategi` |
| OPERASIONAL | Kasir `/kasir`, Pelanggan `/pelanggan`, Stok `/stok`, Pesan `/pesan` |
| LAPORAN | Laporan `/laporan` |
| PENGATURAN | Akun staf `/akun`, Jejak audit `/audit` |

| Peran | Menu | Halaman awal |
|---|---|---|
| kasir | `/kasir`, `/pelanggan`, `/pesan`, `/strategi` | `/kasir` |
| stok | `/stok`, `/pesan`, `/strategi` | `/stok` |
| manajer | semua kecuali `/akun`, `/audit` | `/` |
| marketing | `/pesan`, `/laporan`, `/strategi` | `/pesan` |
| pemilik | semua | `/` |

## T9. Antrean tindak lanjut

1. Buat `src/lib/followup-service.ts` dengan empat antrean untuk pelanggan aktif:
   - `JATUH_TEMPO`: pelanggan yang lolos `personalSchedule` sekarang dan belum punya `ReminderLog` pada jendela itu.
   - `SATU_STAMP`: stamp aktif sama dengan `STAMPS_PER_REDEMPTION - 1`.
   - `TIDAK_AKTIF`: pernah bertransaksi dan transaksi terakhir lebih dari `SEASONAL_INACTIVE_DAYS` hari lalu.
   - `WISHLIST_BELUM`: wishlist aktif yang cocok dengan stok `AVAILABLE` tetapi belum punya `StockMatchNotification`; sertakan alasan (tanpa persetujuan, opt-out, cooldown, atau belum diproses).
   Sembunyikan pelanggan yang punya `FollowUpNote` untuk antrean itu dalam `FOLLOWUP_HIDE_DAYS` hari. Non-OWNER hanya melihat pelanggan yang terdaftar di cabangnya.
2. Tab `antrean` menampilkan empat tabel: pelanggan, lencana segmen, alasan, transaksi terakhir, status persetujuan, tautan ke `/pelanggan/[id]`, dan tombol "Tandai sudah dihubungi" (action `markFollowedUp` dengan catatan opsional dan audit log).

## T10. Roll-out per cabang dan halaman Strategi CRM

1. Buat `src/lib/rollout.ts`:
   - `FEATURE_MIN_STAGE = { wishlist: 2, stockNotification: 2 }`.
   - `reminderEnabled()` bernilai true bila tahap tertinggi di antara cabang >= 3.
   - `featureEnabledForBranch(feature, branch)` dan variabel `ROLLOUT_GATING=off` (di `.env.example`) untuk melewati pembatasan saat demo.
2. Terapkan: wishlist (form di portal dan di `/kasir` bila ada) dan pencocokan wishlist untuk stok cabang bertahap < 2 dinonaktifkan; tab `reminder` dan `processDueReminders` nonaktif bila `reminderEnabled()` false. Tampilkan pesan "Fitur belum aktif di tahap roll-out cabang ini."
3. Buat `src/app/(admin)/strategi/page.tsx` (semua peran staf) dengan bagian:
   1. Visi CRM (`CRM_VISION`) dan tiga prioritas (loyalitas, pendapatan, biaya).
   2. Customer Strategy Cube: jumlah pelanggan per segmen (`countCustomersBySegment`), tiga penawaran (stamp lintas cabang, wishlist dan notifikasi stok, reminder), saluran dengan jumlah pelanggan per `acquisitionChannel`.
   3. Tahap roll-out per cabang. OWNER dapat mengubah tahap lewat action `setBranchRolloutStage` (validasi 1 sampai 3, audit log).
   4. Pemetaan BDN: tabel lima IT enabler (database terpusat, stamp digital, wishlist dan notifikasi stok, reminder, pemantauan) berisi fitur, tautan layar, kode KPI, dan status KPI dari `getKpis()`.
   5. Quick win terhitung: jumlah stamp digital tercatat, jumlah pelanggan lintas cabang, jumlah cabang yang sudah memperbarui stok hari ini.

## T11. Dokumen dan tes

1. Perbarui `README.md` dan `docs/operasional-crm.md`: rute baru, definisi S2, S4, S6, scheduler lokal, `ROLLOUT_GATING`, minimum stamp.
2. Tambahkan tes di `tests/regression.mjs` untuk:
   - transaksi tepat Rp100.000 mendapat stamp dan Rp99.999 tidak;
   - aturan segmen (RUTIN, KOLEKTOR, BARU_MUSIMAN) dan urutan prioritasnya;
   - `acquisitionChannel` tersimpan dan nilai tidak valid ditolak;
   - `recordCashierConsent` mengubah persetujuan dan menulis audit;
   - `targetSegment` pada template menyaring penerima;
   - `personalSchedule` menghasilkan pukul 09.00 Asia/Jakarta dan null sebelum jam itu;
   - KPI S2 bernilai 0 bila ada cabang belum diuji, dan benar bila semua diuji;
   - konfirmasi stok dengan `countedItems` dihitung S4, tanpa `countedItems` ditolak, dan selisih jumlah memberi peringatan;
   - empat antrean tindak lanjut dan penyembunyian setelah `markFollowedUp`;
   - pembatasan roll-out untuk wishlist dan reminder, termasuk `ROLLOUT_GATING=off`;
   - non-OWNER tidak bisa mengubah tahap roll-out;
   - `getDashboardSummary` mengecualikan transaksi batal dari pendapatan, transaksi, dan stamp;
   - pendapatan bersih memakai `amount - discountAmount`;
   - filter periode 7, 30, 90 hari memberi hasil berbeda sesuai tanggal data;
   - MANAGER selalu dibatasi ke cabangnya walau `branch` pada URL berisi cabang lain;
   - tabel wishlist versus stok menghitung wishlist aktif dan stok `AVAILABLE` per kategori dengan benar.

## T12. Dashboard ringkasan CRM (Beranda)

Ubah `src/app/(admin)/page.tsx` menjadi dashboard ringkasan. Peran: OWNER dan MANAGER. Filter lewat query string `?period=7|30|90` (default 30) dan `?branch=<id>`. OWNER boleh memilih semua cabang atau satu cabang. MANAGER selalu dipaksa ke `staff.branchId` di server, abaikan `branch` dari URL. Form filter memakai GET dan pilihan terpilih tampil aktif.

1. Buat `src/lib/dashboard-service.ts` dengan `getDashboardSummary({ periodDays, branchId })`. Pakai `groupBy` dan `aggregate`, tanpa query per baris. Gunakan ulang fungsi dari `kpi.ts`, `segment-service.ts`, dan `followup-service.ts` dengan mengekspor helper-nya; hasil `getKpis()` tidak boleh berubah. Semua transaksi yang punya `voidRecord` dikecualikan.
2. Definisi angka (cakupan cabang memakai `branchId` transaksi, stamp, dan stok; pelanggan memakai `registeredAtId`):

| Angka | Rumus |
|---|---|
| Pelanggan aktif | Pelanggan `active: true` |
| Pelanggan baru | `createdAt` dalam periode |
| Pendapatan bersih | Jumlah `amount - discountAmount` transaksi dalam periode |
| Transaksi | Jumlah transaksi dalam periode |
| Rata-rata nilai transaksi | Pendapatan bersih dibagi transaksi |
| Stamp diberikan | Stamp `voidedAt: null` dengan `createdAt` dalam periode |
| Diskon stamp | Jumlah `Redemption` `voidedAt: null` dalam periode dan total `discountAmount` |
| Pelanggan repeat | Pelanggan dengan minimal 2 transaksi dalam periode |
| Persentase setuju pesan | Pelanggan aktif dengan `marketingConsent: true` dan `optedOut: false` dibagi pelanggan aktif |

3. Bagian halaman, berurutan:
   1. **Ringkasan:** kartu untuk semua angka di tabel di atas.
   2. **Penjualan:** grafik pendapatan bersih per hari bila periode 7 atau 30, per minggu bila 90 (kunci hari `jakartaDayKey`); tabel perbandingan cabang (pendapatan bersih, transaksi, stamp). Manajer melihat satu baris.
   3. **Pelanggan:** komposisi segmen (tiga segmen), jumlah per `acquisitionChannel`, persentase setuju pesan.
   4. **Wishlist:** jumlah wishlist aktif; dua tabel perbandingan "5 kategori paling dicari" dan "5 ukuran paling dicari" berisi kolom wishlist aktif dan stok `AVAILABLE` dengan kategori atau ukuran yang sama (batang pembanding); jumlah notifikasi wishlist dalam periode; jumlah antrean `WISHLIST_BELUM`.
   5. **Stok:** barang tersedia, stok mati (`DEAD_STOCK_DAYS`), kepatuhan update 7 hari per cabang (logika S4 dari T5).
   6. **Pesan:** jumlah reminder simulasi dalam periode, konversi 7 hari (logika S7b), jumlah total baris keempat antrean tindak lanjut dengan tautan ke `/pesan?tab=antrean`.
   7. **KPI BDN:** tabel yang sudah ada, dipindah ke bagian bawah.
   8. **Tahap roll-out** dan **transaksi terbaru** (6 baris, tidak termasuk yang batal) tetap ada di bawah KPI.
4. Grafik dibuat dengan SVG atau CSS tanpa dependensi baru. Setiap bagian punya keadaan kosong ("Belum ada data pada periode ini").
5. Tautkan setiap bagian ke halaman detailnya: Penjualan ke `/laporan?tab=performa`, Pelanggan ke `/pelanggan`, Wishlist dan Pesan ke `/pesan`, Stok ke `/stok`.
6. Tambahkan gaya baru di `globals.css` (kartu ringkas, batang, filter) dengan ukuran teks minimal 12px.

## Selesai bila

- `lint`, `build`, dan `test:regression` lulus.
- Setelah `npm run db:setup` dan `npm run user:create`, antrean tindak lanjut, reminder personal, dan notifikasi wishlist menghasilkan data pada demo tanpa langkah manual tambahan selain menjalankan scheduler.
- Tidak ada tautan ke `/manajemen` dan `/notifikasi`.
- Halaman `/strategi` menampilkan segmen, saluran, tahap roll-out, dan pemetaan BDN dari data database.
- Beranda `/` menampilkan ringkasan pelanggan, penjualan, wishlist, stok, pesan, dan KPI dalam satu halaman, dengan filter periode dan cabang yang dibatasi sesuai peran.
