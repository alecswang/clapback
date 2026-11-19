'use strict';

const { DECKS, deckById } = require('./decks');

// Prompts already drawn, per deck, shared by every room on this server, so a
// new room or a rematch keeps getting prompts nobody has seen recently.
const SEEN = {};

// Clapback: everyone answers prompts in secret, the room votes on each pair,
// and the last round puts every answer to one prompt on the board at once.

const T = {
  // Narrated how-to before round one. The big screen ends it early once the
  // narration is done; this is only the ceiling.
  howto: 60000,
  intro: 5000,
  write: 90000,
  vote: 25000,
  // The big screen reads the prompt aloud and shows both answers. Voting cannot
  // close before that, even when every phone is in.
  voteMin: 8000,
  reveal: 9500,
  scores: 10000,
  finalWrite: 75000,
  finalVote: 40000,
  finalReveal: 15000,
};
const ANSWER_MAX = 70;
const ROUND_NAMES = ['', 'Round One', 'Round Two', 'The Pile-On'];
const ROUND_BLURBS = [
  '',
  'Two prompts each. Be funnier than the other person.',
  'Same deal. Every point counts double.',
  'One prompt. Everybody answers. Everybody votes.',
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Draws n prompts the room has not seen. `used` lives in room memory so a
// rematch gets fresh prompts until the deck runs out.
function draw(pool, used, n) {
  let avail = pool.map((_, i) => i).filter((i) => !used.includes(i));
  if (avail.length < n) {
    used.length = 0;
    avail = pool.map((_, i) => i);
  }
  const picked = shuffle(avail).slice(0, n);
  used.push(...picked);
  return picked.map((i) => pool[i]);
}

function cleanAnswer(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ANSWER_MAX)
    .trim();
}

function same(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return norm(a) === norm(b);
}

class Clapback {
  constructor(ctx) {
    this.id = 'clapback';
    this.ctx = ctx;
    this.scale = ctx.timescale || 1;
    this.players = ctx.players.map((p) => ({ ...p, score: 0 }));
    this.pmap = new Map(this.players.map((p) => [p.id, p]));
    // Each deck keeps its own "already seen" list.
    const d = deckById(ctx.settings && ctx.settings.deck);
    this.deck = { pool: d.POOL, final: d.FINAL, used: `${d.id}:pool`, usedFinal: `${d.id}:final` };
    this.mem = SEEN;
    for (const k of [this.deck.used, this.deck.usedFinal]) this.mem[k] = this.mem[k] || [];
    this.over = false;
    this.round = 0;
    this.phase = 'intro';
    this.matchups = [];
    this.mi = -1;
    this.final = null;
    this.roundStart = new Map();
    this.timer = null;
    this.onTimeout = null;
    this.endsAt = 0;
    this.total = 0;
  }

  has(pid) {
    return this.pmap.has(pid);
  }

  // `round` lets the demo start later in the game. Jumping ahead hands out
  // made-up scores so the scoreboard and the stakes look like a real game.
  start(round = 1) {
    const r = Math.min(3, Math.max(1, round));
    if (r > 1) for (const p of this.players) p.score = Math.round((Math.random() * 1600 * (r - 1) + 200) / 50) * 50;
    if (r === 1) this.howTo();
    else this.startRound(r);
  }

  // How to play. Skippable from the big screen (Skip / Space) or the VIP's phone.
  howTo() {
    this.round = 1;
    this.phase = 'howto';
    this.setTimer(T.howto, () => this.startRound(1));
    this.ctx.sync();
  }

  destroy() {
    this.clearTimer();
  }

  // ---- timing -------------------------------------------------------------

  setTimer(ms, fn) {
    clearTimeout(this.timer);
    const d = Math.max(0, ms * this.scale);
    this.total = d;
    this.endsAt = Date.now() + d;
    this.onTimeout = fn;
    this.timer = setTimeout(() => {
      this.timer = null;
      const f = this.onTimeout;
      this.onTimeout = null;
      if (f) f.call(this);
    }, d);
  }

  clearTimer() {
    clearTimeout(this.timer);
    clearTimeout(this.early);
    this.timer = null;
    this.onTimeout = null;
    this.endsAt = 0;
    this.total = 0;
  }

  // Jumps to whatever the running timer would have done.
  skip() {
    const f = this.onTimeout;
    if (!f) return;
    this.clearTimer();
    f.call(this);
  }

  // ---- flow ---------------------------------------------------------------

  startRound(r) {
    this.round = r;
    this.phase = 'intro';
    this.roundStart = new Map(this.players.map((p) => [p.id, p.score]));
    this.setTimer(T.intro, this.beginWrite);
    this.ctx.sync();
  }

