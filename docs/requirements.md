# Panduan Prompting: CRM Lestari Thrift

Dokumen ini berisi arahan dan prompt siap pakai untuk membangun CRM Lestari Thrift dengan AI coding agent (misalnya Claude Code). Isinya mengikuti proyek di `docs.zip`.

---

## 1. Jawaban singkat: apakah arahnya benar?

**Ya. Arahnya benar.** Proyek ini sudah memuat inti CRM ritel yang berpusat pada pelanggan:

| Kebutuhan CRM | Sudah ada di proyek |
| --- | --- |
| Data pelanggan satu pintu | Pendaftaran, pencarian, deteksi duplikat via nomor WhatsApp |
| Loyalitas | Stamp lintas cabang, diskon 10% untuk 3 stamp |
| Wishlist | Pelanggan menyimpan kategori/ukuran/kata kunci; sistem mencocokkan stok baru |
| Komunikasi | Reminder personal, notifikasi wishlist, batas 1 pesan per 7 hari |
| Kepatuhan | Consent tercatat (sumber, versi teks, waktu), opt-out |
| Operasional | Stok per cabang, konfirmasi harian, 5 peran akses |
| Pengukuran | 8 KPI dengan baseline dan target |

**Catatan:** ini masih **purwarupa**. Empat hal harus Anda perbaiki sebelum memakai data pelanggan nyata:

1. **WhatsApp dan OTP hanya simulasi.** Login pelanggan ditolak di production. *(Fakta dari kode dan README.)*
2. **Login staf tidak membatasi percobaan.** Fungsi `loginStaff` tidak punya batas gagal. OTP pelanggan punya batas 5 percobaan. *(Fakta dari kode.)*
3. **Tidak ada alur koreksi transaksi.** Transaksi dan stamp sengaja tidak bisa diubah atau dihapus. Kasir yang salah input belum punya jalur resmi. *(Pengamatan desain; keputusan ada pada Anda.)*
4. **Database SQLite lokal.** Untuk empat cabang yang memakai data bersama, PostgreSQL lebih cocok. *(Rekomendasi saya.)*

Prompt untuk keempat hal ini ada di **Bagian 7**.

> Catatan metode: zip Anda berisi kode proyek, bukan dokumen biasa. Saya membaca README, skema database, logika bisnis, aksi server, dan `docs/operasional-crm.md`. Saya **belum menjalankan** aplikasi atau tesnya.

---

## 2. Cara memakai file ini

1. Simpan **Prompt 0** (Bagian 3) di file `AGENTS.md` atau `CLAUDE.md` pada akar proyek. Agent akan membacanya di setiap sesi.
2. Kerjakan prompt **berurutan** (Bagian 5). Satu prompt = satu sesi = satu commit.
3. Setelah setiap prompt, jalankan: `npm run lint`, `npm run build`, `npm run test:regression`.
4. Jangan lanjut jika satu langkah gagal.

**Dua mode:**

- **Mode A: bangun dari nol.** Jalankan Prompt 1 sampai 13 berurutan.
- **Mode B: kode sudah ada** (seperti di zip). Mulai dengan **Prompt Audit** (Bagian 4). Lalu kerjakan hanya selisih dan celah di Bagian 7.

---

## 3. Prompt 0: Konteks utama (simpan di AGENTS.md)

