import { h, chip, avatar, timerEl, fmt, syncList, fit } from '/js/ui.js';
import { say, hush, pick } from '/js/voice.js';
import { LINES } from '/games/clapback/lines.js';

const keyOf = (g) => (g.matchup ? `${g.phase}:${g.matchup.id}` : `${g.phase}:${g.round}`);

// ---- timeline ---------------------------------------------------------------
// Each screen runs a short script of sounds, voice lines and entrances. A new
// screen cancels whatever the old one still had queued.

let run = 0;
const pending = [];
function later(ms, fn) {
  pending.push(setTimeout(fn, ms));
}
const sleep = (ms) => new Promise((r) => later(ms, r));
function cancel() {
  run += 1;
  pending.splice(0).forEach(clearTimeout);
  hush();
}
// Roughly how long a room needs to read an answer off the screen.
const readTime = (text) => Math.min(3200, 900 + String(text || '').length * 38);

// Says the line, or waits a beat when the voice is off.
async function speak(text, beat) {
  if (!(await say(text))) await sleep(beat);
}

export function render(stage, state, api) {
  const g = state.game;
  const key = `cb:${keyOf(g)}`;
  if (stage.dataset.key !== key) {
    cancel();
    stage.dataset.key = key;
    stage.className = `stage cb cb-p-${g.phase}`;
    const view = build(g, api);
    stage.replaceChildren(view.el);
    patch(stage, g);
    fit(stage);
    // Overlays go in after fit so they never count as overflow.
    if (view.banner) stage.append(view.banner);
    direct(stage, g, api.sfx, { ...view, api });
    return;
  }
  patch(stage, g);
}

function build(g, api) {
  switch (g.phase) {
    case 'howto': return { el: howTo() };
    case 'intro': return { el: intro(g) };
    case 'write': return { el: write(g) };
    case 'vote': return { el: duel(g) };
    case 'reveal': return duelReveal(g);
    case 'scores': return { el: scores(g) };
    case 'fvote': return { el: finalVote(g) };
    case 'freveal': return finalReveal(g);
    case 'over': return { el: over(g, api) };
    default: return { el: h('div') };
  }
}

function direct(stage, g, sfx, view) {
  const my = run;
  const live = () => my === run;
  if (g.phase === 'howto') {
    howToScript(stage, sfx, live, view.api);
  } else if (g.phase === 'intro') {
    sfx.whoosh();
    later(250, () => sfx.pop());
    later(400, () => say(pick(LINES.intro[g.round])));
  } else if (g.phase === 'write') {
    sfx.go();
    (async () => {
      await sleep(500);
      if (!live()) return;
      if (g.round === 3) {
        await speak(pick(LINES.pileOn), 0);
        if (live()) say(g.prompt);
      } else say(pick(LINES.write));
    })();
  } else if (g.phase === 'vote') {
    voteScript(stage, g, sfx, live);
  } else if (g.phase === 'reveal') {
    revealScript(g, sfx, view);
  } else if (g.phase === 'scores') {
    sfx.reveal();
    later(900, () => say(pick(LINES.scores)));
  } else if (g.phase === 'fvote') {
    sfx.whoosh();
    g.final.answers.forEach((_, i) => later(450 + i * 120, () => sfx.drop(i)));
    (async () => {
      await sleep(400);
      if (!live()) return;
      await speak(g.final.prompt, 0);
      if (live()) say(pick(LINES.fvote));
    })();
  } else if (g.phase === 'freveal') {
    sfx.reveal();
    const sweep = g.final.rows.find((r) => r.tag === 'CLAPBACK');
    const fav = g.final.rows.find((r) => r.top);
    if (sweep) {
      later(FINAL_TB * 1000 + 150, () => sfx.slam());
      later(FINAL_TB * 1000 + 950, () => say(pick(LINES.sweep)));
    } else if (fav) {
      later(2200, () => say(pick(LINES.favorite)));
    }
  } else if (g.phase === 'over') {
    sfx.win();
    const winners = g.board.filter((r) => r.rank === 1);
    later(1200, () => say(winners.length === 1 ? pick(LINES.over) : pick(LINES.overTie)));
  }
}

