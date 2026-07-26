import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---- Konfigurasi provider ----
// Tiap provider hanya "aktif" bila key-nya ada. Tanpa key = mode demo.
const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || "",
  openai: process.env.OPENAI_API_KEY || "",
  gemini: process.env.GEMINI_API_KEY || "",
  xai: process.env.XAI_API_KEY || "",
};

const MODELS = {
  anthropic: process.env.ANTHROPIC_MODEL || "claude-opus-5",
  openai: process.env.OPENAI_MODEL || "gpt-4o",
  gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  xai: process.env.XAI_MODEL || "grok-4",
};

const PROVIDER_LABELS = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  xai: "Grok",
};

const anthropic = KEYS.anthropic ? new Anthropic() : null;

// ============================================================
//  ADAPTER CHAT PER PROVIDER
//  Semua mengembalikan { text }. Bila tanpa key → demo.
// ============================================================

async function chatAnthropic(messages) {
  const res = await anthropic.messages.create({
    model: MODELS.anthropic,
    max_tokens: 2000,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  if (res.stop_reason === "refusal") throw new Error("Permintaan ditolak sistem keamanan AI.");
  return res.content.find((b) => b.type === "text")?.text || "";
}

// OpenAI & xAI (Grok) memakai format chat-completions yang sama.
async function chatOpenAICompatible({ base, key, model, messages }) {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: 2000 }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content || "";
}

async function chatGemini(messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${KEYS.gemini}`;
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
}

function demoChat(provider, messages) {
  const last = messages[messages.length - 1]?.content || "";
  const label = PROVIDER_LABELS[provider] || provider;
  return (
    `【Mode demo · ${label}】\n\n` +
    `Ini balasan contoh karena API key ${label} belum dipasang. ` +
    `Setelah kamu isi key-nya di file .env, jawaban asli dari ${label} akan muncul di sini.\n\n` +
    `Pesanmu tadi: "${last.slice(0, 160)}"${last.length > 160 ? "…" : ""}\n\n` +
    `Contoh poin yang biasanya diberikan AI:\n` +
    `• Ringkasan singkat topik\n• Langkah praktis 1–3\n• Saran lanjutan`
  );
}

async function runChat(provider, messages) {
  try {
    if (provider === "anthropic" && anthropic) return { text: await chatAnthropic(messages), demo: false };
    if (provider === "openai" && KEYS.openai)
      return { text: await chatOpenAICompatible({ base: "https://api.openai.com/v1", key: KEYS.openai, model: MODELS.openai, messages }), demo: false };
    if (provider === "xai" && KEYS.xai)
      return { text: await chatOpenAICompatible({ base: "https://api.x.ai/v1", key: KEYS.xai, model: MODELS.xai, messages }), demo: false };
    if (provider === "gemini" && KEYS.gemini) return { text: await chatGemini(messages), demo: false };
  } catch (err) {
    return { text: `⚠️ Gagal memanggil ${PROVIDER_LABELS[provider]}: ${err.message}\n\n` + demoChat(provider, messages), demo: true, error: true };
  }
  return { text: demoChat(provider, messages), demo: true };
}

// ============================================================
//  STUDIO GAMBAR (text-to-image)
// ============================================================

async function imageOpenAI(prompt) {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEYS.openai}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024" }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const b64 = data.data?.[0]?.b64_json;
  return `data:image/png;base64,${b64}`;
}

// Placeholder gambar (SVG) untuk mode demo — hasil nyata & bisa dipakai jadi latar scene video.
function demoImage(prompt) {
  const palettes = [
    ["#0f172a", "#6366f1"], ["#3b0764", "#ec4899"], ["#0c4a6e", "#22d3ee"],
    ["#7c2d12", "#f59e0b"], ["#052e16", "#22c55e"],
  ];
  const [a, b] = palettes[Math.abs(hashStr(prompt)) % palettes.length];
  const words = prompt.split(/\s+/).slice(0, 10).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient></defs>
    <rect width="1024" height="1024" fill="url(#g)"/>
    <circle cx="820" cy="220" r="120" fill="rgba(255,255,255,0.12)"/>
    <circle cx="220" cy="820" r="180" fill="rgba(255,255,255,0.08)"/>
    <text x="512" y="480" fill="rgba(255,255,255,0.55)" font-family="system-ui" font-size="34" text-anchor="middle">GAMBAR DEMO</text>
    <text x="512" y="540" fill="#ffffff" font-family="system-ui" font-size="46" font-weight="700" text-anchor="middle">${escapeXml(words)}</text>
  </svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

async function runImage(prompt, provider = "openai") {
  try {
    if (provider === "openai" && KEYS.openai) return { url: await imageOpenAI(prompt), demo: false };
  } catch (err) {
    return { url: demoImage(prompt), demo: true, error: true, message: err.message };
  }
  return { url: demoImage(prompt), demo: true };
}

// ============================================================
//  GENERATOR PROMPT (image + image-to-video)
// ============================================================

function demoPrompts(idea) {
  const subject = idea.trim() || "objek utama";
  return {
    imagePrompt:
      `${subject}, sinematik, pencahayaan dramatis, detail tajam, komposisi rule-of-thirds, ` +
      `warna kaya, latar bokeh, kualitas 8k, gaya fotografi profesional`,
    videoPrompt:
      `Animasikan gambar ini: gerakan kamera slow push-in halus ke arah ${subject}, ` +
      `parallax lembut pada latar, partikel/cahaya bergerak pelan, durasi 5 detik, ` +
      `transisi mulus, mood sinematik`,
    negativePrompt: "blur, distorsi, teks aneh, jari berlebih, watermark, low quality",
  };
}

// ============================================================
//  RENCANA VIDEO (fitur asli — dari topik jadi scene)
// ============================================================

const VIDEO_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    title: { type: "string" }, hook: { type: "string" }, platform: { type: "string" },
    caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" } },
    musicMood: { type: "string", enum: ["upbeat", "calm", "epic", "chill"] },
    scenes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          onScreenText: { type: "string" }, narration: { type: "string" },
          durationSeconds: { type: "number" },
          backgroundColors: { type: "array", items: { type: "string" } },
        },
        required: ["onScreenText", "narration", "durationSeconds", "backgroundColors"],
      },
    },
  },
  required: ["title", "hook", "platform", "caption", "hashtags", "musicMood", "scenes"],
};

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
      { onScreenText: `${t}?`, narration: `Hari ini kita bahas soal ${t} dengan cara yang gampang dipahami.`, durationSeconds: 4, backgroundColors: ["#0f172a", "#1e3a8a"] },
      { onScreenText: "Kenapa penting?", narration: `${t} penting karena bisa menghemat waktu dan bikin hasil kerjamu lebih rapi.`, durationSeconds: 5, backgroundColors: ["#3b0764", "#7c3aed"] },
      { onScreenText: "Langkah praktis", narration: `Mulai dari hal kecil, konsisten setiap hari, lalu evaluasi hasilnya tiap minggu.`, durationSeconds: 5, backgroundColors: ["#0c4a6e", "#0891b2"] },
      { onScreenText: "Follow untuk tips lain!", narration: `Kalau ini berguna, follow dan simpan videonya. Sampai jumpa di konten berikutnya!`, durationSeconds: 4, backgroundColors: ["#7c2d12", "#ea580c"] },
    ],
    _demo: true,
  };
}

// ============================================================
//  ROUTES
// ============================================================

app.get("/api/providers", (_req, res) => {
  const chat = Object.keys(PROVIDER_LABELS).map((id) => ({
    id, label: PROVIDER_LABELS[id], model: MODELS[id], configured: Boolean(KEYS[id]),
  }));
  res.json({
    chat,
    image: { configured: Boolean(KEYS.openai) },
    video: { configured: false }, // API image-to-video (Veo/Runway) belum disambung
    anyConfigured: Object.values(KEYS).some(Boolean),
  });
});

app.post("/api/chat", async (req, res) => {
  const { provider = "anthropic", messages = [] } = req.body || {};
  if (!messages.length) return res.status(400).json({ error: "messages kosong." });
  const out = await runChat(provider, messages);
  res.json(out);
});

app.post("/api/prompt", async (req, res) => {
  const { idea = "" } = req.body || {};
  if (!idea.trim()) return res.status(400).json({ error: "Ide/deskripsi kosong." });

  // Bila ada provider chat aktif, minta AI menyusun prompt yang lebih matang.
  const activeChat = Object.keys(PROVIDER_LABELS).find((id) => KEYS[id]);
  if (activeChat) {
    const instruction =
      `Buat 3 hal untuk membuat video dari ide "${idea}". Jawab HANYA JSON dengan kunci: ` +
      `imagePrompt (prompt bahasa Inggris untuk text-to-image, sangat detail), ` +
      `videoPrompt (prompt image-to-video, jelaskan gerakan kamera & animasi), ` +
      `negativePrompt (hal yang dihindari). Tanpa penjelasan lain.`;
    const out = await runChat(activeChat, [{ role: "user", content: instruction }]);
    try {
      const json = JSON.parse(out.text.replace(/```json|```/g, "").trim());
      return res.json({ prompts: json, demo: false, provider: activeChat });
    } catch {
      // Kalau parsing gagal, pakai demo.
    }
  }
  res.json({ prompts: demoPrompts(idea), demo: true });
});

app.post("/api/image", async (req, res) => {
  const { prompt = "", provider = "openai" } = req.body || {};
  if (!prompt.trim()) return res.status(400).json({ error: "Prompt gambar kosong." });
  const out = await runImage(prompt, provider);
  res.json(out);
});

app.post("/api/generate", async (req, res) => {
  const { topic = "", platform = "TikTok / Reels", language = "Indonesia", tone = "santai & informatif", sceneCount = 4 } = req.body || {};
  if (!topic.trim()) return res.status(400).json({ error: "Topik tidak boleh kosong." });

  if (!anthropic) return res.json({ plan: demoPlan({ topic, platform, language }) });

  try {
    const prompt =
      `Kamu content strategist video pendek. Buat rencana video untuk topik "${topic}". ` +
      `Platform: ${platform}. Bahasa: ${language}. Tone: ${tone}. Jumlah scene: ${Math.min(Math.max(Number(sceneCount) || 4, 2), 8)}. ` +
      `hook = 1 baris penghenti scroll. Tiap scene: onScreenText singkat, narration 1-2 kalimat, durationSeconds 3-6, backgroundColors 2 warna hex kontras. ` +
      `Sertakan caption siap posting + 5-8 hashtags.`;
    const response = await anthropic.messages.create({
      model: MODELS.anthropic, max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: VIDEO_SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal")
      return res.status(422).json({ error: "Permintaan ditolak sistem keamanan AI." });
    res.json({ plan: JSON.parse(response.content.find((b) => b.type === "text").text) });
  } catch (err) {
    res.json({ plan: demoPlan({ topic, platform, language }), warning: "AI bermasalah, memakai contoh. " + (err?.message || "") });
  }
});

// ---- util ----
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function escapeXml(s) { return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])); }

app.listen(PORT, () => {
  const active = Object.entries(KEYS).filter(([, v]) => v).map(([k]) => PROVIDER_LABELS[k]);
  console.log(`AI Studio Hub jalan di http://localhost:${PORT}`);
  console.log(active.length ? `Provider aktif: ${active.join(", ")}` : "Semua provider mode demo (isi key di .env untuk aktifkan)");
});
