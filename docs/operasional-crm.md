# Checklist Operasional CRM Lestari Thrift

Dokumen ini menerjemahkan rencana CRM menjadi tata kerja dan gerbang pilot. Purwarupa saat ini menyimpan data di SQLite lokal dan **tidak mengirim WhatsApp/OTP sungguhan**. Gunakan data sintetis saja; checklist ini bukan persetujuan untuk mengoperasikan sistem dengan data pelanggan nyata.

## 1. Tata kelola dan akuntabilitas

| Peran | Tanggung jawab operasional |
| --- | --- |
| Executive Sponsor (pemilik) | Menyetujui tujuan, aturan bisnis, anggaran, keputusan lanjut/tunda/hentikan, serta meninjau hasil enam bulanan. |
| Steering Committee (pemilik, manajer Bali/Yogyakarta/Semarang/Magelang, kepala marketing) | Meninjau progres dan risiko bulanan, menyetujui gerbang rollout, menugaskan pemilik tindak lanjut, dan menyimpan keputusan. |
| Project Manager | Menjaga jadwal, daftar isu/keputusan, koordinasi lintas cabang, kesiapan pelatihan, dan laporan status. |
| Project Team | Perwakilan kasir, stok, marketing, dan pengelola data dari cabang pilot; menguji alur, mencatat kendala, dan menyampaikan umpan balik staf/pelanggan. |
| Manajer cabang | Menetapkan petugas dan jadwal, memastikan prosedur cabang dijalankan, memeriksa log harian, dan mengeskalasi insiden. |
| Kasir | Mencari pelanggan sebelum mendaftar, meminta persetujuan pesan secara eksplisit, mencatat transaksi dengan nominal benar, serta menjelaskan stamp dan diskon. |
| Staf stok | Memeriksa stok fisik, mencatat penambahan/perubahan/status terjual pada katalog, melakukan konfirmasi harian secara terpisah, dan melaporkan selisih. |
| Marketing | Menyusun dan meninjau template, memeriksa segmen serta jadwal, menjalankan simulasi yang jatuh tempo, dan tidak mengklaim bahwa pesan benar-benar terkirim. |
| Pengelola data | Memeriksa format nomor dan potensi pelanggan ganda, menjaga konsistensi laporan, serta hanya memakai data yang disetujui untuk tujuan yang dinyatakan. |

Peran akun aplikasi (`OWNER`, `MANAGER`, `CASHIER`, `STOCK_STAFF`, `MARKETING`) membatasi akses sesuai fungsi. Manajer/staf tetap harus memakai akun dan cabang yang ditugaskan; akses aplikasi tidak menggantikan persetujuan Steering Committee.

OWNER dapat meninjau halaman Jejak Audit dalam mode baca-saja untuk aktivitas staf, perubahan consent, void, template, dan scheduler manual. Ringkasan audit tidak boleh memuat password, token sesi, kode OTP, atau isi pesan.

## 2. SOP harian

### Kasir: pelanggan, consent, transaksi, stamp

- [ ] Cari nomor WhatsApp sebelum mendaftarkan pelanggan baru; jangan membuat akun baru hanya karena nama berbeda ejaan.
- [ ] Saat pendaftaran, catat persetujuan pesan hanya jika pelanggan menyatakannya. Jangan centang atas nama pelanggan. Penolakan tidak menghalangi transaksi atau stamp.
- [ ] Verifikasi nominal transaksi sebelum menyimpan. Prototype memberi stamp jika nominal memenuhi minimum Rp100.000, maksimal satu stamp per pelanggan per hari.
- [ ] Tawarkan penukaran saat pelanggan memiliki tiga stamp aktif: diskon 10% diterapkan pada transaksi jika dipilih. Pastikan pelanggan memahami nominal diskon dan total akhir.
- [ ] Jika pelanggan bertanya tentang pesan, jelaskan bahwa di prototype notifikasi hanya simulasi lokal; tidak ada WhatsApp yang terkirim.
- [ ] Laporkan duplikasi, transaksi salah, atau stamp yang tidak sesuai kepada manajer; kasir tidak mengubah atau menghapus transaksi.
- [ ] OWNER/MANAGER dapat membatalkan transaksi yang salah pada hari kalender yang sama (Asia/Jakarta) dengan alasan wajib. Transaksi asli tetap ada; transaksi pengganti dicatat terpisah. Jika stamp hasil transaksi sudah ditukar atau riwayat penukaran lama tidak dapat dipastikan, pembatalan ditolak dan harus dieskalasikan ke Sponsor.

