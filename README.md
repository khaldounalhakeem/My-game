# Career Kickoff ⚽

A browser-based soccer career sim. Create your player — name, position,
nation, hair color, and jersey colors — then pick which of three
Development League clubs gives you your start. Train your attributes,
climb your way into the real Ligue 1, Bundesliga, Serie A, La Liga, and
Premier League (50 real clubs across those five, plus 10 fictional starter
clubs) via end-of-season transfer offers, and chase the UEFA Champions
League (if you finish top 6) and a World Cup with your nation (every 4
seasons, if you're good enough) — all the way to retirement.

Each match day you choose: **Play Match** for a live match — a real-time
90-minute clock with a running score and commentary feed (compressed to
about 2 minutes, with a Skip to Full Time button if you don't want to
wait) — or **Sim Match** to instantly resolve it and jump straight to next
week, handy once you're up against a side you know you'll beat.

Every club (and nation) gets its own generated crest with a rating badge —
original artwork, not real team logos, since those are trademarked.

## How to play

No install or build step needed — it's plain HTML/CSS/JS.

1. Open `index.html` directly in a browser, **or** serve the folder locally:
   ```
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000`.
2. Create a player: enter a name and pick a position (GK, DEF, MID, FWD).
3. Each week, spend your 2 training sessions improving attributes (or rest
   to recover fitness/morale), then play the match.
4. After 18 weeks the season ends — see the final table, review transfer
   offers, and begin the next season.
5. Play until age 35, when your player retires and you get a full career
   summary (appearances, goals, assists, trophies, season-by-season stats).

Progress autosaves to the browser's local storage after every action.

## Files

- `index.html` — screen markup
- `style.css` — styling
- `game.js` — all game logic (player, training, match simulation, league
  table, transfers, aging/retirement, save/load)
