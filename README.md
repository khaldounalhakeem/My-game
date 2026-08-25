# Career Kickoff ⚽

A browser-based soccer career sim. Start as a 16-year-old academy graduate,
train your attributes, play matches, climb the league table, earn transfer
offers, and play out a full career to retirement.

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
