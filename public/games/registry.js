// Add a game: one import pair here, one folder next to this file,
// one folder in /games on the server.
import * as clapbackHost from './clapback/host.js';
import * as clapbackPlay from './clapback/play.js';

export const HOST = { clapback: clapbackHost };
export const PLAY = { clapback: clapbackPlay };
