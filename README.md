# NeuroSpark — free brain training

A free, open, ad-free brain-training web app inspired by apps like Lumosity. It has
**23 adaptive games** in 7 skill areas, a **daily workout**, streaks, a **Brain Index**,
and progress charts. It runs fully in the browser, works offline and can be installed
on your phone's home screen.

## Games

| Area | Games |
| --- | --- |
| Memory | Grid Recall · Echo Sequence · Memory Pairs · Back Track (n-back) |
| Speed | Symbol Match · Number Trail · Go Signal |
| Attention | Color Clash (Stroop) · Arrow Flock (flanker) · Odd One Out · Wide View |
| Flexibility | Drift · Rule Shift · Sort Rule |
| Problem Solving | Mirror Shapes · Pattern Logic · Block Count |
| Language | Word Hunt · Real or Not · Unscramble |
| Math | Quick Sums · Operator · More or Less |

## Features

- **Daily workout**: 5 games a day from different skill areas. You can swap any game.
- **Adaptive difficulty**: each game has 20 levels. Score 85%+ accuracy to level up.
- **Scoring**: get answers right in a row to raise your multiplier (up to ×5).
- **Progress**: Brain Index per skill, a radar chart, an activity heat map, score
  trends and personal bests.
- **Streaks** and a weekly calendar.
- **Private**: all data stays in your browser's localStorage. You can export and
  import backups from Settings.
- Light and dark themes, sound effects, vibration, keyboard shortcuts, and
  touch/swipe controls.

## Run it

No build step and no dependencies. Serve the folder with any static file server:

```sh
npx http-server .        # or: python3 -m http.server
```

Then open http://localhost:8080. Opening `index.html` directly also works, but you
won't get offline support.

**Publish it for free with GitHub Pages:** go to repository Settings → Pages, pick
"Deploy from a branch", then choose your branch and `/ (root)`.

## Project layout

```
index.html            app shell
css/style.css         all styles
js/core.js            utilities, storage, daily workout, Brain Index, sound
js/engine.js          game shell: intro, countdown, HUD, scoring, pause, results
js/app.js             pages: Today, Games, Progress, Settings
js/games/*.js         the games, grouped by skill area
js/data/words.js      word lists for the language games
sw.js                 service worker for offline play
```

To add a game, call `NS.registerGame({...})` in a file under `js/games/`. The
existing games show the API: `start(ctx)` gets `ctx.stage`, `ctx.level`, `ctx.hit()`,
`ctx.miss()`, `ctx.later()` and `ctx.finish()`.

## Credits

The word lists come from [SCOWL](http://wordlist.aspell.net/) © Kevin Atkinson
(see `WORDLIST-LICENSE.txt`). NeuroSpark is not affiliated with Lumosity or Lumos Labs.
Brain games are fun practice, not a medical tool.
