'use strict';

const crypto = require('crypto');
const games = require('../games');

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they read as 1 and 0
const BLOCKED = new Set(['FUCK', 'SHIT', 'CUNT', 'DICK', 'COCK', 'TWAT', 'SLUT', 'RAPE', 'NAZI', 'KKKK', 'PAKY', 'DYKE', 'JEWS', 'HELL', 'DAMN', 'PISS', 'CRAP', 'ARSE']);
const MAX_PLAYERS = 10;
const NAME_MAX = 12;
const CAST_SIZE = 16; // matches CAST in public/js/cast.js
const COLORS = ['#ff4b2b', '#2f5cff', '#ffd23f', '#00a99d', '#ff7eb6', '#ff8a1f', '#7a4dff', '#3fbf5a', '#c59b6d', '#a8a29e'];
const IDLE_TTL = 3 * 60 * 60 * 1000;
const EMPTY_TTL = 15 * 60 * 1000;

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function cleanName(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

class Room {
  constructor(code, opts) {
    this.code = code;
    this.opts = opts;
    this.hostKey = crypto.randomBytes(12).toString('hex');
    this.host = null;
    this.players = new Map(); // public id -> player
    this.game = null;
    this.gameId = games.list[0].id;
    this.memory = {}; // per-game data that outlives one game, like used prompts
    this.settings = { deck: 'nsfw' }; // prompt deck; the host picks in the lobby
    this.touched = Date.now();
    this.emptySince = Date.now();
  }

  get vip() {
    for (const p of this.players.values()) if (p.connected) return p;
    return null;
  }

  attachHost(ws) {
    if (this.host && this.host !== ws) {
      const old = this.host;
      old.room = null;
      send(old, { t: 'bye', msg: 'This room was opened on another screen.' });
      old.close();
    }
    if (ws.room && ws.room !== this) ws.room.detach(ws);
    else if (ws.room === this && ws.role === 'player') this.detach(ws);
    this.host = ws;
    ws.room = this;
    ws.role = 'host';
    ws.pid = null;
  }

  uniqueName(name) {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; n < 99; n++) {
      const candidate = `${name.slice(0, NAME_MAX - String(n).length)}${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  nextColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[this.players.size % COLORS.length];
  }

  // Each player gets a different cast character (public/js/cast.js), picked at random.
  nextGuy() {
    const used = new Set([...this.players.values()].map((p) => p.guy));
    const free = [...Array(CAST_SIZE).keys()].filter((i) => !used.has(i));
    return free.length ? free[crypto.randomInt(free.length)] : crypto.randomInt(CAST_SIZE);
  }

  join(ws, rawName, token) {
    if (ws.room) {
      // One socket is one seat. A repeat join keeps the seat it already has.
      if (ws.room === this && ws.role === 'player' && this.players.has(ws.pid)) {
        return { player: this.players.get(ws.pid) };
      }
      ws.room.detach(ws);
    }
    let p = null;
    if (typeof token === 'string' && token) {
      p = [...this.players.values()].find((x) => x.token === token) || null;
    }
    if (!p) {
      if (this.players.size >= MAX_PLAYERS) return { error: 'full', msg: 'This room is full.' };
      const name = cleanName(rawName);
      if (!name) return { error: 'name', msg: 'Type a name first.' };
      p = {
        id: crypto.randomBytes(4).toString('hex'),
        token: crypto.randomBytes(16).toString('hex'),
        name: this.uniqueName(name),
        color: this.nextColor(),
        guy: this.nextGuy(),
        ws: null,
        connected: false,
      };
      this.players.set(p.id, p);
    }
    if (p.ws && p.ws !== ws) {
      const old = p.ws;
      old.room = null;
      send(old, { t: 'bye', msg: 'You joined from another tab.' });
      old.close();
    }
    p.ws = ws;
    p.connected = true;
    ws.room = this;
    ws.role = 'player';
    ws.pid = p.id;
    return { player: p };
  }

  detach(ws) {
    if (this.host === ws) {
      this.host = null;
    } else if (ws.pid) {
      const p = this.players.get(ws.pid);
      if (p && p.ws === ws) {
        p.ws = null;
        p.connected = false;
      }
    }
    ws.room = null;
    this.sync();
  }

  remove(pid, msg) {
    const p = this.players.get(pid);
    if (!p) return;
    this.players.delete(pid);
    if (p.ws) {
      const old = p.ws;
      old.room = null;
      send(old, { t: 'bye', msg, forget: true });
      old.close();
    }
    this.sync();
  }

  startGame(ws, gameId, round = 1) {
    const def = games.get(gameId || this.gameId);
    if (!def) return;
    const roster = [...this.players.values()].filter((p) => p.connected).slice(0, def.max);
    if (roster.length < def.min) {
      send(ws, { t: 'toast', msg: `${def.name} needs at least ${def.min} players.` });
      return;
    }
    if (this.game) this.game.destroy();
    this.gameId = def.id;
    this.memory[def.id] = this.memory[def.id] || {};
    this.game = def.create({
      players: roster.map(({ id, name, color, guy }) => ({ id, name, color, guy })),
      sync: () => this.sync(),
      connected: (pid) => Boolean(this.players.get(pid) && this.players.get(pid).connected),
      memory: this.memory[def.id],
      settings: { ...this.settings },
      timescale: this.opts.timescale,
    });
    this.game.start(round);
  }

  endGame() {
    if (this.game) this.game.destroy();
    this.game = null;
    this.sync();
  }

  handle(ws, msg) {
    const isHost = ws.role === 'host' && this.host === ws;
    const vip = this.vip;
    const isVip = ws.role === 'player' && vip && vip.id === ws.pid;
    const canRun = isHost || isVip;

    switch (msg.t) {
      case 'pick':
        if (canRun && !this.game && games.get(msg.gameId)) {
          this.gameId = msg.gameId;
          this.sync();
        }
        break;
      case 'set':
        if (isHost && !this.game && typeof msg.deck === 'string' && /^[a-z]{1,20}$/.test(msg.deck)) {
          this.settings.deck = msg.deck;
          this.sync();
        }
        break;
      case 'start':
        // Only the big screen may jump ahead (the demo uses it to show later rounds).
        if (canRun && !this.game) this.startGame(ws, msg.gameId, isHost && Number.isInteger(msg.round) ? msg.round : 1);
        break;
      case 'again':
        if (canRun && this.game && this.game.over) this.startGame(ws, this.game.id);
        break;
      case 'lobby':
        if (canRun && this.game && this.game.over) this.endGame();
        break;
      case 'end':
        if (isHost && this.game) this.endGame();
        break;
      case 'kick':
        if (isHost) this.remove(String(msg.pid || ''), 'The host removed you from the room.');
        break;
      case 'leave':
        if (ws.role === 'player') this.remove(ws.pid, 'You left the room.');
        break;
      case 'game':
        if (!this.game) break;
        if (isHost) this.game.onHost(msg);
        else if (isVip && msg.a === 'skip' && this.game.phase === 'howto') this.game.skip();
        else if (ws.role === 'player' && this.game.has(ws.pid)) this.game.onPlayer(ws.pid, msg);
        break;
      default:
        break;
    }
  }

  publicState() {
    const vip = this.vip;
    const live = this.game;
    return {
      now: Date.now(),
      code: this.code,
      phase: live ? 'game' : 'lobby',
      gameId: live ? live.id : this.gameId,
      settings: { ...this.settings },
      games: games.list.map((g) => ({ id: g.id, name: g.name, tagline: g.tagline, min: g.min, max: g.max, decks: g.decks || [] })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        guy: p.guy,
        connected: p.connected,
        vip: Boolean(vip && vip.id === p.id),
        sitting: Boolean(live && !live.has(p.id)),
      })),
    };
  }

  sync() {
    this.touched = Date.now();
    const anyone = this.host || [...this.players.values()].some((p) => p.connected);
    this.emptySince = anyone ? 0 : this.emptySince || Date.now();

    const base = this.publicState();
    if (this.host) {
      send(this.host, { t: 'state', role: 'host', ...base, game: this.game ? this.game.hostView() : null });
    }
    for (const p of this.players.values()) {
      if (!p.ws) continue;
      const mine = base.players.find((x) => x.id === p.id);
      send(p.ws, {
        t: 'state',
        role: 'player',
        ...base,
        you: mine,
        game: this.game && this.game.has(p.id) ? this.game.playerView(p.id) : null,
      });
    }
  }

  destroy() {
    if (this.game) this.game.destroy();
    this.game = null;
    for (const ws of [this.host, ...[...this.players.values()].map((p) => p.ws)]) {
      if (!ws) continue;
      ws.room = null;
      send(ws, { t: 'bye', msg: 'This room closed.', forget: true });
      ws.close();
    }
  }
}

class Rooms {
  constructor(opts = {}) {
    this.opts = { timescale: 1, ...opts };
    this.rooms = new Map();
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref();
  }

  makeCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += LETTERS[crypto.randomInt(LETTERS.length)];
      if (!BLOCKED.has(code) && !this.rooms.has(code)) return code;
    }
  }

  create() {
    const room = new Room(this.makeCode(), this.opts);
    this.rooms.set(room.code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase().trim()) || null;
  }

  handle(ws, msg) {
    if (msg.t === 'join') {
      const room = this.get(msg.code);
      if (!room) {
        send(ws, { t: 'error', code: 'noroom', msg: 'No room with that code.' });
        return;
      }
      const res = room.join(ws, msg.name, msg.token);
      if (res.error) {
        send(ws, { t: 'error', code: res.error, msg: res.msg });
        return;
      }
      send(ws, { t: 'joined', code: room.code, token: res.player.token, name: res.player.name });
      room.sync();
      return;
    }
    if (ws.room) ws.room.handle(ws, msg);
  }

  drop(ws) {
    if (ws.room) ws.room.detach(ws);
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idle = now - room.touched > IDLE_TTL;
      const empty = room.emptySince && now - room.emptySince > EMPTY_TTL;
      if (idle || empty) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = { Rooms, send, cleanName, MAX_PLAYERS, NAME_MAX };
