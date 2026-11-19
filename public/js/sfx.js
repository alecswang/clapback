// Everything the big screen plays is synthesized here: blips, stingers and a
// lounge-funk loop. No audio files to load or license.
let ctx = null;
let out = null; // master bus
let musicBus = null;
let noise = null;
let muted = false;
let musicOn = true;
let ducked = false;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    out = ctx.createGain();
    out.gain.value = muted ? 0 : 1;
    out.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(out);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (musicOn) startMusic();
}

const live = () => ctx && ctx.state === 'running';

export function setMuted(v) {
  muted = v;
  if (out) out.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, 0.05);
}
export const isMuted = () => muted;

export function setMusic(v) {
  musicOn = v;
  if (v) startMusic();
  else stopMusic();
}
export const isMusicOn = () => musicOn;

// Plays encoded audio (the announcer's mp3) through the master bus, so mute
// applies. Resolves true when it played to the end, false if it could not play.
let current = null;
export async function playAudio(bytes) {
  if (!live()) return false;
  try {
    const buf = await ctx.decodeAudioData(bytes);
    return await new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.onended = () => resolve(true);
      current = src;
      src.start();
    });
  } catch {
    return false;
  } finally {
    current = null;
  }
}
export function stopAudio() {
  try { current?.stop(); } catch {}
}

// The announcer talks over the band, so the band gets quieter.
export function duck(v) {
  ducked = v;
  if (musicBus && seq) musicBus.gain.setTargetAtTime(v ? MUSIC_LEVEL * 0.35 : MUSIC_LEVEL, ctx.currentTime, 0.12);
}

function tone(freq, at, dur, { type = 'square', gain = 0.06, to = null, dest = out } = {}) {
  if (!live()) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function hiss(at, dur, { gain = 0.05, type = 'highpass', freq = 6000, q = 0.7, dest = out, when = null } = {}) {
  if (!live()) return;
  const t = when ?? ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  join() { tone(520, 0, 0.09); tone(780, 0.08, 0.14); },
  leave() { tone(400, 0, 0.16, { to: 220 }); },
  tick() { tone(880, 0, 0.05, { type: 'triangle', gain: 0.08 }); },
  go() { tone(330, 0, 0.1); tone(440, 0.1, 0.1); tone(660, 0.2, 0.2); },
  whoosh() { hiss(0, 0.35, { type: 'bandpass', freq: 1200, q: 0.6, gain: 0.12 }); tone(180, 0, 0.28, { type: 'sawtooth', gain: 0.03, to: 720 }); },
  // Card lands. A short rubbery boing.
  pop() { tone(260, 0, 0.16, { type: 'sine', gain: 0.16, to: 620 }); },
  // A voter tag drops onto an answer.
  drop(n = 0) { tone(700 + n * 60, 0, 0.07, { type: 'triangle', gain: 0.07 }); },
  reveal() { tone(660, 0, 0.12, { type: 'triangle', gain: 0.09 }); tone(990, 0.12, 0.25, { type: 'triangle', gain: 0.09 }); },
  stamp() { tone(140, 0, 0.22, { type: 'sawtooth', gain: 0.1, to: 60 }); hiss(0, 0.12, { type: 'lowpass', freq: 900, gain: 0.2 }); },
  // The big one. Only for a clean sweep.
  slam() {
    tone(110, 0, 0.6, { type: 'sine', gain: 0.4, to: 38 });
    hiss(0, 0.5, { type: 'lowpass', freq: 1400, gain: 0.35 });
    [392, 494, 587, 740].forEach((f) => tone(f, 0.02, 0.9, { type: 'sawtooth', gain: 0.035 }));
    [784, 988, 1175].forEach((f, i) => tone(f, 0.45 + i * 0.09, 0.3, { type: 'triangle', gain: 0.07 }));
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.13, 0.22, { type: 'triangle', gain: 0.09 }));
  },
};

// ---- the band ---------------------------------------------------------------
// Four bars at 96 bpm on a swung sixteenth grid: kick, snare, hats, a bass
// line and electric-piano stabs over a ii-V loop.

const MUSIC_LEVEL = 0.32;
const BPM = 96;
const STEP = 60 / BPM / 4;
const SWING = 0.16;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// root (bass, MIDI) and stab voicing for each bar
const BARS = [
  { root: 38, keys: [53, 57, 60, 64] }, // Dm9
  { root: 43, keys: [53, 59, 64, 67] }, // G13
  { root: 40, keys: [55, 59, 62, 66] }, // Em9-ish
  { root: 45, keys: [55, 61, 64, 67] }, // A7
];
const KICK = [0, 7, 10];
const SNARE = [4, 12];
const STABS = [3, 6, 14];
// bass: [step, semitones above root]
const BASS = [[0, 0], [3, 0], [6, 12], [8, 7], [10, 0], [11, 10], [14, 7]];

let seq = null;
let nextAt = 0;
let step = 0;

function startMusic() {
  if (!live() || seq || !musicOn) return;
  nextAt = ctx.currentTime + 0.1;
  step = 0;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(ducked ? MUSIC_LEVEL * 0.35 : MUSIC_LEVEL, ctx.currentTime, 0.8);
  seq = setInterval(schedule, 25);
}

function stopMusic() {
  if (!seq) return;
  clearInterval(seq);
  seq = null;
  if (musicBus) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
}

function schedule() {
  if (!live()) return;
  while (nextAt < ctx.currentTime + 0.15) {
    const s = step % 16;
    const bar = BARS[Math.floor(step / 16) % BARS.length];
    const t = nextAt + (s % 2 ? STEP * SWING : 0);
    play(s, bar, t);
    nextAt += STEP;
    step = (step + 1) % (16 * BARS.length);
  }
}

function play(s, bar, t) {
  const at = t - ctx.currentTime;
  const dest = musicBus;
  if (KICK.includes(s)) tone(120, at, 0.22, { type: 'sine', gain: 0.5, to: 42, dest });
  if (SNARE.includes(s)) {
    hiss(0, 0.14, { type: 'bandpass', freq: 1900, q: 0.8, gain: 0.22, dest, when: t });
    tone(210, at, 0.08, { type: 'triangle', gain: 0.12, dest });
  }
  if (s % 2 === 0 || s === 15) hiss(0, s === 14 ? 0.18 : 0.04, { freq: 7500, gain: s % 4 === 2 ? 0.07 : 0.045, dest, when: t });
  const b = BASS.find(([st]) => st === s);
  if (b) {
    const f = midi(bar.root + b[1]);
    tone(f, at, STEP * 1.6, { type: 'triangle', gain: 0.32, dest });
    tone(f * 2, at, STEP * 0.8, { type: 'sine', gain: 0.06, dest });
  }
  if (STABS.includes(s)) {
    for (const n of bar.keys) {
      tone(midi(n), at, s === 14 ? 0.32 : 0.2, { type: 'sine', gain: 0.07, dest });
      tone(midi(n) * 2, at, 0.08, { type: 'triangle', gain: 0.012, dest });
    }
  }
}
