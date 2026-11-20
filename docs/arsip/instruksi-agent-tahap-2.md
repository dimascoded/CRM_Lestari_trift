Arsip: sudah diterapkan.

# Prompt Agent: Perbaikan Alur CRM Lestari Thrift (Tahap 2)

Kerjakan perubahan berikut di repo ini. Patuhi `AGENTS.md`: logika di `src/lib/*-service.ts`, Server Action memeriksa peran dan cabang, operasi multi-tabel memakai `db.$transaction`, WhatsApp dan OTP tetap simulasi, tidak ada pengiriman pesan nyata, data sintetis saja. Jangan mengubah perilaku lain. Kerjakan berurutan P1 sampai P8. Setelah selesai jalankan `npm run lint`, `npm run build`, `npm run test:regression`, dan perbarui `README.md` serta `docs/` bila menyebut hal yang berubah.

## P1. Tab Pesan menurut peran

File: `src/app/(admin)/pesan/page.tsx`.

1. Peran `staff.role` yang boleh melihat tab `reminder`: `OWNER`, `MANAGER`, `MARKETING`. Peran lain tidak melihat tab itu di navigasi tab.
2. Bila `?tab=reminder` diminta oleh peran lain, tampilkan tab `antrean`. Jangan redirect ke halaman awal.
3. Tab `antrean`, `notifikasi`, `log` tetap tampil untuk semua peran staf.

## P2. Antrean tindak lanjut yang bisa ditindaklanjuti

File: `src/app/(admin)/pesan/page.tsx` (`FollowUpTab`), `src/lib/followup-service.ts`, file baru `src/lib/followup-messages.ts` dan `src/components/CopyMessageButton.tsx` (client component), `src/app/(admin)/pelanggan/[id]/page.tsx`.

1. Ganti empat tabel bertumpuk dengan navigasi `?queue=JATUH_TEMPO|SATU_STAMP|TIDAK_AKTIF|WISHLIST_BELUM`. Tampilkan satu tabel sesuai `queue`, default `JATUH_TEMPO`. Tiap tombol navigasi menampilkan jumlah baris antrean.
2. `followup-messages.ts` mengekspor `followUpMessage(queue, customerName)`. Ambil nama depan dan pakai teks:

- `JATUH_TEMPO`: `Halo {nama}, sudah waktunya cek koleksi baru Lestari Thrift. Ada stok baru yang mungkin cocok untukmu.`
- `SATU_STAMP`: `Halo {nama}, tinggal 1 stamp lagi untuk dapat diskon 10% di semua cabang Lestari Thrift.`
- `TIDAK_AKTIF`: `Halo {nama}, kami kangen! Ada koleksi baru di Lestari Thrift yang mungkin kamu suka.`
- `WISHLIST_BELUM`: `Halo {nama}, ada barang yang cocok dengan wishlist kamu di Lestari Thrift.`

Ambil persen diskon dari `REDEMPTION_DISCOUNT_PERCENT`, bukan teks tetap.

3. Kolom aksi per baris:

- Bila `marketingConsent` true dan `optedOut` false: tombol "Salin pesan" (menyalin teks dari `followUpMessage` ke clipboard, lalu menampilkan "Tersalin. Kirim manual di luar aplikasi.") dan form "Tandai sudah dihubungi" yang sudah ada.
- Bila `optedOut` true: teks "Tidak dapat dihubungi" dan tanpa tombol salin.
- Bila belum setuju dan tidak opt-out: tautan "Catat persetujuan" ke `/pelanggan/<id>#persetujuan` dan tanpa tombol salin.

4. Tambahkan `id="persetujuan"` pada form `recordCashierConsent` di `/pelanggan/[id]` dan `/kasir`.
5. Tidak ada pengiriman pesan dari antrean. Tombol salin hanya membantu staf.

## P3. Kasir: aksi utama di atas

File: `src/app/(admin)/kasir/page.tsx`.

Urutan di kartu pelanggan terpilih:

1. Header pelanggan, lencana segmen, ringkasan stamp.
2. Peringatan persetujuan bila belum setuju.
3. Banner ajakan lengkapi profil dan banner diskon stamp.
4. Form "Catat transaksi".
5. Riwayat transaksi beserta form pembatalan, dibungkus `<details>` dengan `<summary>Riwayat transaksi</summary>`, tertutup secara default.

Fungsi form dan aksinya tidak berubah.

## P4. Roll-out: satu aturan global

File: `src/lib/rollout.ts`, `src/app/actions.ts`, `src/lib/followup-service.ts`, `src/lib/wishlist-match.ts`, `src/lib/reminders.ts`, `src/app/(pelanggan)/portal/page.tsx`, `src/app/(admin)/strategi/page.tsx`, `src/components/Notice.tsx`.

1. Ganti `featureEnabledForBranch` dengan `featureEnabled(feature, client = db)`:

- `wishlist` dan `stockNotification`: aktif bila tahap tertinggi di antara cabang >= 2.
- `reminder`: aktif bila tahap tertinggi >= 3.
- `ROLLOUT_GATING=off` selalu mengembalikan true.
- `client` boleh berupa `tx` di dalam transaksi Prisma.