```text
Kamu membangun "Lestari Thrift CRM": CRM ritel thrift fashion untuk 4 cabang
(Yogyakarta, Semarang, Magelang, Bali). Fokus: pelanggan, loyalitas stamp,
wishlist, stok bersama, reminder berizin, dan KPI.

STACK
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- Prisma + SQLite (lokal). Rencana: PostgreSQL.
- Server Actions untuk semua perubahan data. Tanpa REST API, kecuali /api/cron.
- Bahasa UI: Indonesia. Zona waktu bisnis: Asia/Jakarta.

ATURAN KERJA
1. Next.js versi ini punya perubahan besar. Baca dokumen di
   node_modules/next/dist/docs/ sebelum menulis kode Next.js.
2. Semua aturan bisnis ada di satu file: src/lib/business-rules.ts.
   Jangan menulis angka bisnis di tempat lain.
3. Logika bisnis ada di src/lib/*-service.ts. Server Action hanya memeriksa
   akses, membaca form, memanggil service, lalu revalidate dan redirect.
4. Setiap Server Action memanggil requireStaff([...peran]) atau
   requireCustomerSession() di baris pertama. Aksi cabang memanggil
   requireBranchAccess(user, branchId).
5. Operasi yang mengubah lebih dari satu tabel memakai db.$transaction.
6. Simpan password dengan scrypt. Simpan token sesi dan kode OTP sebagai hash.
   Jangan simpan teks asli.
7. Pesan WhatsApp dan OTP SIMULASI. Jangan kirim pesan nyata. Beri label
   "simulasi" di UI. Status simulasi bukan bukti pengiriman.
8. Data hanya sintetis. Jangan masukkan data pelanggan nyata.
9. Pesan hanya untuk pelanggan dengan consent aktif, belum opt-out, dan
   aktif. Batas gabungan: 1 pesan per pelanggan per 7 hari (reminder +
   notifikasi wishlist).
10. Transaksi dan riwayat stamp tidak boleh diubah atau dihapus.
11. Setiap fitur baru wajib punya tes di tests/regression.mjs.
12. Sebelum selesai, jalankan: npm run lint && npm run build &&
    npm run test:regression. Laporkan hasilnya apa adanya.

PERAN: OWNER, MANAGER, CASHIER, STOCK_STAFF, MARKETING.
OWNER tidak terikat cabang. Peran lain terikat satu cabang.

Jika ada hal yang ambigu dan keputusannya tidak bisa dibatalkan, tanyakan
dulu. Jika tidak, ambil asumsi paling masuk akal dan tulis asumsinya.
```

---

## 4. Prompt Audit (khusus Mode B: kode sudah ada)

```text
Baca AGENTS.md, README.md, docs/operasional-crm.md, prisma/schema.prisma,
dan semua file di src/lib. Jangan ubah kode dulu.

Buat laporan singkat:
1. Fitur dari daftar ini yang SUDAH berjalan, dengan bukti (nama file/fungsi).
2. Fitur yang BELUM ada atau setengah jadi.
3. Aturan bisnis yang kodenya berbeda dari README.
4. Risiko keamanan dan privasi yang kamu temukan, urut dari paling berat.

Pisahkan: fakta dari kode, asumsi, dan pendapat. Jangan menandai sesuatu
"selesai" jika kamu belum membaca kodenya. Jalankan npm run lint, build, dan
test:regression, lalu laporkan hasilnya.
```

---

## 5. Urutan kerja

| # | Prompt | Bergantung pada |
| --- | --- | --- |
| 1 | Fondasi dan skema data | - |
| 2 | Autentikasi, peran, cabang | 1 |
| 3 | Pelanggan dan consent | 2 |
| 4 | Kasir: transaksi, stamp, penukaran | 3 |
| 5 | Stok dan konfirmasi harian | 2 |
| 6 | Portal pelanggan dan katalog | 3, 5 |
| 7 | Wishlist dan notifikasi stok | 5, 6 |
| 8 | Reminder dan scheduler | 3, 4 |
| 9 | Siklus data: edit, arsip, pulihkan | 3, 5, 7, 8 |
| 10 | Dashboard dan KPI | 4, 5, 8 |
| 11 | Manajemen akun staf | 2 |
| 12 | Tes regresi | semua |
| 13 | Dokumen operasional | semua |

---

## 6. Prompt per fitur

### Aturan bisnis (satu sumber kebenaran)

Prompt di bawah merujuk ke nilai ini. Semuanya ada di `src/lib/business-rules.ts`.

| Aturan | Nilai |
| --- | --- |
| Minimum transaksi untuk stamp | Rp100.000 |
| Stamp per pelanggan per hari | 1 (hari = zona Asia/Jakarta) |
| Stamp untuk 1 penukaran | 3 (yang tertua dulu) |
| Diskon penukaran | 10%, dibulatkan ke bawah |
| Batas pesan | 1 per 7 hari, gabungan |
| Reminder personal | Butuh minimal 3 transaksi. Kirim 2 hari sebelum perkiraan beli. Toleransi 3 hari setelahnya. Pakai 5 transaksi terakhir. |
| Reminder tepat jadwal | Selisih maksimal 60 menit |
| Stok mati | Status tersedia lebih dari 60 hari |
| Kategori stok | Atasan, Bawahan, Dress, Outer, Aksesori, Sepatu, Lainnya |
| Ukuran | XS, S, M, L, XL, XXL, All size |
| Versi teks consent | `2026-11-v1` |
| Sesi staf / pelanggan | 12 jam / 30 hari |
| OTP pelanggan | 6 digit, berlaku 5 menit, maksimal 5 percobaan, jeda minta ulang 60 detik |

