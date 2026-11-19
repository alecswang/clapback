import { h, chip, clock, startTicker, syncList, toast, fit } from '/js/ui.js';
import { connect } from '/js/net.js';
import { sfx, unlock, setMuted, isMuted, setMusic, isMusicOn } from '/js/sfx.js';
import { setVoice, voiceOn, hush } from '/js/voice.js';
import { HOST as GAMES } from '/games/registry.js';

const KEY = 'loudroom.host';
// ?demo makes a throwaway room that never touches the saved one.
const demo = new URLSearchParams(location.search).has('demo');
// The demo can start at a later round (?round=2 or 3).
const demoRound = demo ? Number(new URLSearchParams(location.search).get('round')) || 1 : 1;
const app = document.getElementById('app');

let info = null; // { code, hostKey, joinUrl, joinHost, qr }
let state = null;
let prevCount = 0;

const saved = () => {
  if (demo) return info ? { code: info.code, hostKey: info.hostKey } : null;
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
};

// ---- frame ----------------------------------------------------------------

const topJoin = h('div', { class: 'top-join' });
const stage = h('main', { class: 'stage' });
const btnSkip = h('button', { class: 'ctl', title: 'Space', onclick: () => skip() }, 'Skip');
const btnEnd = h('button', { class: 'ctl', onclick: () => endGame() }, 'End game');
const btnNew = h('button', { class: 'ctl', onclick: () => newRoom() }, 'New room');
const btnSound = h('button', { class: 'ctl', title: 'M', onclick: () => toggleSound() }, 'Sound on');
const btnMusic = h('button', { class: 'ctl', onclick: () => toggleMusic() }, 'Music on');
const btnVoice = h('button', { class: 'ctl', onclick: () => toggleVoice() }, 'Voice on');
const btnFull = h('button', { class: 'ctl', title: 'F', onclick: () => fullscreen() }, 'Fullscreen');

app.append(
  h('header', { class: 'top' }, h('div', { class: 'logo display' }, 'Clap', h('b', null, 'back')), topJoin),
  stage,
  h('footer', { class: 'ctls' }, btnSkip, btnEnd, btnNew, btnSound, btnMusic, btnVoice, btnFull),
  h('div', { class: 'offline-flag' }, 'Reconnecting'),
);

// ---- network --------------------------------------------------------------

const net = connect({
  onOpen() {
    const s = saved();
    net.send(s ? { t: 'host:resume', code: s.code, hostKey: s.hostKey } : { t: 'host:create' });
  },
  onStatus(up) {
    document.body.classList.toggle('offline', !up);
  },
  onMessage(m) {
    if (m.t === 'hosted') {
      if (!info || info.code !== m.code) stage.dataset.key = '';
      info = m;
      if (!demo) localStorage.setItem(KEY, JSON.stringify({ code: m.code, hostKey: m.hostKey }));
      render();
    } else if (m.t === 'error' && m.code === 'noroom') {
      if (!demo) localStorage.removeItem(KEY);
      net.send({ t: 'host:create' });
    } else if (m.t === 'state') {
      clock.sync(m.now);
      state = m;
      const count = m.players.filter((p) => p.connected).length;
      if (m.phase === 'lobby' && count > prevCount) sfx.join();
      prevCount = count;
      render();
    } else if (m.t === 'toast') {
      toast(m.msg);
    } else if (m.t === 'bye') {
      net.stop();
      stage.dataset.key = 'bye';
      stage.className = 'stage bye';
      stage.replaceChildren(
        h('div', { class: 'bye-card' },
          h('h1', { class: 'display' }, m.msg),
          h('button', { class: 'btn', onclick: () => location.reload() }, 'Take it back')),
      );
    }
  },
});

const api = {
  game: (payload) => net.send({ t: 'game', ...payload }),
  send: (msg) => net.send(msg),
  sfx,
};

// ---- controls -------------------------------------------------------------

function skip() {
  if (state && state.phase === 'game' && state.game.phase !== 'over') api.game({ a: 'skip' });
}

let endArmed = 0;
function endGame() {
  if (Date.now() - endArmed < 3000) {
    net.send({ t: 'end' });
    endArmed = 0;
    btnEnd.textContent = 'End game';
    return;
  }
  endArmed = Date.now();
  btnEnd.textContent = 'Click again to end';
  setTimeout(() => {
    if (Date.now() - endArmed >= 3000) btnEnd.textContent = 'End game';
  }, 3100);
}

function newRoom() {
  if (!demo) localStorage.removeItem(KEY);
  net.send({ t: 'host:create' });
}

function toggleSound() {
  setMuted(!isMuted());
  if (isMuted()) hush();
  btnSound.textContent = isMuted() ? 'Sound off' : 'Sound on';
}

function toggleMusic() {
  setMusic(!isMusicOn());
  btnMusic.textContent = isMusicOn() ? 'Music on' : 'Music off';
}

