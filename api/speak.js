// POST /api/speak  {voice_id, text, voice_settings}  ->  audio/mpeg
// Proxies ElevenLabs text-to-speech. The API key stays on the server
// (Vercel > Project > Settings > Environment Variables > ELEVENLABS_API_KEY).
const VOICES = require("./_voices.js");

const ALLOWED = new Set(VOICES.map((v) => v.voice_id));
const MAX_CHARS = 300;
const MODEL_ID = "eleven_multilingual_v2";

const clamp = (x, lo, hi, dflt) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST" });
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Server is missing ELEVENLABS_API_KEY. Add it in Vercel > Settings > Environment Variables, then redeploy." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== "object") return res.status(400).json({ error: "Send JSON" });

  const voiceId = String(body.voice_id || "");
  if (!ALLOWED.has(voiceId)) return res.status(400).json({ error: "Unknown voice" });

  const text = String(body.text || "").replace(/\s+/g, " ").trim();
  if (!text) return res.status(400).json({ error: "Text is empty" });
  if (text.length > MAX_CHARS) return res.status(400).json({ error: `Text is limited to ${MAX_CHARS} characters` });

  const s = body.voice_settings || {};
  const voice_settings = {
    stability: clamp(s.stability, 0, 1, 0.5),
    similarity_boost: clamp(s.similarity_boost, 0, 1, 0.75),
    style: clamp(s.style, 0, 1, 0),
    use_speaker_boost: true,
    speed: clamp(s.speed, 0.7, 1.2, 1.0),
  };

  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings }),
      }
    );
    if (!r.ok) {
      let msg = await r.text();
      try {
        const j = JSON.parse(msg);
        msg = (j.detail && (j.detail.message || j.detail)) || msg;
      } catch {}
      return res.status(r.status).json({ error: `ElevenLabs said: ${typeof msg === "string" ? msg.slice(0, 300) : JSON.stringify(msg).slice(0, 300)}` });
    }
    const audio = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(audio);
  } catch (e) {
    return res.status(502).json({ error: "Could not reach ElevenLabs" });
  }
};