### Staf stok: katalog dan konfirmasi harian

- [ ] Cocokkan rak/barang dengan katalog pada awal atau akhir shift sesuai jadwal cabang.
- [ ] Catat perubahan aktual (barang baru, edit data, atau status terjual) di cabang yang benar. Perubahan katalog dan konfirmasi stok adalah dua aktivitas berbeda.
- [ ] Setelah pemeriksaan, catat jumlah fisik. Sistem menyimpan jumlah fisik dan jumlah barang `AVAILABLE`; selisih tetap tercatat dan harus diperiksa. Konfirmasi tanpa perubahan katalog tetap dihitung S4 bila jumlah fisik diisi.
- [ ] Laporkan barang hilang, selisih jumlah, atau katalog yang tidak dapat diperbarui kepada manajer; jangan biarkan barang yang sudah terjual tampak tersedia.
- [ ] Manajer memeriksa log perubahan dan konfirmasi setiap hari kerja. Catat alasan bila cabang tidak melakukan perubahan katalog pada hari tertentu.

### Wishlist dan reminder: simulasi aman

- [ ] Periksa bahwa persetujuan pesan masih aktif dan pelanggan belum opt-out sebelum meninjau calon penerima.
- [ ] Periksa ketersediaan serta cabang barang yang cocok sebelum menindaklanjuti wishlist. Kecocokan di katalog bukan jaminan stok fisik.
- [ ] Sistem menerapkan satu catatan simulasi per pelanggan dalam cooldown gabungan tujuh hari untuk reminder dan notifikasi wishlist. Jangan membuat catatan/pesan manual untuk mengakali cooldown.
- [ ] Jalankan hanya template aktif yang sudah ditinjau dan sudah jatuh tempo. Reminder personal dijadwalkan pukul 09.00 Asia/Jakarta pada hari lead time. Tinjau jumlah penerima dan contoh isi sebelum demo.
- [ ] Catat hasil sebagai **simulasi**. Status pada aplikasi bukan bukti delivery, pembacaan, atau konversi akibat pesan.
- [ ] Gunakan antrean `/pesan?tab=antrean` untuk tindak lanjut; pelanggan yang baru ditandai dihubungi disembunyikan tujuh hari.
- [ ] Hentikan tindak lanjut pesan saat pelanggan mencabut persetujuan; laporkan permintaan dan masalah consent kepada manajer/marketing.

## 3. Pelatihan dan adopsi perubahan

- [ ] Project Manager menyampaikan alasan perubahan, istilah CRM dasar, visi, manfaat lintas cabang, serta batas prototype kepada seluruh tim.
- [ ] Berikan workshop singkat berbasis peran: kasir mempraktikkan pencarian, consent, transaksi, dan stamp; staf stok berlatih perubahan katalog vs konfirmasi; marketing berlatih template/jadwal simulasi; manajer berlatih membaca laporan dan eskalasi.
- [ ] Setiap staf menyelesaikan skenario uji dengan data sintetis dan menunjukkan bahwa ia memahami langkah opt-out, koreksi, dan pelaporan kendala.
- [ ] Manajer mencatat peserta, tanggal, skenario yang gagal, serta pendampingan ulang. Jangan memasukkan data nyata ke latihan.
- [ ] Bahas kendala dan usulan perbaikan dalam evaluasi bulanan; perubahan SOP harus memiliki pemilik, tanggal berlaku, dan pemberitahuan ke seluruh cabang.

### Urutan perubahan (Kotter)

1. Tunjukkan urgensi dengan contoh stok tidak terpantau dan stamp yang belum lintas cabang; gunakan data sintetis saat demo.
2. Bentuk tim pemandu dari Steering Committee dan Project Team.
3. Sepakati visi, ruang lingkup pilot, serta target yang dapat diukur.
4. Ulangi visi dan perubahan SOP lewat briefing cabang dan panduan singkat.
5. Hilangkan hambatan lewat latihan peran, akses yang tepat, formulir sederhana, dan jalur eskalasi.
6. Tunjukkan quick win: alur stamp digital di cabang pilot dan satu tampilan data demo yang terpusat.
7. Jaga momentum lewat tinjauan log mingguan dan rapat evaluasi bulanan.
8. Setelah disetujui, masukkan SOP dan pelatihan CRM ke onboarding serta aturan kerja tetap.

### Buy-in matrix