2. `reminderEnabled()` memanggil `featureEnabled("reminder")`.
3. Ganti semua pemanggil `featureEnabledForBranch` (cari dengan `grep -rn featureEnabledForBranch src tests`). Hapus `include` cabang yang hanya dipakai untuk pengecekan itu.
4. Teks status: `Fitur belum aktif: tahap roll-out belum mencapai tahap {n}.` untuk semua pesan "belum aktif di tahap roll-out cabang ini" (reminder tab, portal, `Notice`).
5. Teks di `/strategi`: "Wishlist dan notifikasi stok aktif bila ada cabang tahap 2 atau lebih; reminder aktif bila ada cabang tahap 3."
6. Kontrol tahap per cabang oleh OWNER tetap ada.

## P5. Pemetaan BDN berpasangan

File: `src/app/(admin)/strategi/page.tsx`.

Ganti `mapping` menjadi daftar dengan `codes` (array), tampilkan tiap kode sebagai baris kecil: kode, capaian, status (field sama dengan tabel KPI di Beranda), dan label jenis:

IT enabler | Fitur | Layar | Kode
--- | --- | --- | ---
Database terpusat | Profil pelanggan lintas cabang | `/pelanggan` | S1 (segera)
Stamp digital | Stamp dan diskon lintas cabang | `/kasir` | S2 (segera), S3 (jangka panjang)
Wishlist dan notifikasi stok | Pencocokan stok tersedia | `/pesan?tab=notifikasi` | S4 (segera), S5 (jangka panjang)
Reminder personal | Reminder simulasi dan jadwal | `/pesan?tab=reminder` | S6 (segera), S7a dan S7b (jangka panjang)

Hapus baris "Pemantauan". Tambahkan satu tautan "Semua KPI" ke `/laporan` di bawah tabel.

## P6. Tautan lompat di dashboard

File: `src/app/(admin)/page.tsx`, `src/app/globals.css`.

Di bawah form filter tambahkan `<nav className="anchor-nav">` berisi tautan ke `#ringkasan`, `#penjualan`, `#pelanggan`, `#wishlist`, `#stok`, `#pesan`, `#kpi` (id bagian sudah ada). Gaya `.anchor-nav`: baris horizontal dengan jarak, teks minimal 13px, bisa digulir di layar sempit.

## P7. Bersihkan hiasan palsu di sidebar

File: `src/components/AppShell.tsx`, `src/app/(admin)/layout.tsx`, `src/app/globals.css`.

1. Hapus `workspace-label`, `workspace-picker`, dan kartu `support-card` (email fiktif).
2. Hapus prop `branchCount` bila tidak dipakai lagi dan perbarui pemanggilnya.
3. Hapus kelas CSS yang tidak terpakai (`workspace-*`, `support-*`, `chevron`).
4. Informasi pengguna dan tombol keluar tetap ada.

## P8. Rapikan file di root repo

1. Hapus `PERBAIKAN_UI_DAN_GAP_PRD_FASE.md` (usang dan bertentangan dengan keputusan terbaru).
2. Pindahkan `INSTRUKSI_AGENT_REPO_LESTARI_CRM.md` ke `docs/arsip/instruksi-agent-tahap-1.md` dan tambahkan baris pertama "Arsip: sudah diterapkan."
3. Simpan prompt ini sebagai `docs/arsip/instruksi-agent-tahap-2.md` setelah selesai, dengan baris pertama yang sama.

## Tes yang ditambahkan atau diubah (`tests/regression.mjs`)

1. Tab `reminder` tidak muncul untuk `CASHIER` dan `STOCK_STAFF`, dan permintaan `?tab=reminder` dari mereka menampilkan antrean.
2. `featureEnabled("wishlist")` dan `featureEnabled("stockNotification")` bernilai false bila tahap tertinggi 1, true bila 2 atau lebih.
3. `featureEnabled("reminder")` false bila tahap tertinggi 2, true bila 3, dan semua true bila `ROLLOUT_GATING=off`.
4. Pelanggan yang terdaftar di cabang tahap 1 dapat membuat wishlist bila ada cabang tahap 2 atau lebih.
5. `followUpMessage` mengisi nama depan dan persen diskon dari konstanta untuk keempat antrean.
6. Perbarui semua tes lama yang bergantung pada `featureEnabledForBranch`.

## Selesai bila

- `lint`, `build`, dan `test:regression` lulus.
- Kasir dan staf stok tidak dialihkan saat membuka `/pesan`.
- Antrean menampilkan satu jenis per layar dengan tombol salin pesan atau tautan persetujuan.
- Form "Catat transaksi" muncul sebelum riwayat di `/kasir`.
- Tidak ada referensi ke `featureEnabledForBranch`, `workspace-picker`, atau `support-card`.
- `/strategi` menampilkan pasangan KPI per IT enabler.
- Root repo tidak berisi `PERBAIKAN_UI_DAN_GAP_PRD_FASE.md`.