  beginWrite() {
    if (this.round < 3) {
      // Seat everyone in a ring. Each prompt goes to two neighbors, so every
      // player gets exactly two prompts and faces two different people.
      const ring = shuffle(this.players.map((p) => p.id));
      const prompts = draw(this.deck.pool, this.mem[this.deck.used], ring.length);
      this.matchups = shuffle(
        ring.map((pid, i) => ({
          id: `r${this.round}m${i}`,
          prompt: prompts[i],
          pids: shuffle([pid, ring[(i + 1) % ring.length]]),
          answers: [null, null],
          votes: new Map(),
          result: null,
        })),
      );
      this.mi = -1;
      this.setTimer(T.write, this.endWrite);
    } else {
      this.final = {
        prompt: draw(this.deck.final, this.mem[this.deck.usedFinal], 1)[0],
        answers: new Map(),
        order: [],
        picks: 1,
        votes: new Map(),
        rows: null,
      };
      this.setTimer(T.finalWrite, this.endWrite);
    }
    this.phase = 'write';
    this.ctx.sync();
  }

  isDone(pid) {
    if (this.round < 3) {
      return this.matchups.every((m) => {
        const slot = m.pids.indexOf(pid);
        return slot < 0 || m.answers[slot] !== null;
      });
    }
    return this.final.answers.has(pid);
  }

  answer(pid, msg) {
    if (this.phase !== 'write') return;
    const text = cleanAnswer(msg.text);
    if (!text) return;
    if (this.round < 3) {
      const m = this.matchups.find((x) => x.id === msg.mid);
      if (!m) return;
      const slot = m.pids.indexOf(pid);
      if (slot < 0 || m.answers[slot] !== null) return;
      m.answers[slot] = text;
    } else {
      if (this.final.answers.has(pid)) return;
      this.final.answers.set(pid, text);
    }
    // Nobody left who can still type? Move on.
    const waiting = this.players.some((p) => !this.isDone(p.id) && this.ctx.connected(p.id));
    if (!waiting) {
      this.endWrite();
      return;
    }
    this.ctx.sync();
  }

  endWrite() {
    this.clearTimer();
    if (this.round < 3) {
      this.mi = -1;
      this.nextMatchup();
    } else {
      this.beginFinalVote();
    }
  }

  nextMatchup() {
    this.mi += 1;
    if (this.mi >= this.matchups.length) {
      this.showScores();
      return;
    }
    const m = this.matchups[this.mi];
    const [a, b] = m.answers;
    if (a !== null && b !== null && !same(a, b)) {
      this.phase = 'vote';
      this.voteFrom = Date.now();
      this.setTimer(T.vote, this.endVote);
    } else {
      // Nothing to vote on: a blank, a forfeit, or two identical answers.
      this.resolve(m);
      this.phase = 'reveal';
      this.setTimer(T.reveal * 0.7, this.nextMatchup);
    }
    this.ctx.sync();
  }

  vote(pid, msg) {
    if (this.phase !== 'vote') return;
    const m = this.matchups[this.mi];
    if (m.id !== msg.mid) return;
    if (m.pids.includes(pid) || m.votes.has(pid)) return;
    if (msg.choice !== 0 && msg.choice !== 1) return;
    m.votes.set(pid, msg.choice);
    const waiting = this.players.some(
      (p) => !m.pids.includes(p.id) && !m.votes.has(p.id) && this.ctx.connected(p.id),
    );
    if (!waiting) {
      const left = this.voteFrom + T.voteMin * this.scale - Date.now();
      if (left <= 0) {
        this.endVote();
        return;
      }
      clearTimeout(this.early);
      this.early = setTimeout(() => {
        if (this.phase === 'vote' && this.matchups[this.mi] === m) this.endVote();
      }, left);
    }
    this.ctx.sync();
  }

  endVote() {
    this.clearTimer();
    this.resolve(this.matchups[this.mi]);
    this.phase = 'reveal';
    this.setTimer(T.reveal, this.nextMatchup);
    this.ctx.sync();
  }

