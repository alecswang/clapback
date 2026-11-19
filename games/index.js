'use strict';

// Every game is one folder here plus one folder in public/games.
// A game exports { id, name, tagline, min, max, create(ctx) }.
// create(ctx) returns an object with:
//   start(), destroy(), has(pid), over,
//   hostView(), playerView(pid), onHost(msg), onPlayer(pid, msg)
// ctx gives the game { players, sync(), connected(pid), memory, timescale }.

const list = [require('./clapback')];

module.exports = {
  list,
  get: (id) => list.find((g) => g.id === id) || null,
};
