# Career Kickoff ⚽

A browser-based soccer career sim. Start as a 16-year-old academy graduate
in the fictional Development League, train your attributes, and climb your
way into the real Ligue 1, Bundesliga, Serie A, La Liga, and Premier League
(50 real clubs across those five, plus 10 fictional starter clubs) via
end-of-season transfer offers, all the way to retirement.

Each match day you choose: **Play Match** to watch it unfold with live
commentary, or **Sim Match** to instantly resolve it and jump straight to
next week — handy once you're up against a side you know you'll beat.

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
