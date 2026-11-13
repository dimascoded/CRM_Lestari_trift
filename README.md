# Lestari Thrift CRM

Purwarupa CRM lintas cabang dengan Next.js App Router, TypeScript, SQLite, Prisma, dan Tailwind CSS.

## Menjalankan lokal

```powershell
npm install
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

Buka `http://localhost:3000`. Perintah `db:setup` membuat tabel SQLite dan memuat data demo empat cabang. Dengan URL contoh, database lokal tersimpan di `prisma/prisma/dev.db` dan tidak masuk Git.

Perintah lain:

```powershell
npm run db:push  # sinkronkan schema tanpa membuat migration (pengembangan saja)
npm run db:seed  # isi data demo secara idempoten
npx prisma migrate dev --name nama_migration
npm run lint
npm run build
npm run test:regression
```

`db:setup` menjalankan migration Prisma dan seed. Migration baseline di `prisma/migrations` menjaga database lama yang sebelumnya dibuat dengan `db push` tanpa perlu mereset data.

## Urutan pengembangan

1. **Fondasi data dan UI:** model cabang, akun, pelanggan, transaksi, stamp, stok, wishlist, dan reminder; shell navigasi responsif; data demo.
2. **Pelanggan dan loyalitas:** pencarian terpisah dari pendaftaran, transaksi, diskon otomatis tiga stamp, dan satu stamp per hari.
3. **Stok dan portal:** konfirmasi stok harian, katalog publik baca-saja, wishlist pelanggan, profil, opt-out, serta notifikasi simulasi.
4. **Marketing dan laporan:** reminder sesuai kebiasaan beli, batas kirim tujuh hari, tab laporan, dan KPI BDN.
5. **Akses:** pemilih peran dan login pelanggan simulasi tersedia; autentikasi/otorisasi produksi masih menjadi pekerjaan lanjutan.

Tahap 1–4 tersedia sebagai purwarupa lokal saat ini. Tahap 5 masih diperlukan sebelum sistem dipakai operasional.

## Nilai demo dan batasan

- Nominal minimum transaksi untuk mendapat stamp saat ini **Rp100.000**.
- Penukaran tiga stamp memberi diskon demo **10%**.
- Keduanya adalah nilai sementara karena belum ditentukan di kebutuhan kelompok. Ubah `STAMP_MINIMUM_TRANSACTION` dan `REDEMPTION_DISCOUNT_PERCENT` di `src/lib/business-rules.ts` setelah keputusan final.
- Semua pengiriman WhatsApp hanya simulasi dalam database; integrasi WhatsApp eksternal tidak digunakan.
- Pemilih role hanya menyaring menu; ini bukan autentikasi atau batas keamanan. Login portal menggunakan kode tetap `123456`, hanya untuk simulasi. Jangan masukkan data pelanggan nyata sampai autentikasi dan otorisasi server tersedia.
- `/api/cron/reminders` memproses reminder yang jatuh tempo. Lindungi endpoint ini sebelum mengeksposnya ke internet; belum ada integrasi `node-cron` atau autentikasi cron.
- Data pelanggan dan katalog pada database lokal hanyalah data contoh sintetis.
- `npm run test:regression` membuat dan menghapus hanya database uji terisolasi `prisma/prisma/regression-test.db`; database demo lokal tidak disentuh.
