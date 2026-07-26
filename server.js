import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey ? new Anthropic() : null;

// Skema JSON yang wajib diikuti Claude — supaya frontend bisa merender dengan andal.
const VIDEO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    hook: { type: "string" },
    platform: { type: "string" },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    musicMood: { type: "string", enum: ["upbeat", "calm", "epic", "chill"] },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          onScreenText: { type: "string" },
          narration: { type: "string" },
          durationSeconds: { type: "number" },
          backgroundColors: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["onScreenText", "narration", "durationSeconds", "backgroundColors"],
      },
    },
  },
  required: ["title", "hook", "platform", "caption", "hashtags", "musicMood", "scenes"],
};

function buildPrompt({ topic, platform, language, tone, sceneCount }) {
  return `Kamu adalah content strategist video pendek yang ahli.
Buat rencana video lengkap untuk topik berikut.

Topik: ${topic}
Platform: ${platform}
Bahasa output (judul, narasi, teks layar, caption): ${language}
Gaya/tone: ${tone}
Jumlah scene: ${sceneCount}

Aturan:
- "hook" harus kalimat pembuka 1 baris yang bikin penonton berhenti scroll.
- Setiap scene: "onScreenText" singkat & tebal (maks ~8 kata), "narration" 1-2 kalimat untuk voiceover, "durationSeconds" antara 3 sampai 6.
- "backgroundColors" tiap scene = tepat 2 warna hex (contoh "#0f172a") untuk gradien latar yang kontras dengan teks putih.
- "caption" siap posting + "hashtags" 5-8 buah tanpa tanda pagar ganda.
- Total durasi wajar untuk video pendek (${platform}).`;
}

// Fallback demo saat belum ada ANTHROPIC_API_KEY — aplikasi tetap bisa dicoba.
function demoPlan({ topic, platform, language }) {
  const t = topic || "Ide konten AI";
  return {
    title: `${t} — dalam 30 detik`,
    hook: `Kamu belum tahu ini soal "${t}"?`,
    platform,
    caption: `Bahas singkat soal ${t}. Simpan & bagikan kalau bermanfaat! (Bahasa: ${language})`,
    hashtags: ["konten", "ai", "tips", "video", "fyp", "belajar"],
    musicMood: "upbeat",
    scenes: [
      {
        onScreenText: `${t}?`,
        narration: `Hari ini kita bahas soal ${t} dengan cara yang gampang dipahami.`,
        durationSeconds: 4,
        backgroundColors: ["#0f172a", "#1e3a8a"],
      },
      {
        onScreenText: "Kenapa penting?",
        narration: `${t} penting karena bisa menghemat waktu dan bikin hasil kerjamu lebih rapi.`,
        durationSeconds: 5,
        backgroundColors: ["#3b0764", "#7c3aed"],
      },
      {
        onScreenText: "Langkah praktis",
        narration: `Mulai dari hal kecil, konsisten setiap hari, lalu evaluasi hasilnya tiap minggu.`,
        durationSeconds: 5,
        backgroundColors: ["#0c4a6e", "#0891b2"],
      },
      {
        onScreenText: "Follow untuk tips lain!",
        narration: `Kalau ini berguna, follow dan simpan videonya. Sampai jumpa di konten berikutnya!`,
        durationSeconds: 4,
        backgroundColors: ["#7c2d12", "#ea580c"],
      },
    ],
    _demo: true,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, aiConfigured: hasKey });
});

app.post("/api/generate", async (req, res) => {
  const {
    topic = "",
    platform = "TikTok / Reels",
    language = "Indonesia",
    tone = "santai & informatif",
    sceneCount = 4,
  } = req.body || {};

  if (!topic.trim()) {
    return res.status(400).json({ error: "Topik tidak boleh kosong." });
  }

  if (!client) {
    return res.json({ plan: demoPlan({ topic, platform, language }) });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: VIDEO_SCHEMA } },
      messages: [
        {
          role: "user",
          content: buildPrompt({
            topic,
            platform,
            language,
            tone,
            sceneCount: Math.min(Math.max(Number(sceneCount) || 4, 2), 8),
          }),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return res
        .status(422)
        .json({ error: "Permintaan ditolak oleh sistem keamanan AI. Coba topik lain." });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const plan = JSON.parse(textBlock.text);
    res.json({ plan });
  } catch (err) {
    console.error("Generate error:", err?.message || err);
    // Jangan bikin user buntu — kasih rencana demo sebagai cadangan.
    res.json({
      plan: demoPlan({ topic, platform, language }),
      warning: "AI sedang bermasalah, menampilkan contoh rencana. Detail: " + (err?.message || "unknown"),
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI Video Generator jalan di http://localhost:${PORT}`);
  console.log(`Model: ${MODEL} | AI ${hasKey ? "aktif" : "mode demo (set ANTHROPIC_API_KEY untuk aktifkan)"}`);
});