---

### Prompt 1: Fondasi dan skema data

```text
Siapkan fondasi proyek.

1. Buat proyek Next.js (App Router, TypeScript, Tailwind) dengan Prisma + SQLite.
2. Buat src/lib/business-rules.ts berisi semua konstanta pada tabel aturan
   bisnis, ditambah fungsi: normalizeWhatsApp (hasil selalu +62...),
   jakartaDayKey(date), rupiah(value), daysBefore(days).
3. Buat skema Prisma dengan model: Branch (name unik, rolloutStage), User,
   Customer (whatsapp UNIK, active, optedOut, marketingConsent, birthDate,
   favoriteCategory, favoriteSize, instagram, registeredAtId), Transaction,
   Stamp (unik customerId+dayKey), Redemption, StockItem, StockUpdateLog
   (type CHANGE|CONFIRM), StockMatchNotification (unik stockItemId+customerId),
   StockNotificationTemplate, Wishlist, ReminderTemplate (segment
   ALL|NEW|PERSONAL), ReminderLog, DuplicateCheckLog, KpiTarget (code unik),
   UserSession, CustomerSession, CustomerLoginCode, MessageConsent.
4. Buat migration Prisma, bukan hanya db push.
5. Buat prisma/seed.mjs yang idempoten: 4 cabang (Yogyakarta tahap 1,
   Semarang dan Magelang tahap 2, Bali tahap 3), 8 target KPI (S1, S2, S3,
   S4, S5, S6, S7a, S7b), 3 template reminder, dan data pelanggan sintetis.
6. Tambah skrip: db:setup, db:seed, user:create, test:regression.

Selesai jika: npm run db:setup berhasil dua kali berturut-turut tanpa error
dan tanpa data ganda.
```

### Prompt 2: Autentikasi, peran, cabang

```text
Bangun autentikasi staf.

- Login dengan email + password. Password minimal 12 karakter, hash scrypt.
- Sesi di database (UserSession). Simpan hash token. Cookie httpOnly,
  sameSite lax, secure di production, prefix __Host- di production.
  Masa berlaku 12 jam.
- Fungsi: requireStaff(roles?), requireStaffPage(roles?),
  requireBranchAccess(user, branchId). OWNER boleh semua cabang. Peran lain
  hanya cabangnya.
- Halaman awal per peran: CASHIER /kasir, STOCK_STAFF /stok,
  MARKETING /laporan, MANAGER dan OWNER /.
- Pesan gagal login sama untuk semua sebab (email salah, password salah,
  akun nonaktif). Tujuannya agar penyerang tidak bisa menebak email.
- Skrip scripts/create-user.mjs: interaktif saja. Password tersembunyi dan
  dikonfirmasi ulang. Tolak jika tidak ada terminal interaktif. Tidak ada
  password bawaan.
- Menu navigasi (AppShell) menampilkan item sesuai peran.

Selesai jika: tes membuktikan password dan token tidak tersimpan sebagai
teks asli, akun nonaktif tidak bisa masuk, dan peran yang salah diarahkan
ke halaman awalnya.
```

### Prompt 3: Pelanggan dan consent

```text
Bangun pendaftaran dan pencarian pelanggan di halaman /kasir dan /pelanggan.

- Pencarian terpisah dari pendaftaran. Kasir harus mencari dulu.
- Nomor WhatsApp dinormalisasi lalu divalidasi (9-15 digit). Nomor unik.
- Jika nomor sudah ada: JANGAN buat akun. Catat DuplicateCheckLog (nama yang
  dicoba, cabang, pelanggan yang sudah ada). Tampilkan pesan "duplikat".
  Tangani juga balapan data (error P2002 dari Prisma) dengan hasil yang sama.
- Consent pesan: kotak centang TIDAK dicentang otomatis. Simpan satu baris
  MessageConsent setiap perubahan: status GRANTED, DECLINED, atau REVOKED,
  beserta source, policyVersion, dan consentText saat itu.
- Menolak consent tidak menghalangi transaksi atau stamp.
- Mencabut consent: marketingConsent=false dan optedOut=true. Status
  riwayatnya REVOKED.
- Pelanggan lama yang dimigrasikan dianggap TANPA consent.

Selesai jika: tes membuktikan (a) pendaftaran ganda ditolak dan tercatat,
(b) consent tercatat saat daftar, (c) pencabutan consent tercatat dan
menghentikan pesan berikutnya.
```

