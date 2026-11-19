// What the announcer says. No player names and no player answers, so every
// line is fixed text that `npm run voice` can record once ahead of time.
// Names are on the screen anyway.

export const LINES = {
  // The how-to, read in order, one line per slide.
  howto: [
    'Welcome to Clapback. Here is how this goes.',
    'The game deals you two random prompts on your phone. Write the funniest answer you can. Or the filthiest. Ideally both.',
    'One other player gets the same prompt. Everybody else votes for the answer they like better.',
    'Points go by share of the vote. Take every single vote, and that is a Clapback.',
    'Round two counts double. In the last round, everybody answers the same prompt.',
    'You cannot vote for yourself. I will know. Phones out.',
  ],
  intro: [
    null,
    [
      'Welcome to Clapback. Your friends are about to find out how disgusting you are.',
      'Round one. Two prompts each. Say the thing you would never say sober.',
    ],
    [
      'Round two. Double points. Double the shame. Your mother is not watching. Probably.',
      'Round two. Everything counts double, including the things you can never take back.',
    ],
    [
      'Last round. One prompt, everybody answers. Nowhere to hide, nobody to blame.',
      'The Pile-On. Everybody answers the same thing. This is where friendships end.',
    ],
  ],
  write: [
    'Phones out. Be filthy. Be fast.',
    'Start typing. Think of the worst thing you can. Now type something worse.',
    'Ninety seconds. Your HR department is not here. Go.',
    'Type something your future employer will never see.',
  ],
  pileOn: ['Everybody answers this one.'],
  or: ['Or.', 'Versus.', 'Or, God help us.', 'Or, somehow.'],
  knockout: [
    'Clapback! Every single vote. That is not a win, that is a crime scene.',
    'Clapback! Loser, take your phone and go stand in the corner.',
    'Clapback! Somebody just got ended in front of everyone.',
  ],
  win: [
    'The room has spoken, and it chose violence.',
    'That was brave. Wrong, but brave.',
    'If you wrote the loser, I would delete that from your phone.',
    'Point taken. The other one, we will discuss privately.',
    'Somebody check on the loser.',
  ],
  tie: ['A tie. Equally horrifying. Equally rewarded.', 'Dead even. You are both going to hell together.'],
  jinx: ['You both wrote the same thing. That says a lot about both of you. Jinx.', 'Same answer, twice. Nobody gets anything. Seek help.'],
  forfeit: ['Somebody did not answer. The other one wins by simply having a pulse.', 'One of you left it blank. Coward.'],
  novotes: ['Nobody voted. Even the room is embarrassed.'],
  empty: ['Neither of you answered. Absolute cowards.'],
  scores: [
    'Here are the scores. Whoever is winning, that explains a lot.',
    'Scoreboard. Last place, have you tried being funny?',
    'Scores. Look at the top. As usual, I assume.',
  ],
  fvote: ['Vote for your favorites. Not your own. I can see you.', 'Pick the funniest. Loyalty is dead. Vote with your crotch.'],
  sweep: ['Clapback! Every single vote. The rest of you should be ashamed.', 'Clapback! A clean sweep. Nothing clean about that answer though.'],
  favorite: ['The crowd has a favorite, for some reason.', 'Crowd favorite. Do with that what you will.'],
  over: [
    'We have a winner. Everyone else, please reflect on your choices.',
    'There is your winner. Please do not make this your entire personality.',
    'Winner. Screenshot it, it will never happen again.',
  ],
  overTie: ['A tie at the top. Nobody wins. Everybody loses. Beautiful.'],
};
