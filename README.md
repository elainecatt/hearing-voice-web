# Hearing Voice (web)

Type in your hearing test results (dB HL per pitch, each ear) and the page:

1. sums up your hearing (low / middle / high pitches, overall level),
2. picks the ElevenLabs voices that suit your ears and the settings to use (speed, stability…), explaining why,
3. speaks a sentence in that voice, with a hearing boost tailored to your test that you can switch on and off while it plays.

The "Use example hearing" button fills in made-up example data (a typical age-related high-frequency loss).
It's the web version of the `hearing-voice` Python project: `match.js` is a port of `voice_match.py` (matching) and `boost.py` (half-gain boost, done in the browser with Web Audio).

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The page |
| `match.js` | Hearing summary, voice scoring and boost curve |
| `api/speak.js` | Serverless function: sends the text to ElevenLabs text-to-speech, returns MP3 |
| `api/voices.js`, `api/_voices.js` | The list of voices the page can use (ElevenLabs default voices) |

No build step and no packages. The ElevenLabs API key lives only on Vercel as the environment variable
`ELEVENLABS_API_KEY` (it needs the Text to Speech permission). It is never in the page or this repo.
`api/speak.js` only accepts voices from the list and at most 300 characters.

## Deploy on Vercel

1. Push this folder to GitHub.
2. vercel.com > Add New > Project > import the repo.
3. Under Environment Variables add `ELEVENLABS_API_KEY` = your key. Click Deploy.

To add a voice, copy its Voice ID from elevenlabs.io and add a line to `api/_voices.js`.

A demo, not a medical device or hearing aid fitting.
