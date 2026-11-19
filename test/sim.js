'use strict';

// Plays whole games over real WebSockets against a real server.
const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { Bot, openSocket, sleep } = require('./client');
const clapback = require('../games/clapback');

const PORT = 3939;
const URL = `ws://localhost:${PORT}/ws`;
let server;
let passed = 0;

const ok = (name) => {
  passed += 1;
  console.log(`  ok  ${name}`);
};

function startServer(timescale) {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(PORT), TIMESCALE: String(timescale), PUBLIC_URL: '' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    server.stdout.on('data', (d) => {
      if (String(d).includes('running')) resolve();
    });
    server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.removeAllListeners('exit');
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
}

// The big screen, minus the screen.
class Host {
  constructor(opts = {}) {
    this.opts = { autoskip: true, ...opts };
    this.states = [];
    this.toasts = [];
    this.skipped = new Set();
  }

  async connect(resume) {
    this.ws = await openSocket(URL);
    this.ws.on('message', (raw) => this.onMessage(JSON.parse(raw)));
    this.send(resume ? { t: 'host:resume', ...resume } : { t: 'host:create' });
    await this.until(() => this.info || this.error);
    return this;
  }

  send(o) {
    this.ws.send(JSON.stringify(o));
  }

  onMessage(m) {
    if (m.t === 'hosted') this.info = m;
    else if (m.t === 'error') this.error = m;
    else if (m.t === 'toast') this.toasts.push(m.msg);
    else if (m.t === 'state') {
      this.state = m;
      this.states.push(m);
      const g = m.game;
      // Skip the phases that only wait for people to read.
      if (g && this.opts.autoskip && ['intro', 'reveal', 'scores', 'freveal'].includes(g.phase)) {
        const key = `${g.phase}:${g.round}:${g.matchup ? g.matchup.id : ''}:${g.endsAt}`;
        if (!this.skipped.has(key)) {
          this.skipped.add(key);
          this.send({ t: 'game', a: 'skip' });
        }
      }
    }
  }

  async until(fn, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await sleep(5);
    }
    throw new Error(`host: timed out waiting (phase ${this.state && this.state.game ? this.state.game.phase : this.state && this.state.phase})`);
  }

  phase() {
    return this.state && this.state.game ? this.state.game.phase : null;
  }
}

async function room(n, botOpts = () => ({}), hostOpts) {
  const host = await new Host(hostOpts).connect();
  const bots = [];
  for (let i = 0; i < n; i++) bots.push(await new Bot(URL, host.info.code, `P${i + 1}`, botOpts(i)).connect());
  await host.until(() => host.state && host.state.players.length === n);
  return { host, bots };
}

function closeAll({ host, bots }) {
  host.ws.close();
  bots.forEach((b) => b.close());
}

