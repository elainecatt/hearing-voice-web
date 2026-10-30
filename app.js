/* global HV */
(function () {
  "use strict";
  const FREQS = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000];
  // EXAMPLE ONLY: a made-up, typical age-related high-frequency loss.
  const EXAMPLE = {
    250: [15, 15], 500: [15, 20], 1000: [20, 20], 2000: [35, 30],
    3000: [45, 40], 4000: [55, 50], 6000: [60, 55], 8000: [65, 60],
  };
  const $ = (id) => document.getElementById(id);
  const label = (f) => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- form
  const rows = $("rows");
  rows.innerHTML = FREQS.map((f) => `
    <tr><th scope="row">${label(f)}</th>
      <td><input type="number" inputmode="numeric" min="-10" max="120" step="5" id="l${f}" aria-label="Left ear at ${label(f)}, dB HL"></td>
      <td><input type="number" inputmode="numeric" min="-10" max="120" step="5" id="r${f}" aria-label="Right ear at ${label(f)}, dB HL"></td>
    </tr>`).join("");

  $("example").onclick = () => {
    for (const f of FREQS) { $("l" + f).value = EXAMPLE[f][0]; $("r" + f).value = EXAMPLE[f][1]; }
    $("example-note").hidden = false;
    $("form-error").textContent = "";
  };
  $("clear").onclick = () => {
    for (const f of FREQS) { $("l" + f).value = ""; $("r" + f).value = ""; }
    $("example-note").hidden = true;
  };
  rows.addEventListener("input", () => { $("example-note").hidden = true; });

  function readPoints() {
    const pts = {};
    for (const f of FREQS) {
      const v = ["l", "r"].map((e) => {
        const s = $(e + f).value.trim();
        if (s === "") return null;
        const n = Number(s);
        if (!Number.isFinite(n) || n < -10 || n > 120) throw new Error(`${label(f)}: use a number from -10 to 120`);
        return n;
      });
      if (v[0] != null || v[1] != null) pts[f] = v;
    }
    if (Object.keys(pts).length < 2) throw new Error("Please fill in at least two pitches (or press 'Use example hearing').");
    return pts;
  }

  // ---- voices (served by /api/voices so the server can check the voice id)
  let VOICES = null;
  async function getVoices() {
    if (VOICES) return VOICES;
    const r = await fetch("/api/voices");
    if (!r.ok) throw new Error("Could not load the voice list");
    VOICES = await r.json();
    return VOICES;
  }

  const state = { points: null, prefs: null, chosen: null, ranked: [] };

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("form-error").textContent = "";
    try {
      state.points = readPoints();
      const s = HV.summarise(state.points);
      state.prefs = HV.preferences(s);
      const voices = await getVoices();
      state.ranked = HV.rank(voices, state.prefs).slice(0, 3);
      state.chosen = state.ranked[0].v;
      showSummary(s, state.prefs);
      showVoices();
      showBoostTable();
      ["results", "voices-card", "listen-card"].forEach((id) => ($(id).hidden = false));
      invalidateFilters();
      $("results").scrollIntoView({ behavior: "smooth", block: "start" });
      $("h-step2").setAttribute("tabindex", "-1");
      $("h-step2").focus({ preventScroll: true });
    } catch (err) {
      $("form-error").textContent = err.message;
    }
  });

  function showSummary(s, p) {
    const b = s.both.bands;
    const fmt = (x) => (x == null ? "not tested" : `${Math.round(x)} dB HL`);
    $("summary").innerHTML = `
      <p class="big-line">${p.shape === "typical" ? "Typical hearing" : `${cap(p.level)} ${p.shape}`}</p>
      <p>Average of 0.5, 1, 2 and 4 kHz in your better ear: <strong>${s.both.pta_better_ear} dB HL</strong> (${p.level}).</p>
      <ul class="pills" aria-label="Average hearing level by pitch">
        <li>Low pitches: <strong>${fmt(b.low)}</strong></li>
        <li>Middle: <strong>${fmt(b.mid)}</strong></li>
        <li>High pitches: <strong>${fmt(b.high)}</strong></li>
      </ul>
      <h3>What that means for a voice</h3>
      <ul>${p.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function showVoices() {
    const vs = state.prefs.voice_settings;
    $("voices").innerHTML = state.ranked.map((x, i) => {
      const L = x.v.labels;
      const plus = x.why.filter((w) => w.pts > 0).map((w) => w.kw);
      const minus = x.why.filter((w) => w.pts < 0).map((w) => w.kw);
      const chosen = x.v.voice_id === state.chosen.voice_id;
      return `<li class="voice${chosen ? " chosen" : ""}">
        <h3>${i + 1}. ${escapeHtml(x.v.name)}${i === 0 ? '<span class="tag">Best match</span>' : ""}</h3>
        <p>${escapeHtml(cap(L.gender))}, ${escapeHtml(L.age)}, ${escapeHtml(L.accent)}. ${escapeHtml(cap(L.descriptive))}.</p>
        <p class="hint">Score ${x.score}. ${plus.length ? "Suits you: " + escapeHtml(plus.join(", ")) + "." : ""} ${minus.length ? "Marked down: " + escapeHtml(minus.join(", ")) + "." : ""}</p>
        <button type="button" class="${chosen ? "primary" : "secondary"}" data-voice="${x.v.voice_id}" aria-pressed="${chosen}">${chosen ? "Selected" : "Use " + escapeHtml(x.v.name)}</button>
      </li>`;
    }).join("") + `<li class="hint">Settings for your ears: speed <strong>${vs.speed}</strong>, stability <strong>${vs.stability}</strong>, similarity <strong>${vs.similarity_boost}</strong>, style <strong>${vs.style}</strong>, speaker boost on.</li>`;
    $("voices").querySelectorAll("button[data-voice]").forEach((btn) => {
      btn.onclick = () => {
        state.chosen = state.ranked.find((x) => x.v.voice_id === btn.dataset.voice).v;
        showVoices();
        $("listen-card").scrollIntoView({ behavior: "smooth" });
      };
    });
    $("play").innerHTML = `&#9654; Play sample in ${escapeHtml(state.chosen.name)}'s voice`;
  }

  function showBoostTable() {
    const show = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000];
    const cl = HV.gainCurve(state.points, 0), cr = HV.gainCurve(state.points, 1);
    $("boost-table").innerHTML = `<table class="grid"><caption>Boost applied (dB)</caption>
      <thead><tr><th scope="col">Pitch</th>${show.map((f) => `<th scope="col">${label(f)}</th>`).join("")}</tr></thead>
      <tbody><tr><th scope="row">Left</th>${show.map((f) => `<td>${cl(f).toFixed(1)}</td>`).join("")}</tr>
      <tr><th scope="row">Right</th>${show.map((f) => `<td>${cr(f).toFixed(1)}</td>`).join("")}</tr></tbody></table>`;
  }

  // ---- audio: source -> [dry | hearing EQ (stereo FIR)] -> +6 dB -> limiter -> speakers
  let ctx, dry, wet, conv, out, limiter, src, irFor = null;
  const audioCache = new Map();

  function setupAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    dry = ctx.createGain(); wet = ctx.createGain();
    conv = ctx.createConvolver(); conv.normalize = false;
    out = ctx.createGain(); out.gain.value = Math.pow(10, 6 / 20); // about +6 dB
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.15;
    wet.connect(conv); conv.connect(out); dry.connect(out); out.connect(limiter); limiter.connect(ctx.destination);
    applyBoostSwitch(true);
  }
  function invalidateFilters() { irFor = null; }
  function buildFilters() {
    if (irFor === state.points) return;
    const n = 2048, ir = ctx.createBuffer(2, n, ctx.sampleRate);
    ir.copyToChannel(HV.firFromCurve(HV.gainCurve(state.points, 0), ctx.sampleRate, n), 0);
    ir.copyToChannel(HV.firFromCurve(HV.gainCurve(state.points, 1), ctx.sampleRate, n), 1);
    conv.buffer = ir;
    irFor = state.points;
  }
  function applyBoostSwitch(instant) {
    const on = $("boost").checked;
    $("boost-state").textContent = on ? "ON" : "OFF";
    if (!ctx) return;
    const t = ctx.currentTime, ramp = instant ? 0 : 0.05;
    wet.gain.setTargetAtTime(on ? 1 : 0, t, ramp || 0.001);
    dry.gain.setTargetAtTime(on ? 0 : 1, t, ramp || 0.001);
  }
  $("boost").addEventListener("change", () => applyBoostSwitch(false));

  const textEl = $("text");
  const updateCount = () => ($("count").textContent = `${textEl.value.length} / 300 characters`);
  textEl.addEventListener("input", updateCount); updateCount();

  function status(msg) { $("status").textContent = msg; }

  async function fetchSpeech(voice, text, settings) {
    const k = JSON.stringify([voice.voice_id, text, settings]);
    if (audioCache.has(k)) return audioCache.get(k);
    const r = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: voice.voice_id, text, voice_settings: settings }),
    });
    if (!r.ok) {
      let msg = `Error ${r.status}`;
      try { msg = (await r.json()).error || msg; } catch (_) {}
      throw new Error(msg);
    }
    const buf = await ctx.decodeAudioData(await r.arrayBuffer());
    // normalise the peak so every voice starts equally loud
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak > 0) {
      const g = 0.7 / peak;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= g;
      }
    }
    audioCache.set(k, buf);
    return buf;
  }

  function stop() {
    if (src) { try { src.stop(); } catch (_) {} src = null; }
    $("stop").disabled = true;
  }
  $("stop").onclick = () => { stop(); status("Stopped."); };

  $("play").onclick = async () => {
    const text = textEl.value.replace(/\s+/g, " ").trim();
    if (!text) { status("Type a sentence first."); return; }
    setupAudio();
    if (ctx.state === "suspended") await ctx.resume();
    buildFilters();
    stop();
    $("play").disabled = true;
    status(`Making speech in ${state.chosen.name}'s voice...`);
    try {
      const buf = await fetchSpeech(state.chosen, text, state.prefs.voice_settings);
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dry); src.connect(wet);
      src.onended = () => { if (src && src.buffer === buf) { src = null; $("stop").disabled = true; status("Finished. Flip the boost switch and play again to compare."); } };
      src.start();
      $("stop").disabled = false;
      status(`Playing ${state.chosen.name}, boost ${$("boost").checked ? "on" : "off"}.`);
    } catch (err) {
      status("Sorry: " + err.message);
    } finally {
      $("play").disabled = false;
    }
  };
})();
