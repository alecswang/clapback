import { CAST, castSvg } from './cast.js';

// Tiny DOM helpers shared by the big screen and the phones.
// Text always goes in as text nodes, so player names and answers cannot inject markup.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k === 'html') el.innerHTML = v; // trusted markup only (the server-made QR code)
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && !k.startsWith('data-')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === true) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Keeps a container's children matched to a list without rebuilding the ones
// already there, so entrance animations only play for new items.
export function syncList(parent, items, keyOf, create, update) {
  const existing = new Map([...parent.children].map((el) => [el.dataset.key, el]));
  let prev = null;
  for (const item of items) {
    const k = String(keyOf(item));
    let el = existing.get(k);
    if (el) existing.delete(k);
    else {
      el = create(item);
      el.dataset.key = k;
    }
    if (update) update(el, item);
    const want = prev ? prev.nextSibling : parent.firstChild;
    if (el !== want) parent.insertBefore(el, want);
    prev = el;
  }
  for (const el of existing.values()) el.remove();
}

export const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Every player is one character from the cast, with their color printed behind it.
// The server picks the character; old states without one fall back to a name hash.
export function avatar(p, extra = '') {
  const c = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#ff4b2b';
  let i = Number.isInteger(p.guy) ? p.guy : -1;
  if (i < 0 || i >= CAST.length) {
    i = 0;
    for (const ch of String(p.name || '?')) i = (i * 31 + ch.codePointAt(0)) >>> 0;
    i %= CAST.length;
  }
  return h('span', { class: `avatar ${extra}`.trim(), 'aria-hidden': 'true', html: castSvg(CAST[i], c) });
}

// A pointer cursor in the player's color. Used for votes landing on answers.
export function cursor(p) {
  const c = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#1428ff';
  return h('span', {
    class: 'cursor',
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 16 22"><path d="M1 1v17.5l4.6-4.3 3 6.8 3.1-1.4-3-6.6H15Z" fill="${c}" stroke="#0a0a0a" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  });
}

export function chip(p, extra = '') {
  return h(
    'span',
    { class: `chip ${extra}`.trim(), style: `--c:${p.color}` },
    avatar(p, 'chip-dot'),
    h('span', { class: 'chip-name' }, p.name),
  );
}

// Server time, so every screen counts down to the same instant.
export const clock = {
  offset: 0,
  sync(serverNow) {
    this.offset = serverNow - Date.now();
  },
  now() {
    return Date.now() + this.offset;
  },
};

export function timerEl(view, extra = '') {
  if (!view.endsAt) return null;
  return h(
    'div',
    { class: `timer ${extra}`.trim(), 'data-ends': view.endsAt, 'data-total': view.total },
    h('span', { class: 'timer-num', 'data-num': '' }),
    h('span', { class: 'timer-track' }, h('span', { class: 'timer-bar', 'data-bar': '' })),
  );
}

export function startTicker(onSecond) {
  const tick = () => {
    const now = clock.now();
    for (const el of document.querySelectorAll('[data-ends]')) {
      const left = Math.max(0, Number(el.dataset.ends) - now);
      const total = Number(el.dataset.total) || 0;
      const secs = Math.ceil(left / 1000);
      const num = el.querySelector('[data-num]');
      if (num && num.textContent !== String(secs)) {
        const first = num.textContent === '';
        num.textContent = String(secs);
        if (onSecond && !first) onSecond(secs, total);
      }
      const bar = el.querySelector('[data-bar]');
      if (bar && total) bar.style.transform = `scaleX(${Math.min(1, left / total)})`;
      el.classList.toggle('urgent', secs <= 5 && total > 8000);
    }
  };
  tick();
  return setInterval(tick, 100);
}

let toastTimer = null;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Safety net for the big screen: if a view is taller or wider than the stage
// (ten players, long answers), shrink it to fit instead of clipping.
export function fit(stage) {
  const inner = stage.firstElementChild;
  if (!inner) return;
  inner.style.scale = '';
  const cs = getComputedStyle(stage);
  const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const k = Math.min(1, availH / inner.scrollHeight, availW / inner.scrollWidth);
  if (k < 0.995) inner.style.scale = k.toFixed(3);
}
