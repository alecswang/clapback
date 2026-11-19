'use strict';

const WebSocket = require('ws');

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
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

// A player that answers and votes on its own. `delay` makes it feel human.
class Bot {
  constructor(url, code, name, opts = {}) {
    this.url = url;
    this.code = code;
    this.name = name;
    this.opts = { answer: true, vote: true, delay: [0, 0], ...opts };
    this.token = opts.token || null;
    this.state = null;
    this.log = [];
    this.sent = new Set();
    this.errors = [];
    this.toasts = [];
  }

  async connect() {
    this.ws = await openSocket(this.url);
    this.ws.on('message', (raw) => this.onMessage(JSON.parse(raw)));
    this.send({ t: 'join', code: this.code, name: this.name, token: this.token });
    await this.until(() => this.token || this.errors.length, 2000);
    return this;
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    if (this.ws) this.ws.close();
  }

  async until(fn, ms = 5000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await sleep(5);
    }
    throw new Error(`${this.name}: timed out waiting`);
  }

  once(key, fn) {
    if (this.sent.has(key)) return;
    this.sent.add(key);
    const [lo, hi] = this.opts.delay;
    const d = lo + Math.random() * (hi - lo);
    if (d > 0) setTimeout(fn, d);
    else fn();
  }

  onMessage(m) {
    if (m.t === 'joined') this.token = m.token;
    else if (m.t === 'error') this.errors.push(m);
    else if (m.t === 'toast') this.toasts.push(m.msg);
    else if (m.t === 'bye') this.bye = m;
    else if (m.t === 'state') {
      this.state = m;
      this.log.push(m);
      if (m.game) this.play(m.game);
    }
  }

  play(g) {
    if (g.phase === 'write' && this.opts.answer) {
      for (const p of g.prompts) {
        if (p.done) continue;
        this.once(`a:${g.endsAt}:${p.mid}`, () => this.send({ t: 'game', a: 'answer', mid: p.mid, text: this.opts.line || pick(LINES) }));
      }
    } else if (g.phase === 'vote' && this.opts.vote && g.mySide < 0 && g.choice === null) {
      this.once(`v:${g.endsAt}:${g.matchup.id}`, () => this.send({ t: 'game', a: 'vote', mid: g.matchup.id, choice: Math.random() < 0.5 ? 0 : 1 }));
    } else if (g.phase === 'fvote' && this.opts.vote && !g.voted) {
      const open = g.final.options.filter((o) => !o.own).map((o) => o.i);
      const picks = open.sort(() => Math.random() - 0.5).slice(0, g.final.picks);
      if (picks.length) this.once(`f:${g.endsAt}`, () => this.send({ t: 'game', a: 'fvote', picks }));
    }
  }
}

module.exports = { Bot, openSocket, sleep, pick, LINES };
