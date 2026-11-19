'use strict';

// The prompt decks the host picks from in the lobby. POOL is head-to-head
// prompts (rounds one and two), FINAL is the Pile-On.
const DECKS = [
  { id: 'nsfw', name: 'NSFW', blurb: 'Sex, drinking, exes, bad decisions. Adults only.', ...require('./nsfw') },
  { id: 'classic', name: 'Classic', blurb: 'Everyday stuff. Clean, fine for anyone.', ...require('./classic') },
  { id: 'online', name: 'Online', blurb: 'Phones, group chats, dating apps, social media.', ...require('./online') },
  { id: 'unhinged', name: 'Unhinged', blurb: 'Weird what-ifs, cursed ideas, animals with plans.', ...require('./unhinged') },
];
const DEFAULT_DECK = 'nsfw';
const deckById = (id) => DECKS.find((d) => d.id === id) || DECKS.find((d) => d.id === DEFAULT_DECK);

module.exports = { DECKS, DEFAULT_DECK, deckById };
