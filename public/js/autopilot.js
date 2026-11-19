// Plays a phone by itself, at a pace a person can follow. Used by /demo.
// It only knows the shared phone controls, so a new game works with it as long
// as it uses them: .p-input + [data-send], .p-choice, .p-opt + [data-lock].

const LINES = [
  'your dad, twice', 'a lawsuit and a hickey', 'whatever Chad brought to the party', 'tequila and regret',
  'three DUIs and a dream', 'my ex\'s mom', 'a suspiciously damp sock', 'the walk of shame, but jogging',
  'emotional damage', 'it was consensual, barely', 'a vape that smells like sin', 'crying during sex again',
  'the night bus at 4 a.m.', 'an STD with a cool name', 'my therapist, dating me', 'a burrito I regret',
  'legally, I cannot say', 'something wet and unexplained', 'the group chat screenshots', 'a raccoon in a thong',
  'my OnlyFans for feet', 'a lukewarm threesome', 'my body count, rounded up', 'five shots of Fireball',
  'getting railed by student loans', 'daddy issues with a side of fries', 'the forbidden Tupperware',
  'a Tinder date with a cop', 'premature applause', 'one really sad orgy', 'my last two brain cells', 'a horny goose',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export async function autopilot(root) {
  const used = new Set();
  for (;;) {
    await sleep(400);

    const input = root.querySelector('.p-input');
    const send = root.querySelector('[data-send]');
    if (input && send && !input.value) {
      await sleep(rand(1200, 3200));
      let line = pick(LINES);
      for (let i = 0; i < 6 && used.has(line); i++) line = pick(LINES);
      used.add(line);
      for (const ch of line) {
        if (!input.isConnected) break;
        input.value += ch;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(rand(25, 75));
      }
      await sleep(500);
      if (send.isConnected && !send.disabled) send.click();
      continue;
    }

    if (root.querySelector('.p-choice:not(:disabled)')) {
      await sleep(rand(3000, 6000));
      const live = [...root.querySelectorAll('.p-choice:not(:disabled)')];
      if (live.length) pick(live).click();
      continue;
    }

    const lock = root.querySelector('[data-lock]');
    if (lock && lock.disabled && root.querySelector('.p-opt:not(.own):not(.on)')) {
      await sleep(rand(3500, 6500));
      const want = Number(lock.dataset.picks) || 1;
      const opts = [...root.querySelectorAll('.p-opt:not(.own)')].sort(() => Math.random() - 0.5).slice(0, want);
      for (const o of opts) {
        if (!o.isConnected) break;
        o.click();
        await sleep(500);
      }
      await sleep(500);
      if (lock.isConnected && !lock.disabled) lock.click();
    }
  }
}