### Prompt 4: Kasir: transaksi, stamp, penukaran

```text
Bangun alur transaksi di /kasir. Logika ada di
src/lib/transaction-service.ts dan berjalan dalam SATU db.$transaction.

Aturan:
1. Pelanggan harus aktif. Jika tidak, kembalikan "tidak ditemukan".
2. Stamp diberikan jika nominal >= minimum DAN pelanggan belum punya stamp
   pada hari Jakarta yang sama. Pakai unik (customerId, dayKey) sebagai
   pengaman terakhir. Tangkap P2002 dan kembalikan "sudah ada stamp hari ini".
3. Hasil yang mungkin: below-minimum, already-stamped, stamp-added.
   Transaksi TETAP tersimpan pada ketiganya.
4. Penukaran: hanya jika kasir mencentang pilihan DAN pelanggan punya
   minimal 3 stamp aktif (redeemedAt kosong). Ambil 3 stamp TERTUA. Buat
   Redemption, isi redeemedAt, hitung diskon = floor(nominal x 10 / 100).
   Hubungkan ke transaksi. Stamp boleh berasal dari cabang mana pun.
5. Jika pilihan tidak dicentang, stamp tidak berubah.
6. Tampilkan ke kasir: nominal, diskon, total akhir, dan hasil stamp.

Selesai jika: tes membuktikan nominal di bawah minimum tidak memberi stamp,
transaksi kedua di hari yang sama tidak memberi stamp kedua, 3 stamp tertua
tertukar lintas cabang, dan pilihan tidak dicentang tidak menyentuh stamp.
```

### Prompt 5: Stok dan konfirmasi harian

```text
Bangun halaman /stok untuk STOCK_STAFF, MANAGER, OWNER.

- Tambah barang: nama, kategori, ukuran (nilai dari daftar tetap), cabang.
  Status: AVAILABLE, SOLD, REMOVED. Cabang diperiksa dengan
  requireBranchAccess.
- Aksi: tandai terjual, keluarkan dari katalog (REMOVED), pulihkan, edit.
  Gunakan pembaruan bersyarat agar dua orang tidak menimpa satu sama lain.
- Setiap perubahan katalog menulis StockUpdateLog type CHANGE.
- "Konfirmasi stok hari ini" menulis StockUpdateLog type CONFIRM.
  Konfirmasi dan perubahan adalah DUA aktivitas berbeda.
  Konfirmasi saja BUKAN pembaruan aktual untuk KPI.
- Barang AVAILABLE yang masuk lebih dari 60 hari disebut stok mati.
- Setelah menambah barang AVAILABLE, panggil pencocokan wishlist (Prompt 7)
  dan tampilkan jumlah kecocokan.

Selesai jika: tes membuktikan konfirmasi tidak dihitung sebagai perubahan,
dan staf cabang A tidak bisa mengubah stok cabang B.
```

### Prompt 6: Portal pelanggan dan katalog

```text
Bangun portal pelanggan di /portal dengan empat tab: Beranda, Katalog stok,
Wishlist, Profil & preferensi.

- Login: pelanggan memasukkan nomor WhatsApp, lalu kode OTP 6 digit.
  Di development, tampilkan kode di terminal server (SIMULASI). Simpan hanya
  hash. Berlaku 5 menit. Maksimal 5 percobaan. Jeda minta ulang 60 detik.
  Jika nomor tidak terdaftar, tampilkan pesan yang SAMA dengan nomor
  terdaftar (jangan membocorkan siapa yang terdaftar).
- Di production, login portal ditolak sampai provider OTP nyata tersambung.
- Sesi pelanggan 30 hari, cookie httpOnly.
- Beranda: jumlah stamp aktif, progres menuju 3 stamp, 3 transaksi terakhir,
  5 notifikasi terakhir.
- Katalog: hanya barang AVAILABLE, baca-saja, filter kategori/ukuran/cabang.
  Beri catatan: "ketersediaan di katalog bukan jaminan stok fisik".
- Profil: ubah kategori dan ukuran favorit, tanggal lahir, Instagram, dan
  consent (setiap perubahan consent mengikuti aturan Prompt 3). Nama dan
  nomor WhatsApp hanya bisa diubah oleh staf.
- Pelanggan hanya boleh membaca dan mengubah datanya sendiri.

Selesai jika: tes membuktikan pelanggan A tidak bisa mengubah wishlist
pelanggan B, dan percobaan OTP ke-6 ditolak.
```