| Kelompok | Tanda yang diamati | Tindakan |
| --- | --- | --- |
| Champions | Manajer/kasir senior aktif mencoba alur dan membantu rekan | Libatkan sebagai demonstrator dan kumpulkan praktik baik; jangan memberi akses di luar peran. |
| Bystanders | Netral, menunggu arahan, atau belum percaya diri | Beri panduan satu halaman, latihan berpasangan, dan tindak lanjut setelah shift. |
| Loose Cannons | Menolak perubahan atau mendorong kembali ke catatan manual | Dengarkan hambatan, uji solusi bersama, jelaskan alasan kontrol; eskalasi risiko yang berulang tanpa menyalahkan individu. |
| Weak Links | Pembaruan stok/consent/log sering terlewat | Tetapkan pengingat dan pemeriksaan harian oleh manajer; sederhanakan langkah dan lakukan pendampingan. |

## 4. Risiko dan respons

| Risiko / indikator | Mitigasi dan pemilik |
| --- | --- |
| Stok tidak diperbarui atau stok fisik berbeda dari katalog | Staf stok mengikuti jadwal dan log; manajer meninjau setiap hari serta menahan tindak lanjut wishlist sampai ketersediaan diperiksa. |
| Kasir melewatkan pencarian pelanggan atau tawaran stamp | Latihan singkat, panduan di meja kasir, sampling transaksi oleh manajer, dan umpan balik non-punitif. |
| Data pelanggan ganda | Cari nomor sebelum daftar, validasi format, dan tinjau kandidat duplikat bulanan; pengelola data mencatat hasil koreksi. |
| Pesan dianggap spam atau consent tidak jelas | Consent eksplisit dan opt-out; batas gabungan satu pesan per tujuh hari; marketing memeriksa template dan hanya menggunakan data yang berizin. Prototype tidak mengirim pesan nyata. |
| Staf kembali ke pencatatan silo/manual | Manajer mengumpulkan penyebab, lakukan pendampingan, dan putuskan proses transisi; jangan menghapus catatan sumber sebelum rekonsiliasi disetujui. |
| Akses tidak sesuai atau data nyata masuk ke prototype | Owner/PM menghentikan penggunaan data tersebut, membatasi akun, mencatat insiden, dan melakukan tinjauan keamanan sebelum penggunaan lanjutan. Jangan menganggap login prototype sebagai persetujuan produksi. |
| Hasil simulasi dipresentasikan sebagai delivery nyata | Marketing memberi label simulasi di demo/laporan dan menyatakan keterbatasan; Steering Committee menolak klaim yang tidak didukung bukti. |

## 5. Evaluasi bulanan

Project Manager menyiapkan ringkasan dan Steering Committee meninjau:

- [ ] Progres sprint/rollout, anggaran terhadap persetujuan, isu terbuka, keputusan, dan penanggung jawab/tenggat setiap tindakan.
- [ ] Log perubahan katalog dan konfirmasi harian per cabang; konfirmasi saja tidak dihitung sebagai update aktual.
- [ ] Transaksi, stamp, penukaran QA, pelanggan baru, indikasi duplikasi, consent/opt-out, serta insiden akses/data.
- [ ] Reminder dan notifikasi wishlist sebagai **catatan simulasi**, termasuk jumlah, jadwal, cooldown, dan kendala; bukan bukti pengiriman WhatsApp.
- [ ] Jejak audit tindakan staf dan perubahan consent; selidiki aktivitas yang tidak dikenal dan eskalasi sesuai prosedur insiden.
- [ ] Keikutsertaan pelatihan, kelompok buy-in yang membutuhkan dukungan, serta umpan balik staf/pelanggan.
- [ ] Status risiko, efektivitas mitigasi, pemilik tindak lanjut, dan apakah rollout dilanjutkan, ditahan, atau dihentikan.

### KPI dan scheduler

- **S2:** persentase cabang yang memiliki uji tukar stamp dan hasil uji terakhir/lulus; bila ada cabang belum diuji, nilai KPI 0 dan nama cabang ditampilkan.
- **S4:** pasangan cabang-hari dalam tujuh hari yang memiliki log perubahan katalog atau konfirmasi dengan jumlah fisik terisi, dibagi seluruh pasangan cabang-hari.
- **S6:** simulasi reminder yang tercatat dalam ±60 menit dari jadwal dibagi simulasi yang memiliki jadwal. Semua pesan tetap simulasi.
- Scheduler lokal opsional hanya berjalan dengan `ENABLE_LOCAL_SCHEDULER=true`, setiap 15 menit; default nonaktif. `ROLLOUT_GATING=off` hanya untuk demo dan melewati gerbang fitur per cabang.
- Minimum transaksi stamp adalah Rp100.000. Fitur wishlist/notifikasi aktif mulai tahap 2; reminder aktif setelah cabang dengan tahap tertinggi mencapai tahap 3.