// Prompt first, read aloud. The answers are not read (that would need live,
// paid voice generation), they land on beats the room can read along to.
async function voteScript(stage, g, sfx, live) {
  const m = g.matchup;
  const sides = stage.querySelectorAll('.cb-side');
  const vs = stage.querySelector('.cb-vs');
  const land = (el) => {
    el.classList.add('in');
    sfx.pop();
  };
  // Safety net: the cards show up even if a step below stalls.
  later(9000, () => [...sides, vs].forEach((el) => el.classList.add('in')));
  sfx.whoosh();
  await sleep(500);
  if (!live()) return;
  await speak(m.prompt, 400);
  if (!live()) return;
  land(sides[0]);
  await sleep(readTime(m.answers[0]));
  if (!live()) return;
  vs.classList.add('in');
  await speak(pick(LINES.or), 300);
  if (!live()) return;
  land(sides[1]);
}

function revealScript(g, sfx, view) {
  const m = g.matchup;
  const { tp, tb, order } = view.times;
  later(400, () => sfx.pop());
  order.forEach((d, n) => later(d * 1000, () => sfx.drop(n)));
  later(tp * 1000, () => sfx.reveal());
  const knockout = m.sides.some((s) => s.tag === 'CLAPBACK');
  const stamped = m.sides.some((s) => s.tag && s.tag !== 'CLAPBACK');
  if (knockout) later(tb * 1000 + 150, () => sfx.slam());
  else if (stamped) later(tb * 1000, () => sfx.stamp());
  let pool = null;
  if (knockout) pool = LINES.knockout;
  else if (m.kind === 'forfeit') pool = LINES.forfeit;
  else if (LINES[m.kind] && m.kind !== 'vote') pool = LINES[m.kind];
  else if (m.winner >= 0 && Math.random() < 0.6) pool = LINES.win;
  if (pool) later((tb + (knockout ? 0.8 : 0.3)) * 1000, () => say(pick(pool)));
}

function patch(stage, g) {
  if (g.phase === 'write') {
    syncList(
      stage.querySelector('[data-writers]'),
      g.writers,
      (p) => p.id,
      (p) => chip(p, 'cb-writer'),
      (el, p) => el.classList.toggle('done', p.done),
    );
  }
}

// ---- screens ----------------------------------------------------------------

const promptEl = (text) => h('div', { class: 'cb-prompt' },
  h('div', { class: 'cb-prompt-text display' }, text));

// ---- how to play ----
// One slide per narration line. Each slide is a little picture of the step.
function howTo() {
  const mini = (cls, text) => h('div', { class: `cb-mini ${cls}` }, text);
  const slides = [
    [h('h1', { class: 'cb-title display' }, 'How to play')],
    [h('div', { class: 'cb-ht-phone' }, mini('q', 'A terrible name for a strip club'), mini('field', 'type here_'))],
    [h('div', { class: 'cb-ht-duel' }, mini('a', 'Answer one'), h('span', { class: 'cb-vs display in' }, 'vs'), mini('a', 'Answer two'))],
    [h('div', { class: 'cb-ht-duel' }, mini('a win', 'Every vote'), h('span', { class: 'cb-ht-stamp display' }, 'Clapback!'))],
    [h('div', { class: 'cb-ht-rounds' }, h('b', { class: 'display' }, '1'), h('b', { class: 'display' }, '2\u00d7'), h('b', { class: 'display' }, 'All'))],
    [h('h1', { class: 'cb-title display' }, 'Phones out')],
  ];
  return h('div', { class: 'cb-howto' },
    h('div', { class: 'cb-ht-slides' }, slides.map((kids, i) =>
      h('div', { class: 'cb-ht-slide', 'data-i': i }, kids, h('p', { class: 'cb-ht-text' }, LINES.howto[i])))),
    h('p', { class: 'cb-ht-skip' }, 'Space or Skip to jump ahead'));
}

async function howToScript(stage, sfx, live, api) {
  const slides = stage.querySelectorAll('.cb-ht-slide');
  for (let i = 0; i < slides.length; i++) {
    if (!live()) return;
    slides.forEach((s, j) => s.classList.toggle('on', j === i));
    sfx.whoosh();
    await speak(LINES.howto[i], 400);
    await sleep(i === slides.length - 1 ? 300 : 700);
  }
  if (live() && api) api.game({ a: 'skip' });
}

function intro(g) {
  return h('div', { class: 'cb-intro' },
    h('h1', { class: 'cb-title display grad' }, g.roundName),
    g.blurb && h('p', { class: 'cb-blurb' }, g.blurb));
}