  resolve(m) {
    const mult = this.round;
    const [a, b] = m.answers;
    const counts = [0, 0];
    for (const c of m.votes.values()) counts[c] += 1;
    const total = counts[0] + counts[1];
    const res = { kind: 'vote', counts, points: [0, 0], tags: [null, null], winner: -1 };

    if (a === null && b === null) {
      res.kind = 'empty';
    } else if (a === null || b === null) {
      const w = a === null ? 1 : 0;
      res.kind = 'forfeit';
      res.winner = w;
      res.points[w] = 500 * mult;
    } else if (same(a, b)) {
      res.kind = 'jinx';
    } else if (total > 0) {
      for (const i of [0, 1]) res.points[i] = Math.round((counts[i] / total) * 100) * 10 * mult;
      if (counts[0] !== counts[1]) {
        const w = counts[0] > counts[1] ? 0 : 1;
        res.winner = w;
        res.points[w] += 100 * mult;
        if (counts[w] === total && total >= 2) {
          res.points[w] += 250 * mult;
          // The one payoff. Rare on purpose.
          res.tags[w] = 'CLAPBACK';
        }
      } else {
        res.kind = 'tie';
      }
    } else {
      res.kind = 'novotes';
    }
    m.result = res;
    m.pids.forEach((pid, i) => {
      this.pmap.get(pid).score += res.points[i];
    });
  }

  showScores() {
    this.phase = 'scores';
    this.setTimer(T.scores, () => this.startRound(this.round + 1));
    this.ctx.sync();
  }

  // ---- the Pile-On --------------------------------------------------------

  beginFinalVote() {
    const f = this.final;
    f.order = shuffle([...f.answers.keys()]);
    f.picks = Math.max(1, Math.min(3, Math.floor((f.order.length - 1) / 2)));
    if (f.order.length < 2) {
      this.endFinalVote();
      return;
    }
    this.phase = 'fvote';
    this.setTimer(T.finalVote, this.endFinalVote);
    this.ctx.sync();
  }

  finalVote(pid, msg) {
    if (this.phase !== 'fvote') return;
    const f = this.final;
    if (f.votes.has(pid) || !Array.isArray(msg.picks)) return;
    const picks = [...new Set(msg.picks)].filter(
      (i) => Number.isInteger(i) && i >= 0 && i < f.order.length && f.order[i] !== pid,
    );
    if (!picks.length || picks.length > f.picks) return;
    f.votes.set(pid, picks);
    const waiting = this.players.some((p) => !f.votes.has(p.id) && this.ctx.connected(p.id));
    if (!waiting) {
      this.endFinalVote();
      return;
    }
    this.ctx.sync();
  }

  endFinalVote() {
    this.clearTimer();
    const f = this.final;
    const perVote = Math.round(3000 / Math.max(1, this.players.length - 1) / 10) * 10;
    const rows = f.order.map((pid, i) => ({ i, pid, text: f.answers.get(pid), voters: [], points: 0, tag: null }));
    for (const [voter, picks] of f.votes) for (const i of picks) rows[i].voters.push(voter);
    const top = Math.max(0, ...rows.map((r) => r.voters.length));
    for (const r of rows) {
      r.points = r.voters.length * perVote;
      if (top > 0 && r.voters.length === top) {
        r.points += 500;
        r.top = true;
      }
      // Same rule as a head-to-head sweep: every ballot, and at least two.
      if (f.votes.size >= 2 && r.voters.length === f.votes.size) {
        r.points += 500;
        r.tag = 'CLAPBACK';
      }
      this.pmap.get(r.pid).score += r.points;
    }
    if (rows.length === 1) {
      // Only one person bothered. That deserves something.
      rows[0].points = 1000;
      this.pmap.get(rows[0].pid).score += 1000;
    }
    rows.sort((x, y) => y.voters.length - x.voters.length);
    f.rows = rows;
    this.phase = 'freveal';
    this.setTimer(T.finalReveal, this.finish);
    this.ctx.sync();
  }

  finish() {
    this.clearTimer();
    this.phase = 'over';
    this.over = true;
    this.ctx.sync();
  }

  // ---- messages -----------------------------------------------------------

  onHost(msg) {
    if (msg.a === 'skip') this.skip();
  }

  onPlayer(pid, msg) {
    if (msg.a === 'answer') this.answer(pid, msg);
    else if (msg.a === 'vote') this.vote(pid, msg);
    else if (msg.a === 'fvote') this.finalVote(pid, msg);
  }

  // ---- views --------------------------------------------------------------

  face(pid) {
    const p = this.pmap.get(pid);
    return { id: p.id, name: p.name, color: p.color, guy: p.guy };
  }

