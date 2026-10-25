# ♞ Chess Arena

A full chess website in the style of the big chess sites, running entirely in your browser — no server, no account. Everything is powered by **Stockfish 19** (WebAssembly).

## Features

**Play**
- **30+ bots** from *Random Randy* (100) to *Nova* (3000), each with its own avatar, rating, style (aggressive, positional, tactical, defensive, trader, pawn-storm…), opening repertoire and chat lines. Plus **Stockfish levels 1–10**.
- Human-like bot play: shallow search plus weighted move choice and occasional blunders, scaled to rating.
- Time controls (bullet, blitz, rapid, classical, or no timer), increments, low-time warning, flag detection.
- Assistance toggles: **hints** (piece first, then the move), **takebacks**, **evaluation bar**, **threat warnings**, **coach mode**.
- **Play a Friend** on one device, with clocks, auto-flip and custom starting FEN.
- Draw offers (bots decide based on the evaluation), resign, abort, rematch, bot ratings (Elo), ✅ for beaten bots.
- Games survive a page refresh.

**Board**
- 12 real piece sets (Staunty, Classic/cburnett, Maestro, Merida, Alpha, California, Cardinal, Tatiana, Fresca, Chessnut, Fantasy, Pixel) and 14 board themes.
- Drag-and-drop *and* click-to-move, legal-move dots and capture rings, last-move and check highlights, smooth animations.
- **Premoves**, promotion picker (or auto-queen), right-click **arrows** and square **highlights** (Shift/Alt/Ctrl change colours), L-shaped knight arrows.
- Coordinates, captured pieces with material difference, opening name (3,800+ named positions), figurine notation, keyboard navigation (← → ↑ ↓, F to flip).
- Move sounds: move, capture, castle, check, promote, game start/end, low time.

**Game Review**
- Every move classified: **Brilliant !!, Great !, Best ★, Excellent, Good, Book, Inaccuracy ?!, Mistake ?, Miss ✕, Blunder ??**, plus Forced.
- Accuracy for both players, estimated **game rating**, per-phase grades (opening, middlegame, endgame), class counts, clickable **evaluation graph**, **key moments**.
- A coach explains each move: what it does, why it was bad (hanging pieces, forks, allowed mates…), the better move and the engine line.
- **Retry** your mistakes, see the **Best** move, **Show follow-up**, and **explore** any position with live evaluation.
- Review any game: your own games, imported PGNs, or analysis-board lines.

**Coaches.** Six fictional coaches, each with a different personality: friendly Leo, tactical Maya, strict Viktor, positional Amara, zen Kenji, and Bella for kids. They narrate reviews, comment live in coach mode, warn about threats and teach lessons.

**Puzzles.** Stockfish-verified tactics with unique solutions: rated mode (your own puzzle rating plus streaks), **Puzzle Rush** (3 minutes, 3 strikes, personal best), and themes (mate in 1/2/3, win material, quiet moves…). Hints, solutions, and "analyse".

**Learn.** Interactive lessons: how the pieces move (including castling, en passant and promotion), checkmate patterns, opening principles, basic tactics and essential endgames.

**Analysis.** Stockfish 19 with 3 lines, depth readout, best-move arrows, click-to-play lines, PGN/FEN import and export, PGN download, and one-click Game Review.

**My Games.** An archive of every game, with filters, review, analysis, PGN download, export-all and delete.

## Running it

The engine runs in a Web Worker, so the folder must be served over HTTP (opening `index.html` as a file won't work):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static host works too (GitHub Pages, Netlify…), and no build step is needed.

## Project layout

```
index.html            app shell
css/style.css         all styling (dark theme, board themes, responsive)
js/app.js             hash router
js/board.js           interactive board (drag/click, premoves, arrows, promotion, animation)
js/engine.js          Stockfish UCI wrapper (Web Worker)
js/bots.js            bot roster + human-like move selection
js/review.js          analysis, move classification, accuracy, game rating
js/explain.js         turns engine output into coach sentences
js/coaches.js         coach personalities
js/lessons.js         lesson content
js/screens/*.js       pages: home, bots, game, friend, review, analysis, puzzles, learn, coaches, archive, settings
data/openings.js      generated opening names (from lichess chess-openings, CC0)
data/puzzles.js       generated puzzles
tools/                generators: openings, puzzles (Stockfish self-play), lesson verifier
vendor/               chess.js and Stockfish 19 (lite, single-threaded WASM)
assets/               piece sets, sounds, logo
```

Regenerating data (needs Node 18+ and `npm install`):

```bash
npm run build:openings
npm run gen:puzzles && npm run build:puzzles
npm run verify:lessons
```

## Credits

See [CREDITS.md](CREDITS.md). Stockfish is GPLv3, so this project is distributed under GPL-3.0-or-later.