function write(g) {
  return h('div', { class: 'cb-write' },
    g.round === 3 ? promptEl(g.prompt) : h('h1', { class: 'cb-title display grad' }, 'Get typing'),
    timerEl(g, 'big'),
    h('div', { class: 'cb-writers', 'data-writers': '' }));
}

function sizeClass(text) {
  if (text == null) return 'blank';
  if (text.length > 42) return 'long';
  if (text.length <= 22) return 'short';
  return '';
}

function bubble(text, i, extra) {
  return h('div', { class: `cb-answer a${i} ${sizeClass(text)}` },
    h('div', { class: 'cb-answer-text' }, text == null ? 'No answer' : text),
    extra);
}

function duel(g) {
  const m = g.matchup;
  return h('div', { class: 'cb-duel is-vote' },
    promptEl(m.prompt),
    h('div', { class: 'cb-answers' },
      h('div', { class: 'cb-side s0' }, bubble(m.answers[0], 0), h('div', { class: 'cb-under' })),
      h('div', { class: 'cb-vs display' }, 'vs'),
      h('div', { class: 'cb-side s1' }, bubble(m.answers[1], 1), h('div', { class: 'cb-under' }))),
    h('div', { class: 'cb-foot' }, timerEl(g)));
}

// The cards say who won. A line is only needed when nobody did.
const VERDICT = { tie: 'Tie', jinx: 'Jinx', novotes: 'No votes', empty: 'Nobody answered' };

function duelReveal(g) {
  const m = g.matchup;
  // Voter tags land one at a time, alternating sides, so the winner is not
  // obvious until the last few drop.
  const queues = m.sides.map((s) => s.voters.map((v) => ({ v })));
  const order = [];
  let d = 1.1;
  for (let k = 0; queues[0].length || queues[1].length; k++) {
    const q = queues[k % 2].length ? queues[k % 2] : queues[1 - (k % 2)];
    const item = q.shift();
    item.v.d = d;
    order.push(d);
    d += 0.18;
  }
  const tp = Math.max(2.3, d + 0.25); // points and win/lose
  const tb = tp + 0.7; // stamp or banner
  const knockout = m.sides.findIndex((s) => s.tag === 'CLAPBACK');

  const side = (s, i) => {
    const cls = ['cb-side', `s${i}`];
    if (m.winner === i) cls.push('win');
    else if (m.winner >= 0) cls.push('lose');
    const stamp = s.tag && s.tag !== 'CLAPBACK' && h('div', { class: 'cb-stamp display' }, s.tag);
    // Each vote is a chip in the voter's color that drops onto the answer.
    const votes = h('div', { class: 'cb-voters' }, s.voters.map((v) =>
      h('span', { class: 'cb-voter', style: `--d:${v.d.toFixed(2)}s` }, chip(v))));
    return h('div', { class: cls.join(' ') },
      bubble(s.text, i, [h('div', { class: 'cb-points' }, `+${fmt(s.points)}`), stamp, votes]),
      h('div', { class: 'cb-under' },
        h('span', { class: 'cb-by' }, 'by'),
        h('div', { class: 'cb-author' }, chip(s.author)),
        h('span', { class: 'cb-count' }, `${s.voters.length} ${s.voters.length === 1 ? 'vote' : 'votes'}`)));
  };

  const el = h('div', { class: `cb-duel is-reveal ${knockout >= 0 ? 'knock' : ''}`, style: `--tp:${tp.toFixed(2)}s;--tb:${tb.toFixed(2)}s` },
    promptEl(m.prompt),
    h('div', { class: 'cb-answers' },
      side(m.sides[0], 0),
      h('div', { class: 'cb-vs display' }, 'vs'),
      side(m.sides[1], 1)),
    h('div', { class: 'cb-foot' }, VERDICT[m.kind] && h('div', { class: 'cb-verdict display' }, VERDICT[m.kind])));

  // The rare one. Full-width banner across the whole screen.
  const banner = knockout >= 0 && bannerEl(tb, `${m.sides[knockout].author.name} took every vote`);

  return { el, banner, times: { tp, tb, order } };
}

function boardRows(board) {
  const max = Math.max(1, ...board.map((r) => r.score));
  return h('div', { class: 'cb-board' }, board.map((r, i) =>
    h('div', { class: 'cb-row', style: `--i:${i};--c:${r.color}` },
      h('span', { class: 'cb-rank display' }, r.rank),
      h('span', { class: 'cb-row-who' }, avatar(r), h('span', { class: 'cb-row-name' }, r.name)),
      h('span', { class: 'cb-row-bar' }, h('span', { style: `width:${Math.max(1.5, (r.score / max) * 100).toFixed(1)}%` })),
      h('span', { class: 'cb-row-score display' }, fmt(r.score)),
      h('span', { class: 'cb-row-delta' }, r.delta ? `+${fmt(r.delta)}` : ''))));
}

