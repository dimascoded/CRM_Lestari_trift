# Lestari Thrift CRM

Purwarupa CRM lintas cabang dengan Next.js App Router, TypeScript, SQLite, Prisma, dan Tailwind CSS. Data operasional disimpan secara lokal; data seed bersifat sintetis. Pengiriman WhatsApp dan OTP hanya disimulasikan, jadi demo tidak memerlukan provider berbayar.

## Menjalankan lokal

```powershell
npm install
Copy-Item .env.example .env
npm run db:setup
npm run user:create
npm run dev
```

Buka `http://localhost:3000`. Perintah `db:setup` membuat tabel SQLite dan memuat data demo empat cabang. Dengan URL contoh, database lokal tersimpan di `prisma/prisma/dev.db` dan tidak masuk Git.

`npm run user:create` harus dijalankan dari terminal interaktif: isi nama dan email demo, pilih peran (`OWNER` tidak memerlukan cabang), lalu buat password lokal minimal 12 karakter yang dimasukkan secara tersembunyi dan dikonfirmasi ulang. Pemanggilan non-interaktif ditolak sebelum akun dibuat. Jangan gunakan password atau data pelanggan nyata untuk demo.

Perintah lain:

```powershell
npm run db:push  # sinkronkan schema tanpa membuat migration (pengembangan saja)
npm run db:seed  # isi data demo secara idempoten
npm run user:create  # buat akun owner/staf dengan password tersembunyi
npx prisma migrate dev --name nama_migration
npm run lint
npm run build
npm run test:regression
```

`db:setup` menjalankan migration Prisma dan seed. Migration baseline di `prisma/migrations` menjaga database lama yang sebelumnya dibuat dengan `db push` tanpa perlu mereset data.

## Urutan pengembangan

1. **Fondasi data dan UI:** model cabang, akun, pelanggan, transaksi, stamp, stok, wishlist, dan reminder; shell navigasi responsif; data demo.
2. **Pelanggan dan loyalitas:** pencarian terpisah dari pendaftaran, transaksi, diskon otomatis tiga stamp, dan satu stamp per hari.
3. **Stok dan portal:** konfirmasi stok harian, katalog publik baca-saja, wishlist pelanggan, profil, persetujuan pesan tercatat, serta notifikasi simulasi.
4. **Marketing dan laporan:** reminder sesuai kebiasaan beli, maksimal satu pesan gabungan per pelanggan dalam tujuh hari, tab laporan, dan KPI BDN.
5. **Akses:** login staf dengan akun terprovisi, sesi server-side, dan pemeriksaan peran/cabang; OTP pelanggan hanya simulasi lokal sampai provider WhatsApp tersedia.

Tahap 1–5 tersedia sebagai purwarupa lokal. Integrasi OTP pelanggan dan WhatsApp masih diperlukan sebelum sistem dipakai dengan data pelanggan nyata.

## Akun staf dan autentikasi

Setelah `db:setup`, buat akun owner pertama dengan `npm run user:create`, lalu buat akun staf lain melalui perintah yang sama. Password minimal 12 karakter disimpan sebagai hash scrypt; akun tidak memiliki password demo bawaan. Akses CRM memerlukan sesi server-side, dan aksi memeriksa peran serta cabang.

Login staf diblokir setelah lima kegagalan dalam 15 menit per email atau alamat IP, termasuk ketika password berikutnya benar. Pembatasan IP membaca `x-forwarded-for` atau `x-real-ip`; deployment harus memakai reverse proxy tepercaya yang mengganti header tersebut.

## Pengelolaan data (CRUD)

Pelanggan dapat dicari, diedit, diarsipkan, dan dipulihkan oleh staf berwenang. Arsip menonaktifkan akses pelanggan dan menghapus sesi/kode login aktif, tetapi mempertahankan transaksi, stamp, dan log persetujuan. Nomor WhatsApp tetap unik; pulihkan pelanggan yang diarsipkan alih-alih mendaftarkannya kembali.

Stok dapat diedit atau dikeluarkan sementara dari katalog lalu dipulihkan. Wishlist dapat diedit, dinonaktifkan, atau dihapus oleh pemiliknya. Template reminder dapat diedit atau dinonaktifkan; template tanpa riwayat dapat dihapus. Transaksi dan riwayat stamp tidak dapat diedit atau dihapus. OWNER/MANAGER dapat membatalkan transaksi dengan alasan wajib pada hari kalender yang sama (Asia/Jakarta); transaksi asli tetap tersimpan, stamp hasilnya ditandai batal, dan penukaran stamp dipulihkan dengan jejak yang tetap tersimpan. Pembatalan ditolak jika stamp hasil transaksi sudah ditukar. Hanya OWNER yang dapat membuat dan mengelola akun staf; penonaktifan akun mencabut sesi tanpa menghapus riwayat.

Menu **Pesan** menyediakan antrean tindak lanjut menurut jenis, reminder, notifikasi wishlist, dan log simulasi. Antrean menampilkan satu jenis per layar; pesan hanya dapat disalin untuk dikirim manual di luar aplikasi oleh staf yang memiliki persetujuan aktif. Tidak ada pengiriman dari antrean. Tab reminder hanya tersedia untuk OWNER, MANAGER, dan MARKETING. Laporan operasional berada di `/laporan`, profil pelanggan di `/pelanggan/[id]`, dan ringkasan strategi di `/strategi`.

