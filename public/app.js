// ---- Elemen ----
const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

let currentPlan = null;
let busy = false;

// ---- Status AI ----
fetch("/api/health")
  .then((r) => r.json())
  .then((h) => {
    const el = $("aiStatus");
    if (h.aiConfigured) {
      el.textContent = "AI aktif · " + h.model;
      el.className = "badge on";
    } else {
      el.textContent = "mode demo (tanpa API key)";
      el.className = "badge demo";
    }
  })
  .catch(() => {
    $("aiStatus").textContent = "server offline";
  });

// ---- Ukuran kanvas per platform ----
function sizeForPlatform(platform) {
  return /landscape/i.test(platform)
    ? { w: 1920, h: 1080 }
    : { w: 1080, h: 1920 };
}

// ---- Buat rencana ----
$("generateBtn").addEventListener("click", async () => {
  if (busy) return;
  const topic = $("topic").value.trim();
  if (!topic) {
    setMsg("Isi dulu topiknya ya.", "error");
    return;
  }
  busy = true;
  $("generateBtn").disabled = true;
  setMsg("AI sedang menyusun rencana video…");

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        platform: $("platform").value,
        language: $("language").value,
        tone: $("tone").value,
        sceneCount: $("sceneCount").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal membuat rencana.");

    currentPlan = data.plan;
    renderPlan(currentPlan);
    setMsg(
      data.warning
        ? "⚠️ " + data.warning
        : (currentPlan._demo ? "Rencana demo dibuat (tanpa API key)." : "Rencana video siap!"),
      data.warning ? "error" : "ok"
    );
  } catch (err) {
    setMsg(err.message, "error");
  } finally {
    busy = false;
    $("generateBtn").disabled = false;
  }
});

