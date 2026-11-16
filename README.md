# Lestari Thrift CRM

Purwarupa CRM lintas cabang dengan Next.js App Router, TypeScript, SQLite, Prisma, dan Tailwind CSS.

## Menjalankan lokal

```powershell
npm install
Copy-Item .env.example .env
npm run db:setup
npm run user:create
npm run dev
```

Buka `http://localhost:3000`. Perintah `db:setup` membuat tabel SQLite dan memuat data demo empat cabang. Dengan URL contoh, database lokal tersimpan di `prisma/prisma/dev.db` dan tidak masuk Git.

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

Login pelanggan memakai OTP acak hanya di lingkungan pengembangan; kode ditampilkan di terminal server dan kedaluwarsa setelah 5 menit. Login pelanggan di production ditolak sampai provider OTP WhatsApp disambungkan. Jangan gunakan purwarupa ini untuk data pelanggan nyata sebelum integrasi itu dan tinjauan keamanan selesai.

Endpoint scheduler perlu `REMINDER_CRON_SECRET` minimal 32 karakter dan header `Authorization: Bearer <secret>`; tanpa konfigurasi endpoint menolak permintaan.

## Nilai demo dan batasan

- Nominal minimum transaksi untuk mendapat stamp adalah **Rp150.000**.
- Penukaran tiga stamp memberi diskon **10%**.
- Aturan stamp disimpan di `src/lib/business-rules.ts`.
- Pesan memerlukan persetujuan eksplisit. Pendaftaran kasir tidak memilih persetujuan otomatis; persetujuan dan pencabutan dicatat beserta sumber, versi teks, dan waktunya. Pelanggan lama dimigrasikan tanpa persetujuan.
- Batas satu pesan per tujuh hari berlaku gabungan untuk reminder dan notifikasi wishlist, bukan satu batas terpisah per jenis pesan.
- Semua pengiriman WhatsApp hanya simulasi dalam database; integrasi WhatsApp eksternal tidak digunakan.
- `/api/cron/reminders` memproses reminder yang jatuh tempo. Lindungi endpoint ini sebelum mengeksposnya ke internet; belum ada integrasi `node-cron` atau autentikasi cron.
- Data pelanggan dan katalog pada database lokal hanyalah data contoh sintetis.
- `npm run test:regression` membuat dan menghapus hanya database uji terisolasi `prisma/prisma/regression-test.db`; database demo lokal tidak disentuh.

## Definisi pengukuran target CRM

Gunakan baseline enam bulan sebelum roll-out dan evaluasi hasil pada enam bulan setelahnya. Nilai baseline yang dimuat seed (misalnya 40 pelanggan repeat dan frekuensi 1,6) hanya data demo, bukan hasil ukur operasional.

- **Duplikasi <2%:** jumlah akun pelanggan duplikat dibagi total akun pelanggan; percobaan pendaftaran ganda dilaporkan terpisah.
- **Stamp 100%:** penukaran QA yang berhasil dibagi seluruh percobaan penukaran QA, dengan pengujian di keempat cabang.
- **Repeat purchase +25%:** jumlah pelanggan dengan lebih dari satu transaksi pada periode ukur dibanding baseline sejenis; contoh seed 40 menjadi 50.
- **Update stok ≥90%:** hari-cabang dengan pencatatan stok aktual dibagi seluruh hari-cabang yang wajib diperbarui. Konfirmasi tanpa pencatatan stok bukan pembaruan aktual.
- **Stok mati turun 20%:** jumlah stok mati di akhir periode dibanding baseline; contoh seed 25 menjadi maksimal 20.
- **Reminder tepat jadwal ≥95%:** pesan yang benar-benar terkirim dalam toleransi jadwal dibagi seluruh pesan yang jatuh tempo. Toleransi 60 menit masih asumsi purwarupa dan perlu disahkan sebelum evaluasi.
- **Frekuensi belanja +15%:** transaksi per pelanggan aktif per 30 hari dibanding baseline sejenis; contoh seed 1,6 menjadi 1,84.
- **Konversi reminder ≥20%:** pelanggan unik yang bertransaksi dalam 7 hari setelah pesan diterima dibagi pelanggan unik yang menerima pesan.
