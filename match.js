// Hearing summary, voice preferences, voice scoring and boost curve.
// A JavaScript port of voice_match.py and boost.py from the hearing-voice project.
// Works in the browser (window.HV) and in Node (require("./match.js")).
(function (root) {
  "use strict";

  const BANDS = { low: [0, 750], mid: [750, 2500], high: [2500, 20000] };
  const PTA_FREQS = [500, 1000, 2000, 4000];
  const TYPICAL_DB_HL = 20;
  const MAX_GAIN_DB = 20;

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const r1 = (x) => Math.round(x * 10) / 10;

  // points: { hz: [left|null, right|null] }
  function earValues(points, ear) {
    const out = {};
    for (const [f, v] of Object.entries(points)) if (v[ear] != null) out[f] = v[ear];
    return out;
  }

  // linear in log2(frequency), flat beyond the ends (like numpy.interp)
  function interpLog(vals, f) {
    const fs = Object.keys(vals).map(Number).sort((a, b) => a - b);
    if (!fs.length) return null;
    const x = Math.log2(f);
    const xs = fs.map(Math.log2), ys = fs.map((k) => vals[k]);
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) {
        const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
        return ys[i - 1] + t * (ys[i] - ys[i - 1]);
      }
    }
  }

  function summarise(points) {
    const out = {};
    [["left", 0], ["right", 1]].forEach(([name, ear]) => {
      const vals = earValues(points, ear);
      if (!Object.keys(vals).length) { out[name] = null; return; }
      const bands = {};
      for (const [b, [lo, hi]] of Object.entries(BANDS)) {
        const sel = Object.entries(vals).filter(([f]) => +f >= lo && +f < hi).map(([, v]) => v);
        bands[b] = sel.length ? r1(mean(sel)) : null;
      }
      out[name] = { bands, pta: r1(mean(PTA_FREQS.map((f) => interpLog(vals, f)))) };
    });
    const ears = [out.left, out.right].filter(Boolean);
    if (!ears.length) throw new Error("Enter at least one hearing level");
    const combined = {};
    for (const b of Object.keys(BANDS)) {
      const sel = ears.map((e) => e.bands[b]).filter((v) => v != null);
      combined[b] = sel.length ? r1(mean(sel)) : null;
    }
    out.both = {
      bands: combined,
      pta_better_ear: Math.min(...ears.map((e) => e.pta)),
      pta_worse_ear: Math.max(...ears.map((e) => e.pta)),
    };
    return out;
  }

  function grade(pta) {
    if (pta < 20) return "typical";
    if (pta < 35) return "mild";
    if (pta < 50) return "moderate";
    if (pta < 65) return "moderately severe";
    return "severe";
  }

  function preferences(summary) {
    const b = summary.both.bands;
    let { low, mid, high } = b;
    low = low != null ? low : (mid || 0);
    high = high != null ? high : (mid || 0);
    const pta = summary.both.pta_better_ear;
    const worst = Math.max(...[low, mid, high].filter((v) => v != null));
    const slope = high - low;
    const level = grade(pta);
    let shape;
    if (worst < 20) shape = "typical";
    else if (slope >= 10) shape = "high-frequency loss";
    else if (slope <= -10) shape = "low-frequency loss";
    else shape = "flat loss";

    const p = { shape, level, want: {}, avoid: {}, voice_settings: {}, reasons: [] };
    if (shape === "high-frequency loss") {
      p.want = { male: 3, deep: 3, low: 2, warm: 3, resonant: 2, rich: 1, "middle aged": 1, old: 1,
        calm: 1, clear: 2, narrat: 1, authoritative: 1, informative: 1 };
      p.avoid = { whisper: 3, breathy: 3, airy: 2, "high pitched": 3, squeak: 3, child: 3, young: 1,
        soft: 1, raspy: 1, fast: 1 };
      p.reasons.push(`High pitches are harder for you (about ${high.toFixed(0)} dB HL above 2.5 kHz vs ${low.toFixed(0)} dB HL in the bass), so deeper, warmer voices keep more of the speech where you hear best.`);
      p.reasons.push("Breathy or whispery voices put their energy in 's', 'f' and 'th' sounds up high, which are the first to go, so they are marked down.");
    } else if (shape === "low-frequency loss") {
      p.want = { female: 2, bright: 3, clear: 3, crisp: 2, young: 1, energetic: 1, articulate: 2 };
      p.avoid = { deep: 3, bass: 2, low: 2, gravel: 2, rumbl: 2, whisper: 1 };
      p.reasons.push("Low pitches are harder for you, so brighter, clearer voices are favoured.");
    } else if (shape === "flat loss") {
      p.want = { clear: 3, articulate: 3, crisp: 2, narrat: 2, calm: 1, informative: 2, professional: 1, confident: 1 };
      p.avoid = { whisper: 3, breathy: 2, raspy: 2, fast: 1, soft: 1 };
      p.reasons.push("Your hearing is similar across pitches, so clear, well-articulated narrators are favoured over any particular pitch.");
    } else {
      p.want = { clear: 2, natural: 1, conversational: 1, warm: 1 };
      p.avoid = { whisper: 1 };
      p.reasons.push("Your hearing looks typical, so any clear voice will do; the pick is mostly taste.");
    }

    let speed = { typical: 1.0, mild: 0.92, moderate: 0.87 }[level] ?? 0.82;
    if (shape === "high-frequency loss" && level === "typical") speed = 0.95;
    let stability = { typical: 0.5, mild: 0.65 }[level] ?? 0.75;
    if (shape === "high-frequency loss") stability = Math.max(stability, 0.6);
    p.voice_settings = { stability, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true, speed };
    if (speed < 1.0) p.reasons.push(`Speaking speed set to ${speed} (1.0 is normal) to give more time per word.`);
    if (stability > 0.5) p.reasons.push(`Stability raised to ${stability} for a steadier, more predictable delivery.`);
    return p;
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function voiceText(v) {
    const labels = v.labels || {};
    const parts = [v.name || "", v.description || "", Object.entries(labels).map(([k, x]) => `${k} ${x}`).join(" ")];
    return parts.join(" ").toLowerCase().replace(/[_-]/g, " ");
  }

  function scoreVoice(v, prefs) {
    const text = voiceText(v);
    const labels = {};
    for (const [k, x] of Object.entries(v.labels || {})) labels[k] = String(x).toLowerCase();
    let score = 0;
    const why = [];
    for (const [kw, pts] of Object.entries(prefs.want)) {
      const hit = kw === "male" || kw === "female" ? labels.gender === kw : new RegExp("\\b" + esc(kw)).test(text);
      if (hit) { score += pts; why.push({ kw, pts }); }
    }
    for (const [kw, pts] of Object.entries(prefs.avoid)) {
      if (new RegExp("\\b" + esc(kw)).test(text)) { score -= pts; why.push({ kw, pts: -pts }); }
    }
    return { score, why };
  }

  function rank(voices, prefs) {
    // stable sort, highest score first (same as Python's sorted)
    return voices.map((v, i) => ({ v, i, ...scoreVoice(v, prefs) }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
  }

  // ----- boost.py: half-gain rule, gain(f) = 0.5 x (HL - 20), 0..20 dB
  function gainCurve(points, ear) {
    let vals;
    const left = earValues(points, 0), right = earValues(points, 1);
    const has = (o) => Object.keys(o).length > 0;
    if (ear === 0) vals = has(left) ? left : right;
    else if (ear === 1) vals = has(right) ? right : left;
    else {
      vals = {};
      for (const [f, v] of Object.entries(points)) {
        const xs = v.filter((x) => x != null);
        if (xs.length) vals[f] = mean(xs);
      }
    }
    const g = {};
    for (const [f, hl] of Object.entries(vals)) g[f] = Math.min(MAX_GAIN_DB, Math.max(0, 0.5 * (hl - TYPICAL_DB_HL)));
    return (f) => (f < 60 || !Object.keys(g).length ? 0 : interpLog(g, f));
  }

  // Linear-phase FIR (frequency sampling + Hann window) for a ConvolverNode.
  function firFromCurve(curve, sampleRate, n = 2048) {
    const half = n / 2;
    const H = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) H[k] = Math.pow(10, curve((k * sampleRate) / n) / 20);
    const h = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const m = i - half;
      let s = H[0];
      for (let k = 1; k < half; k++) s += 2 * H[k] * Math.cos((2 * Math.PI * k * m) / n);
      s += H[half] * Math.cos(Math.PI * m);
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      h[i] = (s / n) * w;
    }
    return h;
  }

  root.HV = { summarise, grade, preferences, scoreVoice, rank, gainCurve, firFromCurve, interpLog };
  if (typeof module !== "undefined" && module.exports) module.exports = root.HV;
})(typeof window !== "undefined" ? window : globalThis);
