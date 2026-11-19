'use strict';

// Prints how many ElevenLabs characters are left this billing period, so you
// know whether `npm run voice` will fit. Never prints the key.
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}

(async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing.');
  const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
  const s = await r.json();
  const left = s.character_limit - s.character_count;
  console.log(`tier ${s.tier}: ${s.character_count} of ${s.character_limit} credits used, ${left} left` +
    (s.next_character_count_reset_unix ? `, resets ${new Date(s.next_character_count_reset_unix * 1000).toDateString()}` : ''));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