### Prompt 7: Wishlist dan notifikasi stok

```text
Bangun wishlist dan pencocokan stok di src/lib/wishlist-match.ts.

- Wishlist punya kategori, ukuran, kata kunci (semuanya opsional). Satu
  wishlist cocok dengan barang jika setiap kolom yang diisi cocok. Kata
  kunci dicocokkan sebagian, tanpa membedakan huruf besar/kecil.
- Pelanggan membuat, mengubah, menonaktifkan, dan menghapus wishlist miliknya.
- Dua pemicu: (a) barang AVAILABLE baru masuk, (b) wishlist baru dibuat
  atau diubah. Keduanya memakai logika yang sama.
- Penerima harus: wishlist aktif, pelanggan aktif, tidak opt-out, consent
  aktif, dan TIDAK menerima pesan apa pun dalam 7 hari terakhir
  (reminder + notifikasi stok).
- Satu pasangan (barang, pelanggan) hanya boleh punya satu notifikasi.
  Pengaman: kunci unik + tangkap P2002.
- Isi pesan dari StockNotificationTemplate dengan placeholder {nama}
  (nama depan), {barang}, {ukuran}, {cabang}.
- Simpan sebagai catatan simulasi dengan status SIMULATED_SENT. Tidak ada
  pesan yang dikirim.
- Tab `/pesan?tab=notifikasi`: semua peran staf boleh melihat log dan mengubah
  template. Perubahan template hanya berlaku untuk notifikasi berikutnya.

Selesai jika: tes membuktikan wishlist yang dibuat SETELAH stok masuk tetap
menghasilkan satu notifikasi, edit wishlist tidak menggandakannya, dan
pelanggan tanpa consent tidak menerima apa pun.
```

### Prompt 8: Reminder dan scheduler

```text
Bangun reminder di src/lib/reminders.ts dan route /api/cron/reminders.

Segmen template:
- ALL: semua pelanggan yang memenuhi syarat. Jika template punya jadwal,
  jalan hanya setelah jadwal lewat. Jika tanpa jadwal, jalan saat dipicu.
- NEW: pelanggan yang belum pernah bertransaksi.
- PERSONAL: pelanggan dengan minimal 3 transaksi. Hitung rata-rata jarak
  antar transaksi (dari 5 transaksi terakhir). Perkiraan beli berikutnya =
  transaksi terakhir + rata-rata jarak. Jadwal kirim = perkiraan - 2 hari.
  Hanya jalan jika sekarang berada di antara (perkiraan - 2 hari) dan
  (perkiraan + 3 hari).

Syarat semua segmen: pelanggan aktif, tidak opt-out, consent aktif, tidak
ada pesan dalam 7 hari terakhir. Periksa ulang syarat ini DI DALAM
transaksi database sebelum menulis log.

Hasil: baris ReminderLog dengan body (placeholder {nama} sudah diisi),
scheduledFor, sentAt, dan status. Ini SIMULASI.

Endpoint GET /api/cron/reminders:
- Butuh env REMINDER_CRON_SECRET minimal 32 karakter. Jika tidak ada: 503.
- Header Authorization: Bearer <secret>. Bandingkan dengan timingSafeEqual.
  Jika salah: 401.
- Jangan jalankan scheduler otomatis (tanpa node-cron). Sediakan tombol
  manual di halaman Manajemen (jalankan satu template atau semua template).
  Hanya OWNER, MANAGER, dan MARKETING yang boleh memicunya.

Selesai jika: tes membuktikan pelanggan tanpa consent tidak masuk, cooldown
bersama dengan notifikasi wishlist berlaku, dan endpoint menolak tanpa
secret.
```

### Prompt 9: Siklus data: edit, arsip, pulihkan

