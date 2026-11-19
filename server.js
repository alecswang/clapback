'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const { Rooms, send } = require('./lib/rooms');

const PORT = Number(process.env.PORT) || 3030;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

const rooms = new Rooms({ timescale: Number(process.env.TIMESCALE) || 1 });

function lanAddress() {
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) found.push({ name, address: a.address });
    }
  }
  const pick = found.find((f) => f.name === 'en0') || found[0];
  return pick ? pick.address : null;
}

// The address phones should open. A host page opened on localhost is useless
// to a phone, so swap in the LAN address in that case.
function joinBase(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`);
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const hostname = hostHeader.replace(/:\d+$/, '');
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    const ip = lanAddress();
    if (ip) return `http://${ip}:${PORT}`;
  }
  return `${proto}://${hostHeader}`;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  else if (urlPath === '/host') urlPath = '/host.html';
  else if (urlPath === '/demo') urlPath = '/demo.html';

  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

async function hostHello(ws, room, req) {
  const base = joinBase(req);
  const joinUrl = `${base}/?code=${room.code}`;
  const qr = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  send(ws, {
    t: 'hosted',
    code: room.code,
    hostKey: room.hostKey,
    joinUrl,
    joinHost: base.replace(/^https?:\/\//, ''),
    qr,
  });
  room.sync();
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});
  ws.on('close', () => rooms.drop(ws));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    try {
      if (msg.t === 'host:create') {
        const room = rooms.create();
        room.attachHost(ws);
        hostHello(ws, room, req).catch((e) => console.error(e));
      } else if (msg.t === 'host:resume') {
        const room = rooms.get(msg.code);
        if (!room || room.hostKey !== msg.hostKey) {
          send(ws, { t: 'error', code: 'noroom', msg: 'That room is gone.' });
          return;
        }
        room.attachHost(ws);
        hostHello(ws, room, req).catch((e) => console.error(e));
      } else {
        rooms.handle(ws, msg);
      }
    } catch (e) {
      console.error('message failed', e);
    }
  });
});

// Phones drop off Wi-Fi without closing the socket. Ping finds them.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
heartbeat.unref();

server.listen(PORT, () => {
  const ip = lanAddress();
  console.log('');
  console.log('  Clapback is running.');
  console.log(`  Big screen:  http://localhost:${PORT}/host`);
  console.log(`  Phones:      ${PUBLIC_URL || (ip ? `http://${ip}:${PORT}` : `http://localhost:${PORT}`)}`);
  console.log(`  Watch alone: http://localhost:${PORT}/demo`);
  console.log('');
});

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.terminate();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