function toggleVoice() {
  setVoice(!voiceOn());
  btnVoice.textContent = voiceOn() ? 'Voice on' : 'Voice off';
}

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function start() {
  if (state && state.phase === 'lobby') net.send({ t: 'start', gameId: state.gameId, round: demoRound });
}

let wake = null;
async function keepAwake() {
  try {
    if (navigator.wakeLock && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch { /* not allowed, fine */ }
}

window.addEventListener('pointerdown', () => { unlock(); keepAwake(); });
window.addEventListener('keydown', (e) => {
  unlock();
  keepAwake();
  if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (!state) return;
    if (state.phase === 'lobby') start();
    // Space will not cut the writing phase short. That one needs the button.
    else if (state.game.phase !== 'write') skip();
  } else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if (e.key === 'f' || e.key === 'F') fullscreen();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });
window.addEventListener('resize', () => fit(stage));

startTicker((secs, total) => {
  if (secs > 0 && secs <= 5 && total > 8000) sfx.tick();
});

// ---- render ---------------------------------------------------------------

function render() {
  if (!info || !state || stage.dataset.key === 'bye') return;
  const inGame = state.phase === 'game';
  document.body.classList.toggle('in-game', inGame);
  // The big ink shapes rearrange on every phase, like a new print.
  document.body.dataset.scene = inGame ? state.game.phase : 'lobby';
  btnSkip.hidden = !inGame || state.game.phase === 'over';
  btnEnd.hidden = !inGame;
  btnNew.hidden = inGame;
  topJoin.replaceChildren(
    h('span', { class: 'top-join-url' }, info.joinHost),
    h('span', { class: 'top-join-code display' }, info.code),
  );

  if (!inGame) {
    for (const game of Object.values(GAMES)) if (game.leave) game.leave();
    renderLobby();
    return;
  }
  GAMES[state.game.id].render(stage, state, api);
}

function renderLobby() {
  if (stage.dataset.key !== 'lobby') {
    stage.dataset.key = 'lobby';
    stage.className = 'stage lobby';
    stage.replaceChildren(
      h('section', { class: 'lobby-join' },
        h('div', { class: 'eyebrow' }, 'On your phone, go to'),
        h('div', { class: 'join-url display', style: `--len:${Math.max(17, info.joinHost.length)}` }, info.joinHost),
        h('div', { class: 'join-row' },
          h('div', null,
            h('div', { class: 'eyebrow' }, 'Room code'),
            h('div', { class: 'code-tiles' }, [...info.code].map((c) => h('span', { class: 'code-tile display' }, c)))),
          h('div', { class: 'qr', html: info.qr }))),
      h('section', { class: 'lobby-side' },
        h('div', { class: 'panel roster-panel' },
          h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow', 'data-count': '' })),
          h('div', { class: 'roster', 'data-roster': '' }),
          h('div', { class: 'roster-empty', 'data-empty': '' }, 'Waiting for the first phone.')),
        h('div', { class: 'game-card', 'data-gamecard': '' })),
    );
  }

  const live = state.players;
  const ready = live.filter((p) => p.connected).length;
  const meta = state.games.find((g) => g.id === state.gameId) || state.games[0];

  stage.querySelector('[data-count]').textContent = `Players ${live.length}/10`;
  stage.querySelector('[data-empty]').hidden = live.length > 0;
  syncList(
    stage.querySelector('[data-roster]'),
    live,
    (p) => p.id,
    (p) => {
      const el = chip(p, 'roster-chip');
      el.append(h('button', { class: 'chip-x', title: 'Remove', onclick: () => net.send({ t: 'kick', pid: p.id }) }, '×'));
      return el;
    },
    (el, p) => {
      el.classList.toggle('away', !p.connected);
      el.classList.toggle('vip', p.vip);
    },
  );

  const need = meta.min - ready;
  const card = stage.querySelector('[data-gamecard]');
  const decks = meta.decks || [];
  const deckId = (state.settings && state.settings.deck) || (decks[0] && decks[0].id);
  const deck = decks.find((d) => d.id === deckId) || decks[0];
  const cardKey = `${meta.id}:${need > 0 ? need : 0}:${deckId}`;
  if (card.dataset.key !== cardKey) {
    card.dataset.key = cardKey;
    card.replaceChildren(
      h('div', { class: 'game-name display' }, meta.name),
      h('p', { class: 'game-tag' }, meta.tagline),
      h('div', { class: 'game-row' },
        h('button', { class: 'btn btn-start', disabled: need > 0, onclick: start },
          need > 0 ? `Need ${need} more` : 'Start game'),
      ),
      decks.length > 1 && h('div', { class: 'deck-pick' },
        h('span', { class: 'deck-label' }, 'Prompts'),
        decks.map((d) => h('button', {
          class: `deck-chip ${d.id === deckId ? 'on' : ''}`,
          onclick: () => net.send({ t: 'set', deck: d.id }),
        }, d.name))),
      deck && h('p', { class: 'deck-blurb' }, deck.blurb),
    );
  }
}
