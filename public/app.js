const $ = (id) => document.getElementById(id);

// ================= TAB SWITCHING =================
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    $("view-" + btn.dataset.tab).classList.add("active");
  });
});

// ================= PROVIDER STATUS =================
let providers = null;
fetch("/api/providers")
  .then((r) => r.json())
  .then((p) => {
    providers = p;
    const sel = $("chatProvider");
    sel.innerHTML = "";
    p.chat.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.label + (c.configured ? " ✓" : " (demo)");
      sel.appendChild(o);
    });
  })
  .catch(() => {});

// ================= CHAT =================
const chatHistory = [];
$("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;
  $("chatInput").value = "";
  addBubble("me", text);
  chatHistory.push({ role: "user", content: text });

  const typing = addBubble("ai typing", "mengetik…");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: $("chatProvider").value, messages: chatHistory }),
    });
    const data = await res.json();
    typing.remove();
    addBubble("ai", data.text || "(kosong)");
    chatHistory.push({ role: "assistant", content: data.text || "" });
  } catch (err) {
    typing.remove();
    addBubble("ai", "⚠️ Error: " + err.message);
  }
});

function addBubble(cls, text) {
  const div = document.createElement("div");
  div.className = "bubble " + cls;
  div.textContent = text;
  $("chatThread").appendChild(div);
  $("chatThread").scrollTop = $("chatThread").scrollHeight;
  return div;
}

// ================= PROMPT GENERATOR =================
let lastPrompts = null;
$("promptBtn").addEventListener("click", async () => {
  const idea = $("promptIdea").value.trim();
  if (!idea) return;
  $("promptBtn").disabled = true;
  $("promptBtn").textContent = "Membuat…";
  try {
    const res = await fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea }),
    });
    const data = await res.json();
    lastPrompts = data.prompts;
    $("pImage").textContent = data.prompts.imagePrompt || "";
    $("pVideo").textContent = data.prompts.videoPrompt || "";
    $("pNeg").textContent = data.prompts.negativePrompt || "";
    $("promptOut").classList.remove("hidden");
  } catch (err) {
    alert("Gagal: " + err.message);
  } finally {
    $("promptBtn").disabled = false;
    $("promptBtn").textContent = "✨ Buatkan prompt";
  }
});

document.querySelectorAll(".copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const txt = $(btn.dataset.target).textContent;
    try {
      await navigator.clipboard.writeText(txt);
      const old = btn.textContent;
      btn.textContent = "✓ Tersalin";
      setTimeout(() => (btn.textContent = old), 1200);
    } catch {}
  });
});

$("sendToImage").addEventListener("click", () => {
  if (!lastPrompts) return;
  $("imgPrompt").value = lastPrompts.imagePrompt || "";
  document.querySelector('.tab[data-tab="image"]').click();
});

// ================= STUDIO GAMBAR =================
let lastImageUrl = null;
$("imgBtn").addEventListener("click", async () => {
  const prompt = $("imgPrompt").value.trim();
  if (!prompt) return;
  $("imgBtn").disabled = true;
  setImgMsg("Membuat gambar…");
  try {
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    lastImageUrl = data.url;
    const img = $("imgResult");
    img.src = data.url;
    img.style.display = "block";
    $("imgEmpty").style.display = "none";
    $("imgActions").style.display = "flex";
    $("imgDownload").href = data.url;
    setImgMsg(data.demo ? "Gambar DEMO (pasang OPENAI_API_KEY untuk gambar asli)." : "Gambar dibuat!", data.demo ? "" : "ok");
  } catch (err) {
    setImgMsg("Gagal: " + err.message, "error");
  } finally {
    $("imgBtn").disabled = false;
  }
});

$("imgToVideo").addEventListener("click", () => {
  if (!lastImageUrl) return;
  loadSceneBg(lastImageUrl);
  document.querySelector('.tab[data-tab="video"]').click();
  setMsg("Gambar dipakai sebagai latar scene video. Buat rencana lalu preview.", "ok");
});

function setImgMsg(t, k = "") { const el = $("imgMsg"); el.textContent = t; el.className = "msg " + k; }