async function main() {
  // ---- pure logic ----------------------------------------------------------
  const { same, cleanAnswer, draw, Clapback } = clapback._internals;
  assert(same('A wet sock!', 'a  wet sock'));
  assert(!same('a wet sock', 'a dry sock'));
  assert.strictEqual(cleanAnswer('  hi\n\tthere  '), 'hi there');
  assert.strictEqual(cleanAnswer('x'.repeat(200)).length, 70);
  const used = [];
  const a = draw(['a', 'b', 'c', 'd'], used, 3);
  const b = draw(['a', 'b', 'c', 'd'], used, 3);
  assert.strictEqual(new Set(a).size, 3);
  assert.strictEqual(b.length, 3, 'deck reshuffles when it runs dry');
  ok('helpers');

  {
    const players = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id, color: '#fff' }));
    const g = new Clapback({ players, sync() {}, connected: () => true, memory: {}, timescale: 0 });
    const score = (round, votes, answers = ['x', 'y']) => {
      g.round = round;
      g.players.forEach((p) => { p.score = 0; });
      const m = { pids: ['a', 'b'], answers, votes: new Map(votes), result: null };
      g.resolve(m);
      return m.result;
    };
    let r = score(1, [['c', 0], ['d', 0], ['e', 0]]);
    assert.deepStrictEqual(r.points, [1350, 0]);
    assert.deepStrictEqual(r.tags, ['CLAPBACK', null]);
    r = score(2, [['c', 0], ['d', 0], ['e', 1]]);
    assert.deepStrictEqual(r.points, [1540, 660]);
    assert.strictEqual(r.winner, 0);
    assert.deepStrictEqual(r.tags, [null, null], 'no stamp unless one answer takes every vote');
    r = score(1, [['c', 0]]);
    assert.deepStrictEqual([r.winner, r.tags], [0, [null, null]], 'a single vote is not a sweep');
    r = score(1, [['c', 0], ['d', 1]]);
    assert.deepStrictEqual(r.points, [500, 500]);
    assert.strictEqual(r.kind, 'tie');
    r = score(1, [], ['x', null]);
    assert.deepStrictEqual([r.kind, r.points, r.tags], ['forfeit', [500, 0], [null, null]]);
    r = score(1, [], ['Same', 'same!']);
    assert.deepStrictEqual([r.kind, r.points], ['jinx', [0, 0]]);
    r = score(1, [], [null, null]);
    assert.strictEqual(r.kind, 'empty');
    r = score(1, []);
    assert.deepStrictEqual([r.kind, r.points], ['novotes', [0, 0]]);

    // The last round follows the same rule. Top answer gets the bonus, the
    // stamp needs every ballot.
    const fin = (votes) => {
      g.players.forEach((p) => { p.score = 0; });
      const ids = ['a', 'b', 'c', 'd', 'e'];
      g.final = { prompt: 'p', answers: new Map(ids.map((id) => [id, `from ${id}`])), order: ids, picks: 2, votes: new Map(votes), rows: null };
      g.endFinalVote();
      g.clearTimer();
      return g.final.rows;
    };
    let rows = fin([['b', [0]], ['c', [0]], ['d', [0]], ['e', [0, 1]]]);
    assert.deepStrictEqual(rows.filter((x) => x.tag).map((x) => [x.pid, x.tag]), [['a', 'CLAPBACK']]);
    assert.strictEqual(rows[0].points, 4 * 750 + 500 + 500);
    rows = fin([['b', [0]], ['c', [0]], ['d', [0]], ['e', [1]]]);
    assert(rows.every((x) => !x.tag), 'top answer without every vote gets no stamp');
    assert.deepStrictEqual([rows[0].pid, rows[0].top, rows[0].points], ['a', true, 3 * 750 + 500]);
    assert.strictEqual(rows.filter((x) => x.top).length, 1);

    // Every player gets exactly two prompts against two different people.
    for (const n of [3, 4, 7, 10]) {
      const ps = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `p${i}`, color: '#fff' }));
      const game = new Clapback({ players: ps, sync() {}, connected: () => true, memory: {}, timescale: 0 });
      game.round = 1;
      game.beginWrite();
      game.destroy();
      assert.strictEqual(game.matchups.length, n);
      for (const p of ps) {
        const mine = game.matchups.filter((m) => m.pids.includes(p.id));
        assert.strictEqual(mine.length, 2, `${n} players: two prompts each`);
        const foes = new Set(mine.map((m) => m.pids.find((x) => x !== p.id)));
        assert.strictEqual(foes.size, n === 2 ? 1 : 2);
      }
      assert.strictEqual(new Set(game.matchups.map((m) => m.prompt)).size, n, 'no repeated prompt in a round');
    }
  }
  ok('scoring and matchmaking');

  // ---- full game, everyone plays ------------------------------------------
  await startServer(0.02);
  {
    const r = await room(5);
    const { host, bots } = r;
    assert.match(host.info.code, /^[A-HJ-NP-Z]{4}$/);
    assert(host.info.qr.includes('<svg'), 'QR code is svg');
    assert(host.info.joinUrl.endsWith(`/?code=${host.info.code}`));
    assert.strictEqual(host.state.players.filter((p) => p.vip).length, 1);
    assert.strictEqual(host.state.players[0].vip, true, 'first to join is VIP');

    // only the host or the VIP can start
    bots[2].send({ t: 'start' });
    await sleep(60);
    assert.strictEqual(host.state.phase, 'lobby');

    bots[0].send({ t: 'start' });
    await host.until(() => host.phase() === 'over', 20000);

    const phases = [...new Set(host.states.filter((s) => s.game).map((s) => `${s.game.round}:${s.game.phase}`))];
    for (const want of ['1:intro', '1:write', '1:vote', '1:reveal', '1:scores', '2:write', '2:vote', '2:scores', '3:write', '3:fvote', '3:freveal', '3:over']) {
      assert(phases.includes(want), `saw phase ${want}`);
    }
    const board = host.state.game.board;
    assert.strictEqual(board.length, 5);
    assert(board.every((row, i) => i === 0 || board[i - 1].score >= row.score), 'board is sorted');
    assert(board.every((row) => row.score % 10 === 0));
    assert(board[0].score > 0);

    const reveals = host.states.filter((s) => s.game && s.game.phase === 'reveal');
    const ids = new Set(reveals.map((s) => s.game.matchup.id));
    assert.strictEqual(ids.size, 10, 'five matchups in each of two rounds');

    // while voting, nobody is told who wrote what
    for (const b of bots) {
      for (const s of b.log.filter((x) => x.game && x.game.phase === 'vote')) {
        assert(!JSON.stringify(s.game).includes('author'));
      }
    }
    for (const s of host.states.filter((x) => x.game && (x.game.phase === 'vote' || x.game.phase === 'fvote'))) {
      assert(!JSON.stringify(s.game).includes('author'));
    }
    // each bot's own tally matches the board, once its last update lands
    await host.until(() => bots.every((b) => b.state && b.state.game && b.state.game.phase === 'over'));
    for (const b of bots) {
      const row = board.find((x) => x.name === b.name);
      assert.strictEqual(b.state.game.score, row.score);
      assert.strictEqual(b.state.game.rank, row.rank);
    }
    ok('full game with 5 players');

    // rematch: fresh prompts, scores reset
    const seen = new Set(reveals.map((s) => s.game.matchup.prompt));
    const mark = host.states.length;
    host.send({ t: 'again' });
    await host.until(() => host.phase() === 'over' && host.states.length > mark + 5, 20000);
    const second = host.states.slice(mark).filter((s) => s.game && s.game.phase === 'reveal');
    assert(second.length > 0);
    for (const s of second) assert(!seen.has(s.game.matchup.prompt), 'rematch repeats no prompt');
    ok('rematch draws new prompts');

    host.send({ t: 'lobby' });
    await host.until(() => host.state.phase === 'lobby');
    ok('back to lobby');
    closeAll(r);
  }

  // ---- slackers, reconnects, bad input ------------------------------------
  {
    // P3 never answers. P4 never votes. Nobody presses skip.
    const r = await room(4, (i) => ({ answer: i !== 2, vote: i !== 3 }), { autoskip: false });
    const { host, bots } = r;
    host.send({ t: 'start' });
    await host.until(() => host.phase() === 'write' && bots[0].state && bots[0].state.game && bots[0].state.game.prompts);

    // rule-breaking messages that must be ignored
    const g0 = bots[0].state.game;
    bots[0].send({ t: 'game', a: 'answer', mid: 'nope', text: 'hi' });
    bots[0].send({ t: 'game', a: 'answer', mid: g0.prompts[0].mid, text: '   ' });
    bots[1].send({ t: 'game', a: 'skip' });
    bots[1].send({ t: 'end' });
    bots[1].send({ t: 'kick', pid: host.state.players[0].id });
    bots[0].ws.send('not json');
    bots[0].ws.send(JSON.stringify({ t: 42 }));

    // drop P1 mid-game and bring them back with their token
    await host.until(() => host.phase() === 'vote' || host.phase() === 'reveal', 10000);
    const token = bots[0].token;
    bots[0].close();
    await host.until(() => host.state.players.find((p) => p.name === 'P1').connected === false);
    const back = await new Bot(URL, host.info.code, 'ignored', { token }).connect();
    assert.strictEqual(back.token, token);
    await back.until(() => back.state && back.state.game);
    assert.strictEqual(back.state.you.name, 'P1', 'token brings back the same seat');
    assert.strictEqual(host.state.players.length, 4);
    bots[0] = back;

    // a latecomer sits out
    const late = await new Bot(URL, host.info.code, 'Late').connect();
    await late.until(() => late.state);
    assert.strictEqual(late.state.game, null);
    assert.strictEqual(late.state.you.sitting, true);

    await host.until(() => host.phase() === 'over', 40000);
    assert.strictEqual(host.state.players.length, 5, 'nobody got kicked or ended the game');
    const reveals = host.states.filter((s) => s.game && s.game.phase === 'reveal');
    const kinds = new Set(reveals.map((s) => s.game.matchup.kind));
    assert(kinds.has('forfeit'), 'a blank answer becomes a walkover');
    const p3 = host.state.game.board.find((x) => x.name === 'P3');
    assert.strictEqual(p3.score, 0, 'no answers, no points');
    assert.strictEqual(host.state.game.board.length, 4, 'latecomer is not on the board');
    ok('timers carry a game with slackers, a reconnect and a latecomer');
    closeAll({ host, bots: [...bots, late] });
  }

  {
    const host = await new Host().connect();
    const code = host.info.code;

    const nobody = await new Bot(URL, 'ZZZZ', 'x').connect();
    assert.strictEqual(nobody.errors[0].code, 'noroom');
    const blank = await new Bot(URL, code, '   ').connect();
    assert.strictEqual(blank.errors[0].code, 'name');

    const a1 = await new Bot(URL, code.toLowerCase(), '<img src=x onerror=alert(1)>').connect();
    const a2 = await new Bot(URL, code, 'Sam').connect();
    const a3 = await new Bot(URL, code, 'sam').connect();
    await host.until(() => host.state.players.length === 3);
    const names = host.state.players.map((p) => p.name);
    assert.strictEqual(names[0], '<img src=x o', 'names are cut to 12 and sent as plain text');
    assert.strictEqual(names[2], 'sam2', 'duplicate names get a number');
    assert(!JSON.stringify(a2.state).includes(a1.token), 'tokens are never broadcast');

    // too few connected players
    a3.close();
    await host.until(() => host.state.players.filter((p) => p.connected).length === 2);
    host.send({ t: 'start' });
    await host.until(() => host.toasts.length === 1);
    assert.match(host.toasts[0], /at least 3/);

    // host kicks, seat is gone and the token dies with it
    host.send({ t: 'kick', pid: host.state.players[1].id });
    await a2.until(() => a2.bye);
    assert.strictEqual(a2.bye.forget, true);
    await host.until(() => host.state.players.length === 2);

    // room fills at ten
    const crowd = [];
    for (let i = 0; i < 8; i++) crowd.push(await new Bot(URL, code, `c${i}`).connect());
    const extra = await new Bot(URL, code, 'eleven').connect();
    assert.strictEqual(extra.errors[0].code, 'full');

    // host page reload resumes the same room, a wrong key does not
    const again = await new Host().connect({ code, hostKey: host.info.hostKey });
    assert.strictEqual(again.info.code, code);
    await again.until(() => again.state && again.state.players.length === 10);
    const thief = await new Host().connect({ code, hostKey: 'guess' });
    assert.strictEqual(thief.error.code, 'noroom');
    ok('join rules, kick, room cap, host resume');

    // ten players get through a whole game
    again.send({ t: 'start' });
    await again.until(() => again.phase() === 'over', 40000);
    assert.strictEqual(again.state.game.board.length, 9, 'nine connected players played');
    ok('nine-player game');
    [again, thief].forEach((h) => h.ws.close());
    [a1, ...crowd, nobody, blank, extra].forEach((b) => b.close());
  }

  await stopServer();
  console.log(`\n${passed} checks passed`);
}

main().catch(async (e) => {
  console.error('\nFAILED:', e.stack || e);
  await stopServer();
  process.exit(1);
});
