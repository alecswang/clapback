'use strict';

// Fills a room with fake players so you can test alone.
//   npm run bots -- ABCD 4
const { Bot } = require('./client');

const [code, countArg] = process.argv.slice(2);
const count = Number(countArg) || 3;
const port = Number(process.env.PORT) || 3030;
const NAMES = ['Mango', 'Biscuit', 'Tofu', 'Pickle', 'Waffle', 'Nacho', 'Dumpling', 'Pretzel', 'Churro'];

if (!code) {
  console.error('Usage: npm run bots -- ROOMCODE [count]');
  process.exit(1);
}

(async () => {
  for (let i = 0; i < count; i++) {
    const bot = new Bot(`ws://localhost:${port}/ws`, code.toUpperCase(), NAMES[i % NAMES.length], { delay: [1500, 6000] });
    await bot.connect();
    if (bot.errors.length) {
      console.error(`${bot.name}: ${bot.errors[0].msg}`);
      process.exit(1);
    }
    console.log(`${bot.name} joined ${code.toUpperCase()}`);
  }
  console.log('Bots are in. Ctrl+C to pull them out.');
})();
