# 🎬 AI Video Generator

Web app untuk membuat **konten video menggunakan AI**. Masukkan sebuah topik, dan AI (Claude) menyusun rencana video lengkap — judul, hook, scene per scene (narasi + teks layar + warna latar), caption, dan hashtag. Aplikasi lalu **merender video langsung di browser** dan bisa **diunduh sebagai file `.webm`** — tanpa perlu API video berbayar.

## ✨ Fitur

- **Otak AI (Claude)** menyusun rencana video terstruktur dari satu topik.
- **Preview dengan voiceover** memakai suara bawaan browser (Text-to-Speech gratis).
- **Rekam & unduh video** — Canvas + MediaRecorder membuat file video di perangkatmu.
- **Musik latar** sederhana dibuat via WebAudio dan ikut terekam ke video.
- **Caption + hashtag siap posting**, tinggal salin.
- **Mendukung format** TikTok/Reels/Shorts (potret) dan YouTube (landscape).
- **Mode demo** — jalan penuh tanpa API key (memakai contoh rencana).

## 🚀 Cara menjalankan

```bash
npm install
cp .env.example .env   # opsional: isi ANTHROPIC_API_KEY untuk AI sungguhan
npm start
```

Buka http://localhost:3000

> Tanpa `ANTHROPIC_API_KEY`, aplikasi berjalan dalam **mode demo** dengan rencana contoh, jadi semua fitur (preview & unduh video) tetap bisa dicoba.

## 🔑 Mengaktifkan AI

1. Dapatkan API key dari https://console.anthropic.com
2. Salin `.env.example` menjadi `.env`, isi `ANTHROPIC_API_KEY`.
3. Jalankan ulang `npm start`. Badge di kanan atas akan menampilkan "AI aktif".

## 🧱 Arsitektur

- **Backend** (`server.js`): Express + Anthropic SDK. Endpoint `POST /api/generate` meminta Claude membuat JSON terstruktur (dipaksa lewat JSON Schema). Ada fallback demo jika AI gagal / tanpa key.
- **Frontend** (`public/`): merender tiap scene ke `<canvas>`, memutar TTS untuk voiceover, dan merekam kanvas (+musik) jadi video.

## 📝 Catatan teknis

- Voiceover TTS berbunyi saat **preview**. Karena browser tidak mengekspos audio TTS ke rekaman, **file video yang diunduh berisi visual + subtitle + musik latar** (bukan suara TTS). Ini keputusan sadar agar aplikasi bebas dari layanan berbayar.
- Format keluaran `.webm` (VP9/VP8). Bisa dikonversi ke `.mp4` dengan tools seperti ffmpeg bila perlu.
- Rendering & perekaman terjadi **sepenuhnya di sisi klien** — hemat biaya server dan menjaga privasi.

## 🛣️ Pengembangan lanjutan (ide)

- Sambungkan API text-to-video / TTS berkualitas (mis. untuk voiceover di dalam file).
- Ekspor `.mp4` langsung di server via ffmpeg.
- Upload gambar/footage sendiri sebagai latar scene.
- Simpan riwayat rencana video.
