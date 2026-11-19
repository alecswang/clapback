'use strict';

// Records every fixed announcer line once with ElevenLabs and saves them as
// public/voice/<id>.mp3 plus public/voice/manifest.json. The game only plays
// these files, so a game night makes no API calls.
//
//   npm run voice            record anything not recorded yet
//   npm run voice -- --dry   count lines and characters, record nothing
//
// Needs ELEVENLABS_API_KEY in the project's env file. Optional:
// ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'voice');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}

const KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9'; // "Daniel", British presenter
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const DRY = process.argv.includes('--dry');

async function texts() {
  const { LINES } = await import(path.join(ROOT, 'public/games/clapback/lines.js'));
  const { DECKS } = require(path.join(ROOT, 'games/clapback/decks'));
  const all = [];
  const walk = (v) => {
    if (typeof v === 'string') all.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(LINES);
  for (const d of DECKS) walk([d.POOL, d.FINAL]);
  return [...new Set(all.map((t) => t.trim()).filter(Boolean))];
}

async function record(text) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const { clipId } = await import(path.join(ROOT, 'public/js/clip-id.js'));
  fs.mkdirSync(OUT, { recursive: true });
  const list = await texts();
  const todo = list.filter((t) => !fs.existsSync(path.join(OUT, `${clipId(t)}.mp3`)));
  const chars = todo.reduce((n, t) => n + t.length, 0);
  console.log(`${list.length} lines, ${todo.length} not recorded yet (${chars} characters).`);
  if (DRY || !todo.length) return writeManifest(list, clipId);
  if (!KEY) throw new Error('ELEVENLABS_API_KEY is missing.');

  let done = 0;
  let failed = 0;
  const queue = [...todo];
  async function worker() {
    for (let t = queue.shift(); t; t = queue.shift()) {
      try {
        fs.writeFileSync(path.join(OUT, `${clipId(t)}.mp3`), await record(t));
        done++;
      } catch (e) {
        failed++;
        console.error(`  failed: "${t.slice(0, 50)}" ${e.message}`);
        if (/40[12]/.test(e.message)) queue.length = 0; // bad key or out of credits: stop
      }
      process.stdout.write(`\r  recorded ${done}/${todo.length}`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  process.stdout.write('\n');
  writeManifest(list, clipId);
  if (failed) process.exitCode = 1;
}

// Only lines that have a file go in the manifest; anything else uses the robot voice.
// Recordings for lines that no longer exist get deleted.
function writeManifest(list, clipId) {
  const keep = new Set(list.map(clipId));
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith('.mp3') && !keep.has(f.slice(0, -4))) fs.unlinkSync(path.join(OUT, f));
  }
  const ids = list.map(clipId).filter((id) => fs.existsSync(path.join(OUT, `${id}.mp3`)));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(ids));
  console.log(`manifest: ${ids.length} recorded lines.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
