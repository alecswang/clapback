// The announcer. Every fixed line is recorded ahead of time with ElevenLabs
// (`npm run voice` writes public/voice/*.mp3 and a manifest), so playing costs
// nothing. Text that was never recorded falls back to the browser's built-in
// speech. Every call resolves even when speech is off, blocked or broken, so a
// timeline can await it safely.
import { duck, isMuted, playAudio, stopAudio } from '/js/sfx.js';
import { clipId } from '/js/clip-id.js';

const synth = window.speechSynthesis || null;
const LIKED = ['Daniel', 'Google UK English Male', 'Arthur', 'Fred', 'Alex', 'Google US English', 'Samantha'];
let on = true;
let chosen = null;
const keep = new Set(); // Chrome drops end events for utterances it garbage-collects

function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices();
  if (!voices.length) return null;
  for (const name of LIKED) {
    const v = voices.find((x) => x.name === name || x.name.startsWith(`${name} (`));
    if (v) return v;
  }
  return voices.find((v) => v.lang && v.lang.startsWith('en')) || voices[0];
}
if (synth) synth.addEventListener?.('voiceschanged', () => { chosen = pickVoice(); });

export const voiceOn = () => on;
export function setVoice(v) {
  on = v;
  if (!v) hush();
}

let recorded = null; // Set of clip ids, loaded once
const manifest = fetch('/voice/manifest.json')
  .then((r) => (r.ok ? r.json() : []))
  .catch(() => [])
  .then((ids) => { recorded = new Set(ids); });
const clips = new Map();

function fetchClip(id) {
  if (!clips.has(id)) {
    clips.set(id, fetch(`/voice/${id}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  }
  return clips.get(id);
}

// null = no recording (caller falls back), true/false = played or not.
async function sayClip(text) {
  await manifest;
  const id = clipId(text);
  if (!recorded.has(id)) return null;
  const bytes = await fetchClip(id);
  if (!bytes) return null;
  if (!on || isMuted()) return false;
  duck(true);
  // decodeAudioData detaches its input, so hand it a copy and keep the cache intact
  const ok = await playAudio(bytes.slice(0));
  duck(false);
  return ok;
}

export function hush() {
  stopAudio();
  if (synth) synth.cancel();
  keep.clear();
  duck(false);
}

// Resolves true once the line was actually spoken, false when it was not
// (voice off, muted, or the browser refused). Callers pace themselves on false.
export async function say(text, opts) {
  if (!on || isMuted() || !text) return false;
  const ok = await sayClip(String(text));
  if (ok !== null) return ok;
  return sayRobot(text, opts);
}

function sayRobot(text, { rate = 1.04, pitch = 0.9 } = {}) {
  const guess = 600 + String(text).length * 62;
  if (!on || !synth || isMuted() || !text) return Promise.resolve(false);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(String(text));
    chosen = chosen || pickVoice();
    if (chosen) u.voice = chosen;
    u.rate = rate;
    u.pitch = pitch;
    keep.add(u);
    let done = false;
    let started = false;
    const finish = () => {
      if (done) return;
      done = true;
      keep.delete(u);
      if (!keep.size) duck(false);
      resolve(started);
    };
    u.onstart = () => { started = true; };
    u.onend = finish;
    u.onerror = finish;
    // Speech that never starts (no user gesture yet) must not stall the show.
    setTimeout(() => {
      if (started || done) return;
      synth.cancel();
      finish();
    }, 1500);
    setTimeout(finish, guess * 1.6 + 1500);
    duck(true);
    synth.speak(u);
  });
}

export function pick(list, vars = {}) {
  const s = list[Math.floor(Math.random() * list.length)];
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