```text
Lengkapi operasi ubah dan hapus. Prinsip: riwayat tidak boleh hilang.

- Pelanggan (OWNER, MANAGER): cari, edit, arsipkan, pulihkan. Arsip
  menonaktifkan akses, menghapus CustomerSession dan CustomerLoginCode, tapi
  MEMPERTAHANKAN transaksi, stamp, dan log consent. Pelanggan arsip tidak
  bisa bertransaksi dan tidak menerima pesan. Nomor WhatsApp tetap unik:
  tampilkan petunjuk "pulihkan, jangan daftar ulang".
- Stok: edit, keluarkan sementara (REMOVED), pulihkan.
- Wishlist: pemilik boleh edit, nonaktifkan, hapus.
- Template reminder: edit atau nonaktifkan. Hapus hanya jika belum punya
  riwayat log.
- Transaksi dan stamp: TIDAK ada edit atau hapus.
- Aksi berbahaya memakai tombol konfirmasi (ConfirmSubmitButton).

Selesai jika: tes membuktikan pelanggan arsip tidak bisa transaksi dan tidak
menerima pesan simulasi, dan riwayatnya tetap utuh setelah dipulihkan.
```

### Prompt 10: Dashboard dan KPI

```text
Bangun dasbor di / dan tab laporan di /laporan (Reminder, Performa, Stok,
Duplikat). Hitung KPI di src/lib/kpi.ts. Target dan baseline dibaca dari
tabel KpiTarget. Jika jumlah target bukan 8, lempar error yang jelas.

Definisi:
- S1 Duplikasi (lebih kecil lebih baik, target <2%): akun ganda / total akun.
  Tampilkan percobaan pendaftaran ganda secara terpisah.
- S2 Penukaran stamp: cabang yang punya penukaran / jumlah cabang.
  Target 100%.
- S3 Repeat: pelanggan dengan minimal 2 transaksi dalam 30 hari.
- S4 Update stok: pasangan (cabang, hari) dengan log CHANGE dalam 7 hari
  terakhir / (jumlah cabang x 7). Konfirmasi tidak dihitung. Target >=90%.
- S5 Stok mati (lebih kecil lebih baik): stok AVAILABLE > 60 hari.
- S6 Reminder tepat jadwal: log dengan |sentAt - scheduledFor| <= 60 menit /
  semua log berjadwal. Target >=95%. Toleransi 60 menit adalah asumsi.
- S7a Frekuensi: transaksi per pelanggan aktif dalam 30 hari.
- S7b Konversi: pelanggan unik yang bertransaksi dalam 7 hari SETELAH
  reminder / pelanggan unik yang dapat reminder. Target >=20%.

Status per KPI: "Tercapai", "Berjalan" (lewat 50% jarak baseline ke target),
atau "Belum".

PENTING: semua angka reminder dan konversi berlabel SIMULASI. Jangan
menyebutnya bukti pengiriman. Nilai baseline di seed hanya contoh, bukan
hasil ukur operasional.

Selesai jika: tes membuktikan KPI mengembalikan 8 baris, dan keterlambatan
dan kecepatan reminder dihitung simetris.
```

### Prompt 11: Manajemen akun staf

```text
Bangun halaman /akun, hanya untuk OWNER.

- Buat akun (nama, email unik, peran, cabang, password minimal 12 karakter),
  ubah peran/cabang/password, aktifkan/nonaktifkan.
- Menonaktifkan akun atau mengganti password menghapus semua UserSession
  akun itu. Riwayat tidak dihapus.
- Larangan: OWNER tidak boleh menurunkan atau menonaktifkan dirinya sendiri.
  Sistem tidak boleh kehilangan OWNER aktif terakhir.
- Peran selain OWNER wajib punya cabang. OWNER tidak punya cabang.

Selesai jika: tes membuktikan OWNER aktif terakhir tidak bisa dinonaktifkan
dan sesi akun yang dinonaktifkan langsung tidak berlaku.
```

### Prompt 12: Tes regresi

```text
Tulis tests/regression.mjs. Tes memakai database terpisah
prisma/prisma/regression-test.db. Buat dan hapus database itu sendiri.
JANGAN menyentuh database demo.

Cakup minimal:
1. Password dan kode OTP tidak tersimpan sebagai teks asli.
2. Pendaftaran ganda ditolak dan tercatat.
3. Pelanggan arsip menyimpan riwayat tapi tidak bisa transaksi atau menerima
   pesan.
4. Consent tercatat saat daftar; pencabutan tercatat dan menghentikan pesan.
5. Di bawah minimum dan transaksi ke-2 sehari tidak memberi stamp.
6. 3 stamp tertua ditukar lintas cabang; pilihan tidak dicentang tidak
   menyentuh stamp.
7. Wishlist: satu notifikasi per pasangan, termasuk setelah edit.
8. Wishlist dan reminder wajib consent dan berbagi cooldown 7 hari.
9. KPI reminder tepat jadwal menghitung awal dan telat secara simetris.
10. Konfirmasi stok tercatat; KPI mengembalikan 8 baris.
11. Akses lintas cabang dan lintas peran ditolak.

Selesai jika: npm run test:regression lulus dan database demo tidak berubah.
```