// ================= STUDIO VIDEO =================
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
let currentPlan = null;
let busy = false;
let sceneBgImage = null;

function loadSceneBg(url) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => { sceneBgImage = img; };
  img.src = url;
}

function sizeForPlatform(platform) {
  return /landscape/i.test(platform) ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };
}

$("generateBtn").addEventListener("click", async () => {
  if (busy) return;
  const topic = $("topic").value.trim();
  if (!topic) return setMsg("Isi dulu topiknya ya.", "error");
  busy = true; $("generateBtn").disabled = true;
  setMsg("AI sedang menyusun rencana video…");
  try {
    const res = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, platform: $("platform").value, language: $("language").value, tone: $("tone").value, sceneCount: $("sceneCount").value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal membuat rencana.");
    currentPlan = data.plan;
    renderPlan(currentPlan);
    setMsg(data.warning ? "⚠️ " + data.warning : (currentPlan._demo ? "Rencana demo dibuat." : "Rencana video siap!"), data.warning ? "error" : "ok");
  } catch (err) {
    setMsg(err.message, "error");
  } finally {
    busy = false; $("generateBtn").disabled = false;
  }
});

function renderPlan(plan) {
  const { w, h } = sizeForPlatform(plan.platform);
  canvas.width = w; canvas.height = h;
  canvas.style.display = "block";
  $("stageEmpty").style.display = "none";
  drawScene(plan.scenes[0], 1, "Scene 1");
  $("planMeta").classList.remove("hidden");
  $("planTitle").textContent = plan.title;
  $("planHook").textContent = "“" + plan.hook + "”";
  $("planCaption").textContent = plan.caption;
  $("planHashtags").innerHTML = "";
  (plan.hashtags || []).forEach((t) => {
    const s = document.createElement("span"); s.textContent = "#" + t.replace(/^#/, ""); $("planHashtags").appendChild(s);
  });
  $("previewBtn").disabled = false; $("recordBtn").disabled = false;
}

function drawScene(scene, appear, label) {
  const w = canvas.width, h = canvas.height;
  const [c1, c2] = scene.backgroundColors?.length >= 2 ? scene.backgroundColors : ["#0f172a", "#1e3a8a"];

  if (sceneBgImage) {
    const s = Math.max(w / sceneBgImage.width, h / sceneBgImage.height);
    const iw = sceneBgImage.width * s, ih = sceneBgImage.height * s;
    ctx.drawImage(sceneBgImage, (w - iw) / 2, (h - ih) / 2, iw, ih);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, w, h);
  } else {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  }
  const vg = ctx.createRadialGradient(w / 2, h / 2, h / 4, w / 2, h / 2, h);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

  const eased = 1 - Math.pow(1 - Math.min(appear, 1), 3);
  ctx.save();
  ctx.globalAlpha = eased;
  ctx.translate(w / 2, h * 0.42 + (1 - eased) * 40);
  ctx.textAlign = "center"; ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24;
  const mainSize = Math.round(w * 0.075);
  ctx.font = `800 ${mainSize}px system-ui, sans-serif`;
  wrapText(scene.onScreenText || "", 0, 0, w * 0.82, mainSize * 1.15);
  ctx.restore();

  if (scene.narration) {
    ctx.save(); ctx.textAlign = "center";
    const subSize = Math.round(w * 0.032);
    ctx.font = `600 ${subSize}px system-ui, sans-serif`;
    const lines = measureWrap(scene.narration, w * 0.8);
    const boxH = lines.length * subSize * 1.3 + 32;
    const boxY = h - boxH - h * 0.08;
    ctx.fillStyle = "rgba(0,0,0,0.55)"; roundRect(w * 0.06, boxY, w * 0.88, boxH, 20); ctx.fill();
    ctx.fillStyle = "#fff";
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, boxY + 24 + subSize + i * subSize * 1.3));
    ctx.restore();
  }
  if (label) {
    ctx.save(); ctx.textAlign = "left";
    ctx.font = `600 ${Math.round(w * 0.026)}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillText(label, w * 0.06, h * 0.07); ctx.restore();
  }
}

$("previewBtn").addEventListener("click", () => currentPlan && !busy && runTimeline({ record: false }));
$("recordBtn").addEventListener("click", () => currentPlan && !busy && runTimeline({ record: true }));

async function runTimeline({ record }) {
  busy = true; setControls(false);
  try { window.speechSynthesis?.cancel(); } catch {}
  const scenes = currentPlan.scenes;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();
  const withMusic = record && !$("muteRecord").checked;

  let recorder, chunks = [];
  if (record) {
    const stream = canvas.captureStream(30);
    if (withMusic) { startMusic(audioCtx, dest, currentPlan.musicMood); dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); }
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(); setRecordMsg("⏺️ Merekam video…");
  } else setRecordMsg("");

  const start = performance.now();
  let sceneIdx = -1;
  const total = scenes.reduce((s, x) => s + clampDur(x.durationSeconds), 0);

  await new Promise((resolve) => {
    function frame(now) {
      const t = (now - start) / 1000;
      if (t >= total) return resolve();
      let acc = 0, idx = 0;
      for (let i = 0; i < scenes.length; i++) { const d = clampDur(scenes[i].durationSeconds); if (t < acc + d) { idx = i; break; } acc += d; idx = i; }
      const scene = scenes[idx];
      const sceneStart = scenes.slice(0, idx).reduce((s, x) => s + clampDur(x.durationSeconds), 0);
      if (idx !== sceneIdx) { sceneIdx = idx; if (!record) speak(scene.narration, currentPlan.language); }
      drawScene(scene, (t - sceneStart) / 0.6, `Scene ${idx + 1}/${scenes.length}`);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  try { window.speechSynthesis?.cancel(); } catch {}
  if (record) {
    await new Promise((res) => { recorder.onstop = res; recorder.stop(); });
    const blob = new Blob(chunks, { type: chunks[0]?.type || "video/webm" });
    downloadBlob(blob, `video-${slug(currentPlan.title)}.webm`);
    setRecordMsg("✅ Video selesai & terunduh (.webm).", "ok");
  }
  try { audioCtx.close(); } catch {}
  busy = false; setControls(true);
}

function startMusic(audioCtx, dest, mood) {
  const base = { upbeat: 330, calm: 220, epic: 165, chill: 262 }[mood] || 262;
  const master = audioCtx.createGain(); master.gain.value = 0.05; master.connect(dest);
  [0, 4, 7].forEach((semi, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = base * Math.pow(2, semi / 12);
    const g = audioCtx.createGain(); g.gain.value = 0.5 / (i + 1);
    osc.connect(g).connect(master); osc.start();
  });
}

function speak(text, language) {
  if (!("speechSynthesis" in window) || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /english/i.test(language) ? "en-US" : "id-ID"; u.rate = 1.05;
  const v = window.speechSynthesis.getVoices().find((x) => x.lang?.startsWith(u.lang.slice(0, 2)));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

$("copyCaption").addEventListener("click", async () => {
  if (!currentPlan) return;
  const tags = (currentPlan.hashtags || []).map((t) => "#" + t.replace(/^#/, "")).join(" ");
  try { await navigator.clipboard.writeText(`${currentPlan.caption}\n\n${tags}`); setMsg("Caption tersalin!", "ok"); }
  catch { setMsg("Gagal menyalin.", "error"); }
});

// ---- util bersama ----
function clampDur(d) { return Math.min(Math.max(Number(d) || 4, 2), 8); }
function wrapText(text, x, y, maxWidth, lineHeight) {
  const lines = measureWrap(text, maxWidth);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lineHeight));
}
function measureWrap(text, maxWidth) {
  const words = String(text).split(/\s+/); const lines = []; let line = "";
  for (const w of words) { const test = line ? line + " " + w : w; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test; }
  if (line) lines.push(line); return lines;
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function pickMime() { return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || ""; }
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ai"; }
function setControls(e) { $("generateBtn").disabled = !e; $("previewBtn").disabled = !e; $("recordBtn").disabled = !e; }
function setMsg(t, k = "") { const el = $("msg"); el.textContent = t; el.className = "msg " + k; }
function setRecordMsg(t, k = "") { const el = $("recordMsg"); el.textContent = t; el.className = "msg " + k; }