function scores(g) {
  return h('div', { class: 'cb-scores' },
    h('h1', { class: 'cb-title display small grad' }, 'Scoreboard'),
    boardRows(g.board));
}

function finalVote(g) {
  const f = g.final;
  return h('div', { class: 'cb-final' },
    promptEl(f.prompt),
    h('div', { class: `cb-grid n${f.answers.length}` }, f.answers.map((text, i) =>
      h('div', { class: 'cb-tile', style: `--i:${i}` },
        h('span', { class: 'cb-tile-n display' }, i + 1),
        h('span', { class: 'cb-tile-text' }, text)))),
    h('div', { class: 'cb-foot' }, timerEl(g)));
}

const FINAL_TB = 2.6;

function bannerEl(tb, sub) {
  return h('div', { class: 'cb-banner', style: `--tb:${tb.toFixed(2)}s`, 'aria-hidden': 'true' },
    h('div', { class: 'cb-band' },
      h('div', { class: 'cb-band-word display grad' }, 'Clapback!'),
      h('div', { class: 'cb-band-sub display' }, sub)));
}

function finalReveal(g) {
  const f = g.final;
  if (!f.rows.length) {
    return { el: h('div', { class: 'cb-final' }, promptEl(f.prompt), h('div', { class: 'cb-verdict display' }, 'Nobody answered')) };
  }
  const sweep = f.rows.find((r) => r.tag === 'CLAPBACK');
  const el = h('div', { class: `cb-final is-reveal ${sweep ? 'knock' : ''}`, style: `--tb:${FINAL_TB}s` },
    promptEl(f.prompt),
    h('div', { class: `cb-grid n${f.rows.length}` }, f.rows.map((r, i) =>
      h('div', { class: `cb-tile ${r.top ? 'win' : ''} ${r.tag ? 'stamped' : ''}`, style: `--i:${i}` },
        h('span', { class: 'cb-tile-text' }, r.text),
        h('span', { class: 'cb-tile-meta' },
          chip(r.author),
          h('span', { class: 'cb-tile-points display' }, `+${fmt(r.points)}`)),
        r.tag && h('span', { class: 'cb-stamp display' }, 'Clapback!')))));
  return { el, banner: sweep && bannerEl(FINAL_TB, `${sweep.author.name} got every vote`) };
}

function confetti() {
  const colors = ['#ff4b2b', '#ffd23f', '#2f5cff', '#111111', '#ff7eb6', '#00a99d'];
  const bits = [];
  for (let i = 0; i < 70; i++) {
    const style = [
      `left:${(Math.random() * 100).toFixed(1)}%`,
      `background:${colors[i % colors.length]}`,
      `color:${colors[i % colors.length]}`,
      `animation-delay:${(Math.random() * 3).toFixed(2)}s`,
      `animation-duration:${(3 + Math.random() * 3).toFixed(2)}s`,
      `--r:${Math.floor(Math.random() * 360)}deg`,
      `--s:${(0.6 + Math.random() * 0.9).toFixed(2)}`,
    ].join(';');
    bits.push(h('i', { style }));
  }
  return h('div', { class: 'cb-confetti', 'aria-hidden': 'true' }, bits);
}

function over(g, api) {
  const winners = g.board.filter((r) => r.rank === 1);
  const names = winners.map((w) => w.name).join(' & ');
  const headline = winners.length === 1 ? `${names} wins` : winners.length === 2 ? `${names} win` : `${winners.length}-way tie`;
  return h('div', { class: 'cb-over' },
    confetti(),
    h('div', { class: 'cb-champs' }, winners.map((w) => avatar(w, 'cb-champ'))),
    h('h1', { class: `cb-winner display grad ${winners.length === 2 ? 'duo' : ''}` }, headline),
    boardRows(g.board),
    h('div', { class: 'cb-over-btns' },
      h('button', { class: 'btn', onclick: () => api.send({ t: 'again' }) }, 'Play again'),
      h('button', { class: 'btn btn-ghost', onclick: () => api.send({ t: 'lobby' }) }, 'Back to lobby')));
}

// The room went back to the lobby. Stop talking.
export function leave() {
  cancel();
}
