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

// ================= HELPER GAMBAR =================
function fileToImage(input) {
  return new Promise((resolve, reject) => {
    const f = input.files?.[0];
    if (!f) return reject(new Error("Pilih file dulu"));
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ img, dataUrl: reader.result, mediaType: f.type || "image/png" });
      img.onerror = () => reject(new Error("Gagal memuat gambar"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(f);
  });
}
function rgbToHex(r, g, b) { return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join(""); }

// ================= UBAH (image-to-image) =================
const STYLES = {
  sinematik: { filter: "contrast(1.2) saturate(1.3) brightness(0.95)", overlay: "rgba(0,40,60,0.12)" },
  vintage: { filter: "sepia(0.55) contrast(0.95) saturate(1.1) brightness(1.05)", overlay: "rgba(120,80,20,0.08)" },
  neon: { filter: "saturate(2) contrast(1.25) brightness(1.05)", overlay: "rgba(120,0,160,0.10)" },
  bw: { filter: "grayscale(1) contrast(1.15)", overlay: null },
  hangat: { filter: "saturate(1.35) brightness(1.05)", overlay: "rgba(255,140,0,0.12)" },
  dingin: { filter: "saturate(1.15) contrast(1.05)", overlay: "rgba(0,120,255,0.14)" },
};
let editState = null;
$("editFile").addEventListener("change", async (e) => {
  try {
    editState = await fileToImage(e.target);
    $("editSrc").src = editState.dataUrl; $("editSrc").style.display = "block"; $("editEmpty").style.display = "none";
    setEditMsg("Pilih gaya di atas untuk mengubah.");
  } catch (err) { setEditMsg(err.message, "error"); }
});
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", async () => {
    if (!editState) return setEditMsg("Unggah gambar dulu.", "error");
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    const prompt = $("editPrompt").value.trim();
    if (providers?.image?.configured && prompt) {
      setEditMsg("Mengubah dengan AI…");
      try {
        const res = await fetch("/api/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: editState.dataUrl, mediaType: editState.mediaType, prompt }) });
        const data = await res.json();
        if (data.url) { showEditOut(data.url); return setEditMsg("Gambar diubah oleh AI!", "ok"); }
      } catch {}
    }
    applyStyle(chip.dataset.style);
    setEditMsg(providers?.image?.configured ? "Gaya diterapkan (isi prompt untuk hasil AI)." : "Gaya diterapkan (mode demo).");
  });
});
function applyStyle(style) {
  const { img } = editState;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const cx = c.getContext("2d");
  const s = STYLES[style] || STYLES.sinematik;
  cx.filter = s.filter; cx.drawImage(img, 0, 0); cx.filter = "none";
  if (s.overlay) { cx.fillStyle = s.overlay; cx.fillRect(0, 0, c.width, c.height); }
  showEditOut(c.toDataURL("image/png"));
}
function showEditOut(url) {
  $("editOut").src = url; $("editOut").style.display = "block";
  $("editActions").style.display = "flex"; $("editDownload").href = url;
  lastEditUrl = url;
}
let lastEditUrl = null;
$("editToVideo").addEventListener("click", () => {
  if (!lastEditUrl) return;
  loadI2VImage(lastEditUrl);
  document.querySelector('.tab[data-tab="i2v"]').click();
});
function setEditMsg(t, k = "") { const el = $("editMsg"); el.textContent = t; el.className = "msg " + k; }

// ================= ANALISA (breakdown image) =================
$("anaFile").addEventListener("change", async (e) => {
  let st;
  try { st = await fileToImage(e.target); } catch (err) { return setAnaMsg(err.message, "error"); }
  $("anaImg").src = st.dataUrl; $("anaImg").style.display = "block"; $("anaEmpty").style.display = "none";
  setAnaMsg("Menganalisa…");
  if (providers?.vision?.configured) {
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: st.dataUrl, mediaType: st.mediaType }) });
      const data = await res.json();
      if (data.result) { fillAnalyze(data.result, analyzeLocal(st.img)); return setAnaMsg("Analisa AI selesai!", "ok"); }
    } catch {}
  }
  const local = analyzeLocal(st.img);
  fillAnalyze(localBreakdown(local), local);
  setAnaMsg("Analisa demo (palet & komposisi asli dari gambarmu).");
});
function analyzeLocal(img) {
  const S = 64, c = document.createElement("canvas"); c.width = S; c.height = S;
  const cx = c.getContext("2d"); cx.drawImage(img, 0, 0, S, S);
  const d = cx.getImageData(0, 0, S, S).data;
  const buckets = {}; let br = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]; br += (r + g + b) / 3;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    (buckets[key] ||= { c: 0, r: 0, g: 0, b: 0 });
    const bb = buckets[key]; bb.c++; bb.r += r; bb.g += g; bb.b += b;
  }
  br /= d.length / 4;
  const palette = Object.values(buckets).sort((a, b) => b.c - a.c).slice(0, 5)
    .map((b) => rgbToHex(Math.round(b.r / b.c), Math.round(b.g / b.c), Math.round(b.b / b.c)));
  const brightness = br > 170 ? "terang" : br < 85 ? "gelap" : "sedang";
  const orient = img.naturalWidth > img.naturalHeight ? "landscape" : img.naturalWidth < img.naturalHeight ? "potret" : "persegi";
  return { palette, brightness, orient };
}
function localBreakdown(l) {
  return {
    description: `Gambar ${l.orient} dengan nuansa ${l.brightness}. Didominasi palet warna ${l.palette.slice(0, 3).join(", ")}.`,
    elements: [l.orient, `pencahayaan ${l.brightness}`, "komposisi utama di tengah"],
    mood: l.brightness === "gelap" ? "dramatis / moody" : l.brightness === "terang" ? "cerah / ceria" : "netral",
    imagePrompt: `A ${l.orient} image, ${l.brightness} lighting, color palette ${l.palette.slice(0, 3).join(", ")}, cinematic, highly detailed, 8k`,
    videoPrompt: `Animate this image with a slow push-in and gentle parallax, cinematic camera move, 5 seconds, smooth motion`,
  };
}
function fillAnalyze(r, local) {
  $("anaDesc").textContent = r.description || "-";
  $("anaElements").textContent = ((r.elements || []).join(", ")) + (r.mood ? ` · mood: ${r.mood}` : "");
  $("anaImgPrompt").textContent = r.imagePrompt || "";
  $("anaVidPrompt").textContent = r.videoPrompt || "";
  const pal = $("anaPalette"); pal.innerHTML = "";
  (local.palette || []).forEach((hex) => {
    const sw = document.createElement("div"); sw.className = "sw"; sw.style.background = hex;
    const s = document.createElement("span"); s.textContent = hex; sw.appendChild(s); pal.appendChild(sw);
  });
  $("anaOut").classList.remove("hidden");
}
function setAnaMsg(t, k = "") { const el = $("anaMsg"); el.textContent = t; el.className = "msg " + k; }

