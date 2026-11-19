import { h, timerEl, fmt } from '/js/ui.js';

function keyOf(g) {
  switch (g.phase) {
    case 'write': {
      const next = g.prompts.find((p) => !p.done);
      return `write:${g.round}:${next ? next.mid : 'done'}`;
    }
    case 'vote': return `vote:${g.matchup.id}:${g.choice}`;
    case 'reveal': return `reveal:${g.mid}`;
    case 'fvote': return `fvote:${g.voted}`;
    default: return `${g.phase}:${g.round}`;
  }
}

export function render(root, state, api) {
  const g = state.game;
  const key = `cb:${keyOf(g)}`;
  if (root.dataset.key === key) {
    // Same screen, fresh state. If a send got lost while offline, let them retry.
    const input = root.querySelector('.p-input');
    const send = root.querySelector('[data-send]');
    if (input && send) send.disabled = !input.value.trim();
    return;
  }
  root.dataset.key = key;
  root.className = `p-main cbp cbp-${g.phase}`;
  root.replaceChildren(build(g, state, api));
  const tapped = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  if (tapped && navigator.vibrate && (g.phase === 'write' || g.phase === 'vote' || g.phase === 'fvote')) navigator.vibrate(40);
}

function wait(title, sub, ...extra) {
  return h('div', { class: 'p-wait' }, h('h1', { class: 'display' }, title), sub && h('p', null, sub), extra);
}

function build(g, state, api) {
  switch (g.phase) {
    case 'howto': return wait('How to play', 'Watch the big screen.',
      state.you.vip && h('button', { class: 'btn btn-ghost', onclick: () => api.game({ a: 'skip' }) }, 'Skip the how-to'));
    case 'intro': return wait(g.roundName, g.blurb);
    case 'write': return write(g, api);
    case 'vote': return vote(g, api);
    case 'reveal': return reveal(g);
    case 'scores': return standing(g);
    case 'fvote': return finalVote(g, api);
    case 'freveal': return finalReveal(g);
    case 'over': return over(g, state, api);
    default: return wait('Hold on.');
  }
}

function write(g, api) {
  const next = g.prompts.find((p) => !p.done);
  if (!next) return wait('Locked in.');
  const input = h('textarea', {
    class: 'p-input', id: 'f-answer', name: 'answer', rows: 3, maxLength: g.max, placeholder: 'Type something funny',
    autocomplete: 'off', autocapitalize: 'sentences', enterKeyHint: 'send', 'aria-label': 'Your answer',
  });
  // The counter only shows up once it matters.
  const count = h('span', { class: 'p-count', hidden: true }, String(g.max));
  const btn = h('button', { class: 'btn', disabled: true, 'data-send': '' }, 'Send it');
  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    btn.disabled = true;
    if (!api.game({ a: 'answer', mid: next.mid, text })) btn.disabled = false;
  };
  input.addEventListener('input', () => {
    const left = g.max - input.value.length;
    count.textContent = String(left);
    count.hidden = left > 15;
    btn.disabled = !input.value.trim();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  btn.addEventListener('click', submit);
  if (!new URLSearchParams(location.search).has('auto')) setTimeout(() => input.focus(), 50);
  return h('div', { class: 'p-stack' },
    timerEl(g),
    h('div', { class: 'p-prompt' }, next.text),
    h('div', { class: 'p-inputwrap' }, input, count),
    btn);
}

function vote(g, api) {
  const m = g.matchup;
  if (g.mySide >= 0) return wait('Yours is up.');
  if (g.choice !== null) return wait('Vote in.');
  const btns = m.answers.map((text, i) =>
    h('button', { class: `btn p-choice c${i}` }, text));
  btns.forEach((b, i) => b.addEventListener('click', () => {
    btns.forEach((x) => { x.disabled = true; });
    if (!api.game({ a: 'vote', mid: m.id, choice: i })) btns.forEach((x) => { x.disabled = false; });
  }));
  return h('div', { class: 'p-stack' },
    timerEl(g),
    h('div', { class: 'p-prompt small' }, m.prompt),
    btns);
}

function reveal(g) {
  if (!g.mine) return wait('Look up.');
  return h('div', { class: 'p-wait' },
    g.mine.tag && h('div', { class: 'p-tag display' }, 'Clapback!'),
    h('h1', { class: 'display p-big' }, `+${fmt(g.mine.points)}`));
}

function standing(g) {
  return h('div', { class: 'p-wait' }, h('h1', { class: 'display p-big' }, `#${g.rank}`));
}

function finalVote(g, api) {
  if (g.voted) return wait('Votes in.');
  const f = g.final;
  const picked = new Set();
  const btn = h('button', { class: 'btn', disabled: true, 'data-lock': '', 'data-picks': f.picks }, 'Lock it in');
  const opts = f.options.map((o) => {
    const b = h('button', { class: `p-opt ${o.own ? 'own' : ''}`, disabled: o.own },
      h('span', { class: 'p-opt-n display' }, o.i + 1),
      h('span', { class: 'p-opt-text' }, o.text),
      o.own && h('span', { class: 'p-opt-own' }, 'yours'));
    b.dataset.i = o.i;
    return b;
  });
  const paint = () => {
    opts.forEach((b) => b.classList.toggle('on', picked.has(Number(b.dataset.i))));
    btn.disabled = picked.size === 0;
  };
  opts.forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    if (picked.has(i)) picked.delete(i);
    else {
      if (picked.size >= f.picks) {
        if (f.picks > 1) return;
        picked.clear();
      }
      picked.add(i);
    }
    paint();
  }));
  btn.addEventListener('click', () => {
    btn.disabled = true;
    if (!api.game({ a: 'fvote', picks: [...picked] })) btn.disabled = false;
  });
  return h('div', { class: 'p-stack' },
    timerEl(g),
    h('div', { class: 'p-prompt small' }, f.prompt),
    f.picks > 1 && h('div', { class: 'eyebrow' }, `Pick up to ${f.picks}`),
    opts,
    btn);
}

function finalReveal(g) {
  if (!g.mine) return wait('Look up.');
  return h('div', { class: 'p-wait' },
    g.mine.tag && h('div', { class: 'p-tag display' }, 'Clapback!'),
    h('h1', { class: 'display p-big' }, `+${fmt(g.mine.points)}`));
}

function over(g, state, api) {
  const won = g.rank === 1;
  return h('div', { class: 'p-wait' },
    h('h1', { class: 'display p-big' }, won ? 'You won' : `#${g.rank}`),
    state.you.vip && h('button', { class: 'btn', onclick: () => api.send({ t: 'again' }) }, 'Play again'),
    state.you.vip && h('button', { class: 'btn btn-ghost', onclick: () => api.send({ t: 'lobby' }) }, 'Back to lobby'));
}