Simpan keputusan rapat, metrik yang digunakan, definisi/periode pengukuran, dan tindakan tindak lanjut. Tinjau business case setelah enam bulan memakai baseline enam bulan sebelum rollout; data seed bukan baseline operasional.

## 6. Gerbang uji dan pilot

### Status persiapan pilot

| Keputusan | Status |
| --- | --- |
| Cabang pilihan | Yogyakarta dan Magelang (untuk menguji alur lintas cabang; persetujuan Sponsor masih diperlukan) |
| Project Manager / koordinator | Belum ditunjuk; nama tidak dibuat-buat |
| Tim cabang (manajer, kasir, stok, marketing/pengelola data) | Belum ditunjuk; nama tidak dibuat-buat |
| Tanggal dan periode evaluasi | Belum ditetapkan |
| Data pilot | Data sintetis saja |
| Keputusan go/no-go | Belum dilakukan |

### Sebelum pilot

- [ ] Sponsor mengesahkan Yogyakarta dan Magelang sebagai cabang pilot dan menunjuk Project Manager, perwakilan tim, jadwal, anggaran, pemilik data, serta periode evaluasi.
- [ ] Pastikan lingkungan, akun staf, cabang, serta data uji sintetis siap; tidak ada data pelanggan nyata.
- [ ] Latih staf yang bertugas dan catat hasil latihan. Pastikan mereka dapat membedakan perubahan katalog, konfirmasi stok, persetujuan pesan, dan simulasi pesan.
- [ ] QA alur transaksi (minimum stamp Rp100.000), batas satu stamp per hari, penukaran tiga stamp, akses lintas cabang yang diizinkan, opt-out, cooldown, wishlist, dan reminder jatuh tempo.
- [ ] Di pilot, uji pelanggan yang mengumpulkan stamp di satu cabang dan menukarnya di cabang pilot lainnya; uji pula katalog bersama, kecocokan wishlist, dan perbedaan log perubahan vs konfirmasi stok. Target QA penukaran adalah 100% percobaan uji berhasil.
- [ ] Sebelum rollout penuh, QA konfigurasi keempat cabang dengan data sintetis; catat setiap kegagalan dan retest setelah perbaikan.
- [ ] Pastikan kontrol akses, backup/pemulihan lokal, dan prosedur insiden telah ditinjau. Endpoint scheduler, bila dipakai, harus memakai `REMINDER_CRON_SECRET`; jangan mengekspos tanpa kontrol tersebut.
- [ ] Steering Committee menandatangani keputusan go/no-go dan mencatat risiko yang masih diterima.

### Selama dan sesudah pilot

- [ ] Manajer memeriksa log stok harian; Project Team mencatat insiden, pertanyaan pelanggan, kendala kasir, dan waktu penyelesaian.
- [ ] Hentikan sementara alur terkait bila terjadi akses lintas peran/cabang yang tidak semestinya, kehilangan/korupsi data, consent terlewati, atau katalog menampilkan ketersediaan yang menyesatkan. Eskalasi ke Sponsor/PM.
- [ ] Tinjau hasil pada akhir periode pilot yang telah disetujui; bandingkan dengan baseline terukur, bukan seed.
- [ ] Gunakan target Fase 5 sebagai sasaran bisnis: duplikasi <2%, repeat purchase +25% dalam enam bulan, ≥90% hari-cabang update stok aktual, stok mati turun 20%, reminder tepat jadwal ≥95%, frekuensi belanja +15%, dan konversi setelah reminder ≥20% dalam tujuh hari. Angka reminder/konversi pada prototype tetap indikator simulasi, bukan bukti hasil delivery.
- [ ] Sponsor dan Steering Committee memutuskan lanjut, perbaiki dan uji ulang, atau hentikan. Sebelum data nyata/WhatsApp nyata digunakan, wajib ada tinjauan keamanan, privasi, operasional, kesiapan provider, dan persetujuan anggaran terpisah.

Lakukan review log stok dan simulasi reminder secara mingguan, lalu bawa tren, penyimpangan, dan tindak lanjutnya ke rapat bulanan.
