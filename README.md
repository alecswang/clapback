# Clapback

A free party game for one shared screen. The laptop or TV shows the game and everyone plays from a phone browser. Nobody installs anything or makes an account.

## Play

```
npm install
npm start
```

Open `http://localhost:3030/host` on the big screen. Phones scan the QR code, or type the address on screen and the four-letter room code. The first player to join gets a start button. The big screen has one too.

Phones have to be on the same Wi-Fi as the laptop. Campus networks like eduroam often block phone-to-laptop traffic. When that happens, or when a friend is somewhere else, run `npm run party`. It opens a free Cloudflare tunnel and puts a public link in the QR code. The link dies when you press Ctrl+C. It needs `cloudflared` (`brew install cloudflared`).

Big screen keys are Space to start or skip ahead, M to mute, F for fullscreen. Space does not cut the typing phase short. Use the Skip button for that.

The big screen plays a synthesized funk loop and an announcer that reads the prompts and its own lines aloud. Player answers and names are never read. The announcer voice is recorded once with ElevenLabs: put `ELEVENLABS_API_KEY` in the project's env file and run `npm run voice`, which saves every line to `public/voice/` so a game night makes no API calls. Rerun it after adding prompts. Anything without a recording uses the browser's built-in speech. Music and voice have their own buttons in the corner. Browsers stay silent until someone clicks or presses a key on the big screen once.

## Games

**Clapback** takes 3 to 10 players and about 15 minutes. Each player gets two prompts and answers them in secret. Every prompt went to two players, so the room sees both answers side by side and votes. Round two is worth double. In the last round everyone answers the same prompt and everyone votes.

Points follow the vote share. A win adds a bonus. Taking every vote, with at least two voters, adds a bigger one and slams a CLAPBACK banner across the screen. The same rule applies in the last round. A blank answer hands the other player the points. Two identical answers score nothing.

Prompts come from one of four decks, picked with the chips on the big-screen lobby: NSFW (adults only, the default), Classic (clean), Online (phones, group chats, dating apps) and Unhinged (weird what-ifs). Each holds about 150 head-to-head prompts and 30 last-round prompts in `games/clapback/decks/`. The server remembers which prompts it has dealt from each deck, so repeat games stay fresh. Add your own inside jokes to any deck, then rerun `npm run voice`.

A narrated how-to plays before round one. Space, the Skip button, or the first player's phone skips it. Every player gets a different character from a cast of sixteen flat party objects, printed with their color as an offset shadow. `public/guys.html` shows the whole cast.

## Host it online

`render.yaml` sets Clapback up as a free Render web service. On render.com choose New, then Blueprint, and pick this repo. Every push redeploys it. The free plan sleeps after 15 idle minutes, so point a free uptime checker such as UptimeRobot at `https://<your-app>.onrender.com/healthz` every 10 minutes to keep it awake.

## Test alone

Open `http://localhost:3030/demo` to watch a full game play itself. The page shows the big screen next to four phones on autopilot, with a caption for each phase. The Start at buttons jump straight to round two or the last round (`/demo?round=3`).

`npm test` plays full games over real sockets with fake players and checks scoring, timers, reconnects and the room rules.

`npm run bots -- ABCD 4` drops four fake players into room ABCD so you can click through a game by yourself. Add `?slot=2` to the phone address to open a second player in the same browser.

## Add a game

A game is two folders. `games/<id>/index.js` holds the rules and runs on the server. `public/games/<id>/` holds `host.js` for the big screen and `play.js` for phones. Register the game in `games/index.js` and `public/games/registry.js`. The lobby, room codes, reconnects, timers and player chips are already shared. `games/clapback` is the reference.