Login pelanggan memakai OTP acak hanya di lingkungan pengembangan; kode ditampilkan di terminal server dan kedaluwarsa setelah 5 menit. Login pelanggan di production ditolak sampai provider OTP WhatsApp disambungkan. Jangan gunakan purwarupa ini untuk data pelanggan nyata sebelum integrasi itu dan tinjauan keamanan selesai.

Scheduler manual tersedia di **Pesan → Reminder**. Scheduler lokal opsional berjalan setiap 15 menit hanya ketika `ENABLE_LOCAL_SCHEDULER=true`; nilai default tidak aktif. Proses membuat catatan simulasi saja dan tidak mengirim pesan nyata. `ROLLOUT_GATING=off` melewati pembatasan tahap roll-out untuk demo; default `on`. Dengan gating aktif, wishlist dan notifikasi stok aktif bila ada cabang tahap 2 atau lebih, sedangkan reminder aktif bila ada cabang tahap 3.

## Nilai demo dan batasan

- Nominal minimum transaksi untuk mendapat stamp adalah **Rp100.000**.
- Penukaran tiga stamp memberi diskon **10%**.
- Aturan stamp disimpan di `src/lib/business-rules.ts`.
- Pesan memerlukan persetujuan eksplisit. Pendaftaran kasir tidak memilih persetujuan otomatis; persetujuan dan pencabutan dicatat beserta sumber, versi teks, dan waktunya. Pelanggan lama dimigrasikan tanpa persetujuan.
- Batas satu pesan per tujuh hari berlaku gabungan untuk reminder dan notifikasi wishlist, bukan satu batas terpisah per jenis pesan.
- Reminder dan notifikasi wishlist hanya membuat catatan simulasi di database; tidak ada pesan yang dikirim dan tidak diperlukan API atau biaya WhatsApp.
- Antrean tindak lanjut menampilkan Jatuh tempo, Satu stamp lagi, Tidak aktif, atau Wishlist belum diproses secara terpisah. Salin pesan tidak mengirimkannya; staf harus mengirim manual di luar aplikasi dan hanya boleh menghubungi pelanggan dengan persetujuan aktif yang belum opt-out.
- `/api/cron/reminders` memproses reminder yang jatuh tempo dan memerlukan secret di atas. Endpoint bukan scheduler otomatis; jangan mengeksposnya ke internet tanpa kontrol operasional yang sesuai.
- Checklist peran, SOP, pelatihan, risiko, evaluasi bulanan, dan gerbang pilot ada di [docs/operasional-crm.md](./docs/operasional-crm.md).
- Data pelanggan dan katalog pada database lokal hanyalah data contoh sintetis.
- `npm run test:regression` membuat dan menghapus hanya database uji terisolasi `prisma/prisma/regression-test.db`; database demo lokal tidak disentuh.

## Definisi pengukuran target CRM

Gunakan baseline enam bulan sebelum roll-out dan evaluasi hasil pada enam bulan setelahnya. Nilai baseline yang dimuat seed (misalnya 40 pelanggan repeat dan frekuensi 1,6) hanya data demo, bukan hasil ukur operasional.

- **Duplikasi <2%:** jumlah akun pelanggan duplikat dibagi total akun pelanggan; percobaan pendaftaran ganda dilaporkan terpisah.
- **S2 · Uji tukar stamp:** setiap cabang harus memiliki minimal satu uji; nilai adalah jumlah uji lulus dibagi total uji. Nilai 0% bila masih ada cabang yang belum diuji.
- **Repeat purchase +25%:** jumlah pelanggan dengan lebih dari satu transaksi pada periode ukur dibanding baseline sejenis; contoh seed 40 menjadi 50.
- **S4 · Update stok ≥90%:** pasangan cabang-hari dengan perubahan katalog atau konfirmasi jumlah hitung fisik dibagi seluruh hari-cabang pada jendela tujuh hari. Konfirmasi menyimpan hitung fisik dan hitung sistem; selisih tetap dicatat dengan peringatan.
- **Stok mati turun 20%:** jumlah stok mati di akhir periode dibanding baseline; contoh seed 25 menjadi maksimal 20.
- **S6 · Reminder tepat jadwal ≥95%:** simulasi yang dicatat dalam rentang ±60 menit dari jadwal dibagi seluruh simulasi yang memiliki jadwal. Jadwal personal ditetapkan pukul 09.00 Asia/Jakarta pada hari lead time; scheduler lokal opsional hanya membuat log simulasi.
- **Frekuensi belanja +15%:** transaksi per pelanggan aktif per 30 hari dibanding baseline sejenis; contoh seed 1,6 menjadi 1,84.
- **Konversi reminder ≥20%:** pelanggan unik yang bertransaksi dalam 7 hari setelah simulasi reminder dicatat dibagi pelanggan unik dengan simulasi reminder tercatat. Ini bukan pengukuran delivery nyata.
