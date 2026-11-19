// Runs a whole game with nobody at the controls: one big screen and four
// phones on autopilot, all talking to the real server.

const NAMES = ['Mango', 'Biscuit', 'Tofu', 'Pickle'];
const CAPTIONS = [
  ['lobby', 'Lobby', 'Phones join by code or QR.'],
  ['cb:howto', 'How to play', 'Narrated walkthrough before round one. Skip or Space jumps ahead.'],
  ['cb:intro', 'Round intro', ''],
  ['cb:write', 'Writing', 'Each phone gets two random prompts from the deck. Two players answer each one.'],
  ['cb:vote', 'Vote', 'Everyone but the two authors votes.'],
  ['cb:reveal', 'Reveal', 'The stamp only lands when one answer takes every vote.'],
  ['cb:scores', 'Scoreboard', ''],
  ['cb:fvote', 'Final round', 'One prompt for everyone.'],
  ['cb:freveal', 'Final reveal', ''],
  ['cb:over', 'Winner', ''],
];

const hostFrame = document.getElementById('host');
const ROUND = Math.min(3, Math.max(1, Number(new URLSearchParams(location.search).get('round')) || 1));
hostFrame.src = `/host?demo=1&round=${ROUND}`;
document.querySelector(`#rounds [data-r="${ROUND}"]`)?.classList.add('on');
const phonesEl = document.getElementById('phones');
const caption = document.getElementById('caption');
const soundHint = document.getElementById('sound');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = fn();
      if (v) return v;
    } catch { /* frame still loading */ }
    await sleep(150);
  }
  return null;
}

function say(label, text) {
  caption.replaceChildren();
  if (label) {
    const b = document.createElement('b');
    b.textContent = label;
    caption.append(b);
  }
  caption.append(text);
}

function layout() {
  const narrow = innerWidth <= 900;
  const room = document.querySelector('.demo-grid').clientHeight - 28 - 12;
  const s = narrow ? Math.min(0.5, (innerWidth - 28 - 36) / 4 / 396) : Math.max(0.3, Math.min(0.62, room / 2 / 766));
  phonesEl.style.setProperty('--s', s.toFixed(3));
}
addEventListener('resize', layout);

const frames = NAMES.map((name) => {
  const wrap = document.createElement('div');
  wrap.className = 'demo-phone';
  const f = document.createElement('iframe');
  f.title = `${name}'s phone`;
  wrap.append(f);
  phonesEl.append(wrap);
  return f;
});
layout();

// A real click here counts for the frames too, so the big screen can make noise.
addEventListener('pointerdown', () => {
  try {
    hostFrame.contentWindow.dispatchEvent(new Event('pointerdown'));
    soundHint.textContent = 'Sound on';
  } catch { /* not ready */ }
});
document.getElementById('restart').addEventListener('click', () => location.reload());

const hostDoc = () => hostFrame.contentDocument;
const stageKey = () => hostDoc().querySelector('.stage').dataset.key || '';

async function run() {
  const code = await waitFor(() => {
    const tiles = [...hostDoc().querySelectorAll('.code-tile')].map((t) => t.textContent).join('');
    return tiles.length === 4 ? tiles : null;
  });
  if (!code) {
    say('Stuck', 'The big screen did not open a room. Is the server running?');
    return;
  }

  say('Lobby', `Room ${code} is open. Four fake phones are joining.`);
  for (let i = 0; i < frames.length; i++) {
    await sleep(i ? 1100 : 600);
    frames[i].src = `/?code=${code}&slot=demo${i + 1}&auto=1&name=${encodeURIComponent(NAMES[i])}`;
  }

  const ready = await waitFor(() => {
    const btn = hostDoc().querySelector('.btn-start');
    return hostDoc().querySelectorAll('.roster-chip').length === frames.length && btn && !btn.disabled ? btn : null;
  });
  if (!ready) {
    say('Stuck', 'The phones did not all make it in. Press Restart demo.');
    return;
  }
  await sleep(ROUND > 1 ? 1200 : 3500);
  hostDoc().querySelector('.btn-start').click();

  // Narrate whatever the big screen is showing.
  let last = '';
  for (;;) {
    await sleep(200);
    let key = '';
    try {
      key = stageKey();
    } catch {
      continue;
    }
    const hit = CAPTIONS.find(([prefix]) => key.startsWith(prefix));
    if (!hit || hit[0] === last) continue;
    last = hit[0];
    say(hit[1], hit[2]);
  }
}

run();