// ================= FOTO → VIDEO (image-to-video) =================
const i2vCanvas = $("i2vCanvas");
const i2vCtx = i2vCanvas.getContext("2d");
let i2vState = null, i2vBusy = false;

$("i2vFile").addEventListener("change", async (e) => {
  try {
    i2vState = await fileToImage(e.target);
    $("i2vEmpty").style.display = "none"; i2vCanvas.style.display = "block";
    drawI2V(i2vState.img, 0, $("i2vMotion").value);
    $("i2vPreview").disabled = false; $("i2vRecord").disabled = false;
    setI2VMsg("Siap. Pilih gerakan lalu preview / buat video.");
  } catch (err) { setI2VMsg(err.message, "error"); }
});
function loadI2VImage(url) {
  const img = new Image();
  img.onload = () => {
    i2vState = { img, dataUrl: url, mediaType: "image/png" };
    $("i2vEmpty").style.display = "none"; i2vCanvas.style.display = "block";
    drawI2V(img, 0, $("i2vMotion").value);
    $("i2vPreview").disabled = false; $("i2vRecord").disabled = false;
    setI2VMsg("Gambar dari tab lain dimuat. Buat videonya!");
  };
  img.src = url;
}
function drawI2V(img, p, motion) {
  const w = i2vCanvas.width, h = i2vCanvas.height;
  const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  let scale = cover;
  if (motion === "zoomin" || motion === "kenburns") scale = cover * (1 + 0.22 * p);
  else if (motion === "zoomout") scale = cover * (1 + 0.22 * (1 - p));
  else scale = cover * 1.18;
  const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
  const slackX = iw - w, slackY = ih - h;
  let ox = -slackX / 2, oy = -slackY / 2;
  if (motion === "panright") ox = -slackX * p;
  else if (motion === "panleft") ox = -slackX * (1 - p);
  else if (motion === "kenburns") ox = -slackX * (0.5 * p);
  i2vCtx.fillStyle = "#000"; i2vCtx.fillRect(0, 0, w, h);
  i2vCtx.drawImage(img, ox, oy, iw, ih);
}
$("i2vMotion").addEventListener("change", () => i2vState && drawI2V(i2vState.img, 0, $("i2vMotion").value));
$("i2vPreview").addEventListener("click", () => !i2vBusy && runI2V({ record: false }));
$("i2vRecord").addEventListener("click", () => !i2vBusy && runI2V({ record: true }));

async function runI2V({ record }) {
  if (!i2vState) return;
  i2vBusy = true; setI2VControls(false);
  const dur = Math.min(Math.max(Number($("i2vDur").value) || 5, 2), 10);
  const motion = $("i2vMotion").value;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();
  let recorder, chunks = [];
  if (record) {
    const stream = i2vCanvas.captureStream(30);
    if ($("i2vMusic").checked) { startMusic(audioCtx, dest, "chill"); dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); }
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(); setI2VMsg("⏺️ Merekam video…");
  } else setI2VMsg("▶️ Preview…");
  const start = performance.now();
  await new Promise((res) => {
    function frame(now) { const t = (now - start) / 1000; drawI2V(i2vState.img, Math.min(t / dur, 1), motion); if (t >= dur) return res(); requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  });
  if (record) {
    await new Promise((r) => { recorder.onstop = r; recorder.stop(); });
    const blob = new Blob(chunks, { type: chunks[0]?.type || "video/webm" });
    downloadBlob(blob, "foto-video.webm");
    setI2VMsg("✅ Video selesai & terunduh (.webm).", "ok");
  } else setI2VMsg("Preview selesai.");
  try { audioCtx.close(); } catch {}
  i2vBusy = false; setI2VControls(true);
}
function setI2VControls(e) { $("i2vPreview").disabled = !e || !i2vState; $("i2vRecord").disabled = !e || !i2vState; }
function setI2VMsg(t, k = "") { const el = $("i2vMsg"); el.textContent = t; el.className = "msg " + k; }

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
