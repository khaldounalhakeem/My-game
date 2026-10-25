# Credits & licenses

| Component | Author | License |
| --- | --- | --- |
| Stockfish 19 (`vendor/stockfish/`) | The Stockfish developers; WASM port by Nathan Rugg (stockfish.js) | GPLv3 (see `vendor/stockfish/COPYING.txt`) |
| chess.js (`vendor/chess.js`) | Jeff Hlywa and contributors | BSD-2-Clause (see `vendor/chess.js.LICENSE`) |
| Opening names (`data/openings.js`) | lichess-org/chess-openings | CC0 |
| Sounds (`assets/sounds/`) | lichess.org (lila) | AGPLv3+ |
| Piece set `cburnett` | Colin M.L. Burnett | GPLv2+ |
| Piece set `merida` | Armando Hernandez Marroquin | GPLv2+ |
| Piece set `alpha` | Eric Bentzen, via lichess | free for personal use / lichess AGPLv3+ |
| Piece set `pixel` | therealqtpi, via lichess | AGPLv3+ |
| Piece set `chessnut` | Alexis Luengas | Apache 2.0 |
| Piece set `fantasy` | Maurizio Monge | MIT |
| Piece sets `staunty`, `maestro`, `cardinal`, `tatiana`, `fresca` | sadsnake1 | CC BY-NC-SA 4.0 |
| Piece set `california` | Jerry S. | CC BY-NC-SA 4.0 |

Piece sets and sounds were taken from the [lichess.org](https://github.com/lichess-org/lila) repository. The CC BY-NC-SA sets are for **non-commercial use only**. If you want to use this project commercially, remove them from `assets/pieces/` and from `PIECE_SETS` in `js/screens/settings.js`.

All bots, coaches and their avatars are fictional and drawn procedurally (`js/avatars.js`). The puzzles were generated from Stockfish self-play (`tools/gen-puzzles.mjs`).