### Prompt 13: Dokumen operasional

```text
Tulis docs/operasional-crm.md. Isi:
1. Tata kelola: peran (Sponsor, Steering Committee, Project Manager, tim,
   manajer cabang, kasir, staf stok, marketing, pengelola data) dan
   tanggung jawabnya.
2. SOP harian: kasir, staf stok, wishlist/reminder. Format checklist.
3. Pelatihan dan adopsi perubahan: urutan perubahan 8 langkah (Kotter) dan
   matriks buy-in (Champions, Bystanders, Loose Cannons, Weak Links).
4. Tabel risiko, indikator, mitigasi, dan pemilik.
5. Evaluasi bulanan.
6. Gerbang pilot: status persiapan (cabang, PM, tim, tanggal, data, go/no-go)
   dan checklist sebelum, selama, sesudah pilot.

Aturan: jangan mengarang nama orang atau tanggal. Tulis "Belum ditunjuk"
jika belum ada. Tegaskan bahwa sistem masih simulasi dan dokumen ini bukan
izin memakai data pelanggan nyata.
```

---

## 7. Prompt perbaikan celah

Kerjakan setelah Prompt 1-13 selesai (atau setelah Prompt Audit di Mode B).

### G1: Batasi percobaan login staf (prioritas tinggi)

```text
Fungsi loginStaff belum membatasi percobaan gagal. Perbaiki.

- Catat percobaan gagal per email dan per alamat IP (tabel baru
  LoginAttempt, atau cara lain yang kamu usulkan dan jelaskan).
- Setelah 5 gagal dalam 15 menit: tolak login sementara, bahkan dengan
  password benar. Pesan ke pengguna tetap umum, tidak menyebut alasan.
- Hapus penghitung setelah login berhasil.
- Tetap bandingkan hash walau akun tidak ada (jaga waktu respons serupa).
- Tes: percobaan ke-6 ditolak, login sah setelah jendela waktu lewat berhasil.
```

### G2: Koreksi transaksi dengan jejak audit

```text
Transaksi tidak bisa diubah, jadi kasir yang salah input belum punya jalur
resmi. Rancang "void transaksi" TANPA menghapus data.

- Hanya MANAGER dan OWNER. Wajib isi alasan. Wajib batas waktu (usulkan
  default, misalnya hari yang sama; tulis sebagai asumsi).
- Buat model TransactionVoid (transactionId unik, userId, alasan, waktu).
  Transaksi asli tidak diubah.
- Jika transaksi memberi stamp: stamp ditandai batal, bukan dihapus.
  Jika stamp itu sudah ditukar: tolak void dan jelaskan alasannya.
- Jika transaksi memakai penukaran: kembalikan 3 stamp (redeemedAt kosong)
  dan tandai Redemption batal.
- KPI dan laporan mengabaikan transaksi yang di-void.
- Tes: void mengembalikan stamp yang ditukar, void ditolak jika stamp sudah
  dipakai, dan riwayat asli tetap ada.
Tulis rencana dulu. Tunggu persetujuan sebelum membuat migration.
```

### G3: Jejak audit aksi staf

```text
Buat model AuditLog (userId, aksi, entitas, entitasId, cabangId, waktu,
ringkasan tanpa data sensitif). Catat: login/logout, buat/ubah/arsip
pelanggan, perubahan consent, void transaksi, perubahan akun staf, perubahan
template, dan penjalanan scheduler manual. Jangan catat password, token,
atau isi OTP. Tambah tampilan baca-saja untuk OWNER. Tes: aksi sensitif
menghasilkan satu baris log.
```

### G4: WhatsApp dan OTP nyata (hanya setelah tinjauan privasi dan hukum)