  board() {
    const rows = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      guy: p.guy,
      score: p.score,
      delta: p.score - (this.roundStart.get(p.id) || 0),
    }));
    rows.sort((a, b) => b.score - a.score);
    let rank = 0;
    let prev = null;
    rows.forEach((r, i) => {
      if (r.score !== prev) {
        rank = i + 1;
        prev = r.score;
      }
      r.rank = rank;
    });
    return rows;
  }

  base() {
    return {
      id: this.id,
      phase: this.phase,
      round: this.round,
      roundName: ROUND_NAMES[this.round],
      blurb: ROUND_BLURBS[this.round],
      endsAt: this.endsAt,
      total: this.total,
    };
  }

  hostView() {
    const v = this.base();
    const m = this.matchups[this.mi];
    switch (this.phase) {
      case 'write':
        v.writers = this.players.map((p) => ({ ...this.face(p.id), done: this.isDone(p.id) }));
        if (this.round === 3) v.prompt = this.final.prompt;
        break;
      case 'vote':
        v.matchup = { id: m.id, n: this.mi + 1, of: this.matchups.length, prompt: m.prompt, answers: m.answers };
        v.voted = m.votes.size;
        v.voters = this.players.length - 2;
        break;
      case 'reveal': {
        const votersFor = (side) => [...m.votes].filter(([, c]) => c === side).map(([pid]) => this.face(pid));
        v.matchup = {
          id: m.id,
          n: this.mi + 1,
          of: this.matchups.length,
          prompt: m.prompt,
          kind: m.result.kind,
          winner: m.result.winner,
          sides: [0, 1].map((i) => ({
            text: m.answers[i],
            author: this.face(m.pids[i]),
            voters: votersFor(i),
            points: m.result.points[i],
            tag: m.result.tags[i],
          })),
        };
        break;
      }
      case 'scores':
      case 'over':
        v.board = this.board();
        break;
      case 'fvote':
        v.final = {
          prompt: this.final.prompt,
          answers: this.final.order.map((pid) => this.final.answers.get(pid)),
          picks: this.final.picks,
        };
        v.voted = this.final.votes.size;
        v.voters = this.players.length;
        break;
      case 'freveal':
        v.final = {
          prompt: this.final.prompt,
          rows: this.final.rows.map((r) => ({
            text: r.text,
            author: this.face(r.pid),
            voters: r.voters.map((pid) => this.face(pid)),
            points: r.points,
            top: !!r.top,
            tag: r.tag,
          })),
        };
        break;
      default:
        break;
    }
    return v;
  }

  playerView(pid) {
    const v = this.base();
    const me = this.pmap.get(pid);
    v.score = me.score;
    const m = this.matchups[this.mi];
    switch (this.phase) {
      case 'write':
        if (this.round < 3) {
          v.prompts = this.matchups
            .filter((x) => x.pids.includes(pid))
            .map((x) => ({ mid: x.id, text: x.prompt, done: x.answers[x.pids.indexOf(pid)] !== null }));
        } else {
          v.prompts = [{ mid: 'final', text: this.final.prompt, done: this.final.answers.has(pid) }];
        }
        v.max = ANSWER_MAX;
        break;
      case 'vote': {
        const slot = m.pids.indexOf(pid);
        v.matchup = { id: m.id, prompt: m.prompt, answers: m.answers };
        v.mySide = slot;
        v.choice = m.votes.has(pid) ? m.votes.get(pid) : null;
        break;
      }
      case 'reveal': {
        const slot = m.pids.indexOf(pid);
        v.mid = m.id;
        v.mine = slot < 0
          ? null
          : { points: m.result.points[slot], tag: m.result.tags[slot], won: m.result.winner === slot, kind: m.result.kind };
        break;
      }
      case 'fvote':
        v.final = {
          prompt: this.final.prompt,
          options: this.final.order.map((apid, i) => ({ i, text: this.final.answers.get(apid), own: apid === pid })),
          picks: this.final.picks,
        };
        v.voted = this.final.votes.has(pid);
        break;
      case 'freveal': {
        const row = this.final.rows.find((r) => r.pid === pid);
        v.mine = row ? { points: row.points, tag: row.tag, votes: row.voters.length } : null;
        break;
      }
      case 'scores':
      case 'over': {
        const board = this.board();
        const row = board.find((r) => r.id === pid);
        v.rank = row.rank;
        v.delta = row.delta;
        v.of = board.length;
        v.winners = board.filter((r) => r.rank === 1).map((r) => r.name);
        break;
      }
      default:
        break;
    }
    return v;
  }
}

module.exports = {
  id: 'clapback',
  name: 'Clapback',
  tagline: 'Say the worst thing you can think of. Your friends vote on who said it better.',
  decks: DECKS.map(({ id, name, blurb }) => ({ id, name, blurb })),
  min: 3,
  max: 10,
  create: (ctx) => new Clapback(ctx),
  // exported for tests
  _internals: { Clapback, same, cleanAnswer, draw, T },
};