// ---- Tampilkan rencana + frame pertama ----
function renderPlan(plan) {
  const { w, h } = sizeForPlatform(plan.platform);
  canvas.width = w;
  canvas.height = h;
  canvas.style.display = "block";
  $("stageEmpty").style.display = "none";

  drawScene(plan.scenes[0], 1, "Scene 1");

  $("planMeta").classList.remove("hidden");
  $("planTitle").textContent = plan.title;
  $("planHook").textContent = "“" + plan.hook + "”";
  $("planCaption").textContent = plan.caption;
  $("planHashtags").innerHTML = "";
  (plan.hashtags || []).forEach((t) => {
    const s = document.createElement("span");
    s.textContent = "#" + t.replace(/^#/, "");
    $("planHashtags").appendChild(s);
  });

  $("previewBtn").disabled = false;
  $("recordBtn").disabled = false;
}

// ---- Gambar satu frame scene ----
function drawScene(scene, appear, label, subtitleShown = true) {
  const w = canvas.width;
  const h = canvas.height;
  const [c1, c2] = scene.backgroundColors?.length >= 2
    ? scene.backgroundColors
    : ["#0f172a", "#1e3a8a"];

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Sedikit vignette biar teks terbaca
  const vg = ctx.createRadialGradient(w / 2, h / 2, h / 4, w / 2, h / 2, h);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // Teks utama layar (animasi muncul)
  const eased = 1 - Math.pow(1 - Math.min(appear, 1), 3);
  ctx.save();
  ctx.globalAlpha = eased;
  ctx.translate(w / 2, h * 0.42 + (1 - eased) * 40);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 24;
  const mainSize = Math.round(w * 0.075);
  ctx.font = `800 ${mainSize}px system-ui, sans-serif`;
  wrapText(scene.onScreenText || "", 0, 0, w * 0.82, mainSize * 1.15);
  ctx.restore();

  // Subtitle narasi di bawah
  if (subtitleShown && scene.narration) {
    ctx.save();
    ctx.textAlign = "center";
    const subSize = Math.round(w * 0.032);
    ctx.font = `600 ${subSize}px system-ui, sans-serif`;
    const lines = measureWrap(scene.narration, w * 0.8, subSize);
    const boxH = lines.length * subSize * 1.3 + 32;
    const boxY = h - boxH - h * 0.08;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(w * 0.06, boxY, w * 0.88, boxH, 20);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    lines.forEach((ln, i) => {
      ctx.fillText(ln, w / 2, boxY + 24 + subSize + i * subSize * 1.3);
    });
    ctx.restore();
  }

  // Label kecil
  if (label) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.font = `600 ${Math.round(w * 0.026)}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(label, w * 0.06, h * 0.07);
    ctx.restore();
  }
}

// ---- Preview dengan suara ----
$("previewBtn").addEventListener("click", () => {
  if (!currentPlan || busy) return;
  runTimeline({ record: false });
});

// ---- Rekam & unduh ----
$("recordBtn").addEventListener("click", () => {
  if (!currentPlan || busy) return;
  runTimeline({ record: true });
});

// ---- Mesin timeline (preview / rekam) ----
async function runTimeline({ record }) {
  busy = true;
  setControls(false);
  try { window.speechSynthesis?.cancel(); } catch {}

  const scenes = currentPlan.scenes;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();
  const withMusic = record && !$("muteRecord").checked;

  let recorder, chunks = [];
  if (record) {
    const stream = canvas.captureStream(30);
    if (withMusic) {
      startMusic(audioCtx, dest, currentPlan.musicMood);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start();
    setRecordMsg("⏺️ Merekam video…");
  } else {
    setRecordMsg("");
  }

  const start = performance.now();
  let sceneIdx = -1;

  await new Promise((resolve) => {
    function frame(now) {
      const t = (now - start) / 1000;
      let acc = 0;
      let idx = 0;
      for (let i = 0; i < scenes.length; i++) {
        const d = clampDur(scenes[i].durationSeconds);
        if (t < acc + d) { idx = i; break; }
        acc += d;
        idx = i;
      }
      const total = scenes.reduce((s, x) => s + clampDur(x.durationSeconds), 0);
      if (t >= total) return resolve();

      const scene = scenes[idx];
      const sceneStart = scenes.slice(0, idx).reduce((s, x) => s + clampDur(x.durationSeconds), 0);
      const appear = (t - sceneStart) / 0.6;

      if (idx !== sceneIdx) {
        sceneIdx = idx;
        if (!record) speak(scene.narration, currentPlan.language);
      }
      drawScene(scene, appear, `Scene ${idx + 1}/${scenes.length}`);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  try { window.speechSynthesis?.cancel(); } catch {}

  if (record) {
    await new Promise((res) => {
      recorder.onstop = res;
      recorder.stop();
    });
    const blob = new Blob(chunks, { type: chunks[0]?.type || "video/webm" });
    downloadBlob(blob, `video-${slug(currentPlan.title)}.webm`);
    setRecordMsg("✅ Video selesai & terunduh (.webm).", "ok");
  }
  try { audioCtx.close(); } catch {}

  busy = false;
  setControls(true);
}

// ---- Musik latar sederhana (WebAudio) ----
function startMusic(audioCtx, dest, mood) {
  const base = { upbeat: 330, calm: 220, epic: 165, chill: 262 }[mood] || 262;
  const master = audioCtx.createGain();
  master.gain.value = 0.05;
  master.connect(dest);
  [0, 4, 7].forEach((semi, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = base * Math.pow(2, semi / 12);
    const g = audioCtx.createGain();
    g.gain.value = 0.5 / (i + 1);
    osc.connect(g).connect(master);
    osc.start();
  });
}

// ---- Voiceover (TTS browser) ----
function speak(text, language) {
  if (!("speechSynthesis" in window) || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /english/i.test(language) ? "en-US" : "id-ID";
  u.rate = 1.05;
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang?.startsWith(u.lang.slice(0, 2)));
  if (match) u.voice = match;
  window.speechSynthesis.speak(u);
}

// ---- Salin caption ----
$("copyCaption").addEventListener("click", async () => {
  if (!currentPlan) return;
  const tags = (currentPlan.hashtags || []).map((t) => "#" + t.replace(/^#/, "")).join(" ");
  const text = `${currentPlan.caption}\n\n${tags}`;
  try {
    await navigator.clipboard.writeText(text);
    setMsg("Caption tersalin!", "ok");
  } catch {
    setMsg("Gagal menyalin — salin manual ya.", "error");
  }
});

// ---- Util ----
function clampDur(d) { return Math.min(Math.max(Number(d) || 4, 2), 8); }

function wrapText(text, x, y, maxWidth, lineHeight) {
  const lines = measureWrap(text, maxWidth, parseInt(ctx.font));
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lineHeight));
}

function measureWrap(text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pickMime() {
  const opts = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return opts.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ai";
}

function setControls(enabled) {
  $("generateBtn").disabled = !enabled;
  $("previewBtn").disabled = !enabled;
  $("recordBtn").disabled = !enabled;
}

function setMsg(text, kind = "") {
  const el = $("msg");
  el.textContent = text;
  el.className = "msg " + kind;
}

function setRecordMsg(text, kind = "") {
  const el = $("recordMsg");
  el.textContent = text;
  el.className = "msg " + kind;
}
