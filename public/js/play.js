import { h, chip, avatar, clock, startTicker, toast, fmt } from '/js/ui.js';
import { connect } from '/js/net.js';
import { PLAY as GAMES } from '/games/registry.js';

const params = new URLSearchParams(location.search);
// ?slot=2 gives a second identity in the same browser. Handy for testing alone.
const KEY = `loudroom.player${params.get('slot') || ''}`;
const urlCode = (params.get('code') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const auto = params.has('auto'); // self-playing phone, see /demo
const app = document.getElementById('app');

let session = load(); // { code, token, name }
let state = null;
let joined = false;
let trying = null; // join request in flight
let formError = '';
let autoJoined = false;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
function save(s) {
  session = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}

const top = h('header', { class: 'p-top' });
const main = h('main', { class: 'p-main' });
app.append(top, main, h('div', { class: 'offline-flag' }, 'Reconnecting'));

const net = connect({
  onOpen() {
    if (trying) net.send(trying);
    else if (session && (!urlCode || urlCode === session.code)) {
      trying = { t: 'join', code: session.code, name: session.name, token: session.token, resume: true };
      net.send(trying);
    } else if (!joined) showForm();
  },
  onStatus(up) {
    document.body.classList.toggle('offline', !up);
  },
  onMessage(m) {
    if (m.t === 'joined') {
      trying = null;
      joined = true;
      formError = '';
      save({ code: m.code, token: m.token, name: m.name });
    } else if (m.t === 'error') {
      const wasResume = trying && trying.resume;
      trying = null;
      joined = false;
      if (wasResume) save(null);
      formError = wasResume ? 'That room ended. Join a new one.' : m.msg;
      showForm();
    } else if (m.t === 'state') {
      clock.sync(m.now);
      state = m;
      render();
    } else if (m.t === 'toast') {
      toast(m.msg);
    } else if (m.t === 'bye') {
      net.stop();
      if (m.forget) save(null);
      joined = false;
      top.replaceChildren();
      main.dataset.key = 'bye';
      main.replaceChildren(
        h('div', { class: 'p-wait' },
          h('h1', { class: 'display' }, m.msg),
          h('button', { class: 'btn', onclick: () => location.reload() }, 'Back to the door')),
      );
    }
  },
});

const api = {
  game(payload) {
    const ok = net.send({ t: 'game', ...payload });
    if (!ok) toast('Reconnecting. Try again in a second.');
    return ok;
  },
  send: (msg) => net.send(msg),
};

startTicker();
if (auto) import('/js/autopilot.js').then((m) => m.autopilot(main));

// ---- join form ------------------------------------------------------------

function showForm() {
  top.replaceChildren();
  main.dataset.key = 'form';
  const code = h('input', {
    class: 'p-field p-code display', id: 'f-code', name: 'code', maxLength: 4, placeholder: 'ABCD', value: urlCode || '',
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, 'aria-label': 'Room code',
  });
  const name = h('input', {
    class: 'p-field', id: 'f-name', name: 'name', maxLength: 12, placeholder: 'Your name', value: (session && session.name) || '',
    autocomplete: 'off', autocapitalize: 'words', spellcheck: false, 'aria-label': 'Your name',
  });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Join');
  const err = h('div', { class: 'p-error' }, formError);
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.value.length === 4 && !name.value) name.focus();
  });
  const form = h('form', { class: 'p-form' },
    h('div', { class: 'p-logo display' }, 'Clap', h('b', null, 'back')),
    h('label', { class: 'eyebrow', htmlFor: 'f-code' }, 'Room code'), code,
    h('label', { class: 'eyebrow', htmlFor: 'f-name' }, 'Name'), name,
    err, btn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const c = code.value.trim();
    const n = name.value.trim();
    if (c.length !== 4) { err.textContent = 'The room code is four letters.'; return; }
    if (!n) { err.textContent = 'Type a name first.'; return; }
    err.textContent = '';
    trying = { t: 'join', code: c, name: n };
    if (!net.send(trying)) err.textContent = 'Connecting. Hold on.';
  });
  main.replaceChildren(form);
  if (auto && urlCode && params.get('name') && !autoJoined) {
    autoJoined = true;
    name.value = params.get('name').slice(0, 12);
    form.requestSubmit();
    return;
  }
  (urlCode ? name : code).focus();
}

// ---- joined ---------------------------------------------------------------

function wait(title, sub, ...extra) {
  return h('div', { class: 'p-wait' }, h('h1', { class: 'display' }, title), sub && h('p', null, sub), extra);
}

function render() {
  if (!joined || !state || !state.you || main.dataset.key === 'bye') return;
  const you = state.you;
  top.replaceChildren(
    chip(you),
    h('span', { class: 'p-top-right' },
      state.game ? h('span', { class: 'p-score display' }, fmt(state.game.score)) : h('span', { class: 'p-roomcode display' }, state.code)),
  );

  if (state.phase === 'game' && state.game) {
    GAMES[state.game.id].render(main, state, api);
    return;
  }

  if (state.phase === 'game') {
    setMain('sitting', () => wait('You are in the next game.'));
    return;
  }

  const meta = state.games.find((g) => g.id === state.gameId) || state.games[0];
  const ready = state.players.filter((p) => p.connected).length;
  const need = meta.min - ready;
  const vip = state.players.find((p) => p.vip);
  setMain(`lobby:${you.vip}:${need > 0 ? need : 0}:${vip ? vip.id : ''}`, () =>
    wait(
      'You are in.',
      'This is you.',
      avatar(you, 'p-guy'),
      you.vip && h('button', { class: 'btn', disabled: need > 0, onclick: () => net.send({ t: 'start', gameId: state.gameId }) },
        need > 0 ? `Need ${need} more` : `Start ${meta.name}`),
      h('button', { class: 'p-link', onclick: () => net.send({ t: 'leave' }) }, 'Leave room'),
    ));
}

function setMain(key, build) {
  if (main.dataset.key === key) return;
  main.dataset.key = key;
  main.className = 'p-main';
  main.replaceChildren(build());
}
