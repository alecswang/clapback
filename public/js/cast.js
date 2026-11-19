// The cast: one flat character per player. No outlines, a couple of shapes,
// dot eyes and one line for a mouth. `s` is the silhouette, printed in the
// player's color slightly off register behind the character.
const K = '#141414', R = '#ff4b2b', B = '#2f5cff', Y = '#ffd23f', G = '#3fbf5a', W = '#fff',
  C = '#f3ecdc', O = '#ff8a1f', P = '#ff7eb6', BR = '#c59b6d', GR = '#cfcbd6';
const f = (d, c) => `<path d="${d}" fill="${c}"/>`;
const l = (d, c = K, w = 2.2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const eyes = (x1, x2, y, r = 2.1) => `<circle cx="${x1}" cy="${y}" r="${r}" fill="${K}"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${K}"/>`;

const OLIVE = 'M24 13C32.5 13 37 20.5 37 30C37 39.5 31.5 46 24 46C16.5 46 11 39.5 11 30C11 20.5 15.5 13 24 13Z';
const EGG = 'M8 31C6 23 14 19 20 21C24 15 34 16 36 23C44 24 44 35 38 38C38 45 28 47 22 43C14 47 6 41 8 31Z';
const SOCK = 'M15 6H31V29Q31 33 35 35Q44 39 40 45.5Q37 50 30 47L17 41Q13 39 14 34Z';
const LEMON = 'M6 29C6 19 15 13 24 13C33 13 42 19 42 29C42 39 33 45 24 45C15 45 6 39 6 29Z';
const ICE = 'M15 13H35Q40 13 40 18V38Q40 43 35 43H15Q10 43 10 38V18Q10 13 15 13Z';
const CUP = 'M10 15H38L34 47H14Z';
const DISCO = 'M24 13A15.5 15.5 0 1 1 23.99 13Z';
const CHILI = 'M12 16C12 30 18 44 34 46C40 46.5 40 40 36 38C28 34 32 22 32 16Z';
const TOAST = 'M10 46V22C6 20 6 10 14 8C18 4 30 4 34 8C42 10 42 20 38 22V46Z';
const BANANA = 'M13 23H35V35Q35 46 24 46Q13 46 13 35Z';
const BANANA_S = 'M17 23V11Q17 4 24 4Q31 4 31 11V23H34Q42 24 43.5 34Q39 33 35 31V35Q35 46 24 46Q13 46 13 35V31Q9 33 4.5 34Q6 24 14 23Z';
const CLOUD = 'M12 20C12 13 19 10 23 14C26 9 34 10 35 16C41 16 43 23 40 26C42 31 38 35 33 34H14C8 35 5 30 8 26C5 23 7 18 12 20Z';
const PILL = 'M14 20H34A8 8 0 0 1 34 36H14A8 8 0 0 1 14 20Z';
const FLAME = 'M24 4C28 14 40 18 38 32C37 42 31 47 24 47C17 47 11 42 10 32C9 24 16 22 16 14C20 18 22 16 24 4Z';

export const CAST = [
  { id: 'olive', name: 'The Olive', vibe: 'smug, been in a martini', s: OLIVE,
    art: f(OLIVE, G) + eyes(19, 29, 26) + `<circle cx="24" cy="31.5" r="3.6" fill="${R}"/>` + l('M20 38.5q4 2.4 8 0') },
  { id: 'egg', name: 'Fried Egg', vibe: 'hungover, do not talk to him', s: EGG,
    art: f(EGG, W) + `<circle cx="24" cy="31" r="9.5" fill="${Y}"/>` + l('M18 30h4M26 30h4') + `<circle cx="24" cy="35.5" r="1.7" fill="${K}"/>` },
  { id: 'sock', name: 'Lone Sock', vibe: 'lost its partner, still out here', s: SOCK,
    art: f(SOCK, W) + f('M15 9H31V12.5H15ZM15 15H31V18H15Z', R) + eyes(19.5, 27, 25) + l('M19.5 30.5q3.8 2.8 7.6 0') },
  { id: 'lemon', name: 'Sour Lemon', vibe: 'bitter about everything', s: LEMON + 'M24 13q4-9 11-6q-3 8-11 6Z',
    art: f('M24 13q4-9 11-6q-3 8-11 6Z', G) + f(LEMON, Y) + l('M14.5 23.5l4 2.3-4 2.3M33.5 23.5l-4 2.3 4 2.3') + `<circle cx="24" cy="34.5" r="2" fill="${K}"/>` },
  { id: 'ice', name: 'Ice Cube', vibe: 'nervous sweater, melting under pressure', s: ICE, rot: 'rotate(-6 25 28)',
    art: `<g transform="rotate(-6 25 28)">${f(ICE, '#cfe2ff')}${l('M15 18.5h4.5M15 18.5v4.5', W, 2.4)}${eyes(20, 30, 27)}${l('M19 35q1.5-1.6 3-0t3 0 3 0 3 0', K, 2)}</g>` },
  { id: 'cup', name: 'Party Cup', vibe: 'loudest one here', s: CUP + 'M9 16q0-7 7-6q3-6 9-3q4-4 9 0q6-1 5 9Z',
    art: f(CUP, R) + f('M9 16q0-7 7-6q3-6 9-3q4-4 9 0q6-1 5 9Z', W) + eyes(19, 29, 27.5) + f('M17.5 33h13q0 7-6.5 7t-6.5-7Z', K) },
  { id: 'disco', name: 'Disco Ball', vibe: 'too cool for this party', s: DISCO,
    art: l('M24 13V2', K, 1.8) + `<circle cx="24" cy="28.5" r="15.5" fill="${GR}"/>` + l('M8.5 33h31M12 22q12 3 24 0M24 13v31', '#b3aec0', 1.2)
      + f('M12 24h24v2.5c0 3.4-2.2 5-5.4 5s-5-2.2-5-5h-3.2c0 2.8-1.8 5-5 5S12 30 12 26.5Z', K) + l('M20 37.5q4 1.6 8-1') },
  { id: 'chili', name: 'Hot Pepper', vibe: 'will start a fight', s: CHILI + 'M11 16Q22 9 33 16Q27 12 23 3Z',
    art: f(CHILI, R) + f('M11 16Q22 9 33 16Q27 12 23 3Z', G) + l('M15.5 21.5l5 2M28.5 21.5l-5 2', K, 2) + eyes(18.5, 25.5, 26, 1.9) + l('M18 31.5q4 3 8 0') },
  { id: 'lipstick', name: 'Lipstick', vibe: 'flirting with everyone', s: 'M13 46.5V28H15.5V22.5H17V12L31 6V22.5H32.5V28H35V46.5Z',
    art: f('M17 23V12L31 6V23Z', R) + f('M15.5 22.5H32.5V28.5H15.5Z', C) + f('M13 28H35V46.5H13Z', Y) + l('M16.8 35q2-2 4 0M27.2 35q2-2 4 0', K, 2) + `<ellipse cx="24" cy="40.5" rx="2.4" ry="1.8" fill="${R}"/>` },
  { id: 'toast', name: 'Burnt Toast', vibe: 'deadpan, seen it all', s: TOAST,
    art: f(TOAST, BR) + f('M14 43V21C11 19.5 11 13 16 12C19 9 29 9 32 12C37 13 37 19.5 34 21V43Z', '#f2cf8e') + f('M30 46q2-7 8-6V46Z', '#4a3a2a') + eyes(19.5, 28.5, 26) + l('M20 33h8') },
  { id: 'banana', name: 'Banana', vibe: 'half undressed, suspicious of you', s: BANANA_S,
    art: f('M17 24V11Q17 4 24 4Q31 4 31 11V24Z', '#fbeec2') + f('M14 23Q6 24 4.5 34Q11 32 18 27ZM34 23Q42 24 43.5 34Q37 32 30 27Z', '#f2bc1b')
      + f(BANANA, Y) + `<ellipse cx="24" cy="46.6" rx="2.2" ry="1.4" fill="${BR}"/>` + eyes(20.5, 28.5, 32) + l('M17.5 28l5 .8M26 27.6l5-1.6', K, 1.9) + l('M21 38q3.5 1.6 7-0.8', K, 2) },
  { id: 'cloud', name: 'Storm Cloud', vibe: 'brings the mood down', s: CLOUD,
    art: l('M14 40l-2 5M24 40l-2 5M34 40l-2 5', B, 2.4) + f(CLOUD, GR) + eyes(19, 29, 23.5, 1.9) + l('M20 30q4-3 8 0') },
  { id: 'dice', name: 'Lucky Die', vibe: 'gambling problem', s: 'M10 18L18 10H40V34L34 42H10Z',
    art: f('M10 18L18 10H40L34 18Z', C) + f('M34 18L40 10V34L34 42Z', '#d9d2c2') + f('M10 18H34V42H10Z', W) + `<ellipse cx="18.4" cy="15.6" rx="1.4" ry="0.9" fill="${K}"/><ellipse cx="24.4" cy="15.6" rx="1.4" ry="0.9" fill="${K}"/><ellipse cx="30.4" cy="15.6" rx="1.4" ry="0.9" fill="${K}"/><ellipse cx="21.6" cy="12.4" rx="1.4" ry="0.9" fill="${K}"/><ellipse cx="27.6" cy="12.4" rx="1.4" ry="0.9" fill="${K}"/><ellipse cx="33.6" cy="12.4" rx="1.4" ry="0.9" fill="${K}"/>` + eyes(16, 28, 25, 2.4) + l('M16 33q6 4.5 12 0') },
  { id: 'pill', name: 'The Pill', vibe: 'dizzy, kicks in later', s: PILL, rot: 'rotate(-22 24 28)',
    art: `<g transform="rotate(-22 24 28)">${f('M24 20H14A8 8 0 0 0 14 36H24Z', P)}${f('M24 20H34A8 8 0 0 1 34 36H24Z', W)}${eyes(18, 30, 26)}${l('M20.5 31.5q1.75-1.6 3.5 0t3.5 0', K, 2)}</g>` },
  { id: 'cactus', name: 'Cactus', vibe: 'no hugs, do not ask', s: 'M18 28H14Q10 28 10 24V18Q10 16 12 16Q14 16 14 18V24H18ZM30 23H34V15Q34 13 36 13Q38 13 38 15V22Q38 27 34 27H30ZM18 32V14Q18 8 24 8Q30 8 30 14V32H36V37H34L32 47H16L14 37H12V32Z',
    art: f('M18 28H14Q10 28 10 24V18Q10 16 12 16Q14 16 14 18V24H18ZM30 23H34V15Q34 13 36 13Q38 13 38 15V22Q38 27 34 27H30Z', G)
      + f('M18 37V14Q18 8 24 8Q30 8 30 14V37Z', G) + f('M12 32H36V37H12ZM14 37H34L32 47H16Z', O) + `<circle cx="24" cy="7" r="2.8" fill="${P}"/>` + eyes(21.3, 26.7, 21, 1.7) + l('M22 27h4', K, 2) },
  { id: 'flame', name: 'Lil Flame', vibe: 'absolutely lit', s: FLAME,
    art: f(FLAME, O) + f('M24 22C27 28 33 31 32 37C31 42 28 44 24 44C20 44 17 42 16.5 37C16 33 20 31 24 22Z', Y) + eyes(19.5, 28.5, 29) + f('M19.5 34.5h9q0 5-4.5 5t-4.5-5Z', K) },
];

export function castSvg(guy, color) {
  // same offset for everyone; rotated characters rotate their shadow too
  return `<svg viewBox="0 -1 50 52"><g transform="translate(2.8 2.4)"><path d="${guy.s}" fill="${color}"${guy.rot ? ` transform="${guy.rot}"` : ''}/></g>${guy.art}</svg>`;
}
