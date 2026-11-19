'use strict';

// Opens a free Cloudflare quick tunnel, then starts the server behind it,
// so friends who are not on your Wi-Fi can join from a public link.
//   npm run party
// Needs cloudflared: brew install cloudflared

const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || '3030';
let server = null;
let done = false;

const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

function stop(code) {
  if (done) return;
  done = true;
  if (server) server.kill('SIGTERM');
  tunnel.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}

function onTunnelOutput(chunk) {
  const found = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!found || server) return;
  clearTimeout(giveUp);
  console.log(`\n  Public link: ${found[0]}\n  Anyone with this link and the room code can join until you press Ctrl+C.`);
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, PUBLIC_URL: found[0] },
    stdio: 'inherit',
  });
  server.on('exit', (code) => stop(code || 0));
}

tunnel.stdout.on('data', onTunnelOutput);
tunnel.stderr.on('data', onTunnelOutput);
tunnel.on('error', () => {
  console.error('cloudflared is not installed. Run: brew install cloudflared');
  process.exit(1);
});
tunnel.on('exit', (code) => {
  if (!server) console.error('The tunnel closed before it gave a link.');
  stop(code || 1);
});

const giveUp = setTimeout(() => {
  console.error('No tunnel link after 30 seconds. Check your connection and try again.');
  stop(1);
}, 30000);

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
