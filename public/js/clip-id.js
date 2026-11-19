// The file name for a recorded announcer line. Shared by the browser and
// scripts/voice.js so both agree which mp3 belongs to which text.
export function clipId(text) {
  let x = 2166136261;
  for (const ch of String(text).trim()) {
    x ^= ch.codePointAt(0);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(16).padStart(8, '0');
}