```text
Sebelum menulis kode, buat dokumen keputusan singkat:
(1) pilihan provider WhatsApp resmi dan biayanya, (2) kebutuhan template
pesan yang harus disetujui provider, (3) dasar hukum dan teks consent untuk
data pribadi pelanggan di Indonesia, (4) kebijakan retensi data.
Berhenti dan minta persetujuan saya.

Setelah disetujui:
- Buat antarmuka MessageProvider dengan satu implementasi simulasi (yang
  sekarang) dan satu implementasi nyata. Pilihan lewat env.
- Status pesan: QUEUED, SENT, DELIVERED, FAILED. Hentikan memakai kata
  "SIMULATED_SENT" untuk pesan nyata.
- Terima webhook status dengan verifikasi tanda tangan. Simpan hasilnya.
- Aktifkan OTP nyata untuk portal. Tambah batas permintaan per nomor dan per IP.
- Pesan gagal tidak boleh membuka kembali cooldown secara diam-diam.
  Jelaskan aturan yang kamu pilih.
- KPI S6 dan S7b beralih ke data pengiriman nyata. Beri label sumber data.
```

### G5: Pindah dari SQLite ke PostgreSQL

```text
Pindahkan database ke PostgreSQL agar empat cabang memakai data bersama.

- Ubah datasource Prisma. Buat migration baru dari baseline.
- Periksa semua kode yang menghindari fitur yang tidak ada di SQLite
  (contoh: createMany tanpa skipDuplicates). Jelaskan yang bisa disederhanakan.
- Ganti tipe string untuk peran/status dengan enum Prisma. Buat migration
  data yang aman.
- Tambah indeks untuk kueri KPI dan pencarian pelanggan.
- Skrip pemindahan data dari SQLite ke PostgreSQL untuk data sintetis.
- Jalankan seluruh tes regresi di PostgreSQL. Dokumentasikan backup dan
  pemulihan.
```

### G6: Rapikan status pesan

```text
ReminderLog memakai status "SENT", sedangkan StockMatchNotification memakai
"SIMULATED_SENT". Satukan dengan satu daftar status dan satu helper.
Pastikan KPI memfilter status dengan benar setelah perubahan dan UI selalu
menampilkan "simulasi" selama provider nyata belum aktif. Buat migration
yang mengubah data lama. Tambah tes.
```

---

## 8. Prompt peninjauan akhir

Jalankan sebelum pilot. Idealnya di sesi baru, agar agent tidak menilai pekerjaannya sendiri.

```text
Kamu peninjau independen. Jangan ubah kode. Tinjau seluruh repo terhadap
AGENTS.md dan docs/operasional-crm.md.

Periksa:
1. Setiap Server Action memeriksa peran dan cabang di baris pertama.
2. Tidak ada data pelanggan yang bocor lintas pelanggan atau lintas cabang.
3. Tidak ada rahasia di Git (.env, secret, token).
4. Consent: tidak ada jalur kirim pesan yang melewati pemeriksaan consent
   dan cooldown.
5. Tidak ada tempat yang menyebut simulasi sebagai pengiriman nyata.
6. Transaksi dan stamp memang tidak bisa diubah atau dihapus.
7. Semua angka bisnis berasal dari business-rules.ts.

Keluaran: tabel temuan (berat, file:baris, bukti, saran). Pisahkan fakta
dari dugaan. Jangan melaporkan temuan yang tidak kamu verifikasi di kode.
```

---

## 9. Template untuk fitur baru

```text
KONTEKS: ikuti AGENTS.md.
TUJUAN: <satu kalimat: siapa, melakukan apa, untuk hasil apa>
PERAN YANG BOLEH: <peran>
ATURAN BISNIS: <angka dan syarat; tambahkan ke business-rules.ts>
DATA: <model/kolom baru; wajib migration>
BATASAN: <apa yang TIDAK boleh berubah>
KASUS TEPI: <duplikat, balapan data, pelanggan arsip, tanpa consent, lintas cabang>
SELESAI JIKA: <hasil yang bisa diuji>
Tulis rencana singkat dulu. Setelah saya setuju, kerjakan, tambah tes,
lalu jalankan lint, build, dan test:regression.
```

**Tiga kebiasaan yang membuat prompt berhasil:**

1. **Satu tujuan per prompt.** Prompt panjang yang mencampur lima fitur menghasilkan kode yang sulit ditinjau.
2. **Tulis angka dan kasus tepi secara eksplisit.** Agent tidak menebak aturan bisnis Anda dengan benar.
3. **Minta rencana sebelum kode** untuk perubahan skema atau aturan uang dan consent.