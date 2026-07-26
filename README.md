# 🧩 AI Studio Hub

Satu aplikasi web yang menggabungkan beberapa AI (Claude, ChatGPT, Gemini, Grok) dan alur pembuatan konten video dalam **satu antarmuka**. Terinspirasi dari kebiasaan bikin gambar + prompt di ChatGPT, lalu video di Flow/Grok — semuanya jadi satu tempat.

> **Penting (jujur):** Aplikasi ini **tidak menyalin** model Gemini/Grok/GPT/Claude. Ia adalah **hub** yang menyambung ke tiap AI lewat **API resmi masing-masing**. Setiap provider butuh **API key sendiri** dan umumnya berbayar per pemakaian. Tanpa key, semua fitur tetap bisa dicoba dalam **mode demo**.

## ✨ Empat fitur dalam satu

| Tab | Fungsi | Butuh key |
|-----|--------|-----------|
| 💬 **Chat** | Ngobrol dengan Claude / ChatGPT / Gemini / Grok, ganti-ganti dari satu tempat | opsional (demo tanpa key) |
| 📝 **Prompt** | Bikin prompt **text-to-image** + **image-to-video** otomatis dari satu ide | opsional |
| 🖼️ **Gambar** | Generate gambar dari teks | OpenAI (demo tanpa key) |
| 🎬 **Video** | Dari topik → rencana video → render & unduh `.webm`; bisa pakai gambar hasil Studio Gambar sebagai latar | jalan penuh tanpa key |

Alur kerjamu (gambar + prompt di ChatGPT → video di Flow/Grok) kini jadi tombol: **Prompt → Gambar → Jadikan latar video → Rekam**.

## 🚀 Menjalankan

```bash
npm install
cp .env.example .env    # isi key yang kamu punya (boleh kosong = demo)
npm start               # http://localhost:3000
```

## 🔑 Menyambung AI sungguhan

Isi key di `.env` sesuai yang kamu miliki — tidak harus semua:

| Provider | Dapatkan key di | Untuk |
|----------|-----------------|-------|
| Anthropic (Claude) | console.anthropic.com | chat, rencana video |
| OpenAI (ChatGPT) | platform.openai.com | chat, generate gambar |
| Google Gemini | aistudio.google.com | chat |
| xAI (Grok) | console.x.ai | chat |

Provider yang key-nya diisi otomatis "nyala" (badge ✓ di dropdown chat); sisanya tetap mode demo.

## 🧱 Arsitektur

- **Backend** (`server.js`): Express + adapter per provider.
  - `POST /api/chat` — rute ke provider terpilih (Anthropic SDK / OpenAI / xAI / Gemini via fetch), fallback demo.
  - `POST /api/prompt` — susun prompt gambar & image-to-video (pakai AI jika ada key, atau template demo).
  - `POST /api/image` — text-to-image (OpenAI; demo = placeholder SVG).
  - `POST /api/generate` — rencana video terstruktur via Claude (JSON Schema) + fallback demo.
  - `GET /api/providers` — status konfigurasi tiap provider.
- **Frontend** (`public/`): 4 tab; video dirender ke `<canvas>` dan direkam via MediaRecorder + WebAudio (musik latar), voiceover pakai TTS browser.

## 📝 Batasan & langkah berikutnya

- **Studio video AI sungguhan (image-to-video seperti Veo/Runway/Sora)** belum tersambung — API-nya berbayar, sebagian perlu approval. Placeholder-nya sudah disiapkan; tinggal tambah adapter saat kamu punya aksesnya.
- Voiceover TTS berbunyi saat preview; file video berisi visual + subtitle + musik latar.
- Semua rendering video terjadi di sisi klien (hemat server, jaga privasi).
