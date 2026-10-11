# Boost League

Rocket-powered car soccer that runs in the browser and is built for iPad touch controls. It's inspired by Rocket League and written from scratch with three.js. There's no build step and no server.

## Play

- **On iPad:** open `index.html` from any static host (for example GitHub Pages: Settings → Pages → deploy from the `main` branch root). In Safari, tap Share → **Add to Home Screen** to play fullscreen in landscape.
- **As a single file:** `dist/boost-league.html` contains the whole game (three.js included) and works offline.
- **Locally:** `npx http-server .` and open `http://localhost:8080`.

## What's in it

**Car physics, using Rocket League's published constants:** throttle and steering curves, 2300 uu/s top speed, supersonic at 2200, boost (33.3/s, pads give 12 or 100), powerslide, driving on curved walls and the ceiling, sticky wheels, variable-height jump, double jump, directional flips (front, back, side, diagonal), flip cancels, half-flips, air roll (free and directional), flip resets off the ball, pinches (ball squeezed against a wall or the floor), automatic self-righting, demolitions and bumps.

**Six hitbox types:** Striker (Octane), Phantom (Dominus), Blade (Breakout), Wedge (Plank), Hybrid X and Bulwark (Merc).

**Ball:** spin and friction, a hit impulse that scales with relative speed, and a 6000 uu/s speed cap.

**Modes:** Soccar, Hoops, Snow Day (puck), Rumble (12 power-ups), Heatseeker and Dropshot (breakable hex tiles). 1v1, 2v2 or 3v3 against Rookie, Pro or All-Star bots.

**Match rules:** kickoff countdown on the real spawn spots, a clock that starts on the first touch, the "ball must hit the ground at 0:00" rule, overtime, goal explosions that push cars away, instant replays, MVP, and scoring for goals, assists, saves, epic saves, shots, clears, centers, aerial hits and demos.

**Mutators:** match length, max score, game speed, ball speed, ball type, ball weight, ball size, bounciness, boost amount, gravity, demolish rules and respawn time.

**Training:** Striker, Goalie and Aerial packs, plus Free Play. Free Play tools on the controller: D-pad ↑ shoot the ball at me, ↓ ball to center, ← aerial ball, → wall/pinch ball, L1 rewind 3 seconds, R1 freeze ball, L3 reset car. The same tools are on-screen buttons for touch.

**Ranked:** every mode has its own rank: Soccar Duel, Doubles and Standard, plus Hoops, Rumble, Heatseeker, Dropshot and Snow Day. Everyone starts at Supersonic Legend against near-perfect bots. Losses drop you, faster on a losing streak, until you settle at the rank you can hold, and wins climb you back up. Ranks run from Bronze I to Supersonic Legend with divisions I–IV, and bots play at your rank. Leaving a ranked match early counts as a loss. Results are saved the instant a match ends.

**Online parties:** tap ONLINE → CREATE PARTY to get a 5-letter code; friends tap JOIN PARTY and type it. Pick teams, mode (Soccar, Hoops, Snow Day, Heatseeker, Dropshot), 1v1–3v3 and arena; bots fill empty spots. The party leader's device runs the match (ball, score, bots) and each player's device drives their own car. Works when the game is opened as a Claude artifact shared with your friends (signed in; not by public link).

**Casual:** Adaptive bots by default. A hidden rating goes up when you win and down when you lose, and the bots follow it. Fixed Rookie, Pro and All-Star bots are still available.

**Progression:** XP and levels, item drops with rarities, and career stats.

**Saving:** when played as a Claude artifact, progress (profile, ranks, garage, settings) is saved to your Claude account, so it survives closing the game or clearing Safari data. Otherwise it is saved on the device.

**Garage:** car bodies, paint, decals, wheels, boost trails, goal explosions, toppers and antennas.

**Arenas:** 8 themed maps with weather (snow, rain, underwater bubbles), stadium crowds, a blimp and scenery.

**Chat and HUD:** quick chat with bot banter, a scoreboard, demolition feed, an off-screen ball arrow and a boost meter.

**Audio:** procedural Web Audio for the engine, boost, hits, goal horn, crowd and menu music.

**Controls:**
- Touch: a floating stick, and buttons you can slide your thumb between.
- Game controllers through the Gamepad API.
- Keyboard: W/S drive and pitch, A/D steer, Space jump, Shift boost, X drift/air roll, Q/E directional roll, B ball cam, F use item, Esc pause, 1–4 quick chat.

## Code

| File | Contents |
| --- | --- |
| `src/core.js` | constants, curves, settings and profile storage |
| `src/cloud.js` | cloud save to the artifact database (falls back to on-device storage) |
| `src/ranks.js` | ranks, placements, MMR and bot skill scaling |
| `src/arena.js` | arena signed-distance field (collisions), boost pad and spawn layouts, Dropshot tiles |
| `src/car.js` | car physics |
| `src/ball.js` | ball physics, car↔ball and car↔car collisions, ball prediction |
| `src/ai.js` | bots |
| `src/game.js` | match flow and all game modes |
| `src/net.js` | online parties: party codes, lobby, host/guest match sync |
| `src/render.js`, `src/fx.js` | three.js scene, models, camera and particles |
| `src/audio.js`, `src/input.js`, `src/ui.js`, `src/main.js` | sound, controls, menus and HUD, main loop |

`node tools/build.js` rebuilds `dist/`. `node tools/sim-test.js <path-to-three.cjs>` runs headless bot matches as a physics smoke test.
