// Interactive lessons taught by the coaches. Each "move" step lists accepted
// moves (uci); `reply` is the opponent's answer played automatically.
export const LESSONS = [
  {
    id: 'pieces', title: 'How the Pieces Move', coach: 'bella', level: 'Beginner', icon: '♞',
    desc: 'Pawns, knights, bishops, rooks, the queen and the king — plus castling, en passant and promotion.',
    steps: [
      { text: '♟️ Pawns move straight forward. On their very first move they may jump two squares! Move the e-pawn two squares forward.', fen: 'k7/8/8/8/8/8/4P3/4K3 w - - 0 1', accept: ['e2e4'], ok: 'Great! That\'s the most popular first move in chess.' },
      { text: '🐴 Knights move in an "L": two squares one way, then one square sideways. They can jump over pieces! Jump the knight to c3.', fen: 'k7/8/8/8/8/8/8/1N2K3 w - - 0 1', accept: ['b1c3'], ok: 'Hop! Knights are tricky because they jump.' },
      { text: '⛪ Bishops slide diagonally as far as they like. Capture the black knight!', fen: 'k7/8/8/6n1/8/8/8/2B1K3 w - - 0 1', accept: ['c1g5'], ok: 'Yum! Bishops love long diagonals.' },
      { text: '🏰 Rooks slide along ranks and files (straight lines). Capture the black rook!', fen: 'k7/8/8/8/r7/8/8/R3K3 w - - 0 1', accept: ['a1a4'], ok: 'Rooks are powerful on open files.' },
      { text: '👑 The queen moves like a rook AND a bishop. She\'s the strongest piece! Capture the bishop.', fen: 'k7/8/8/7b/8/8/8/3QK3 w - - 0 1', accept: ['d1h5'], ok: 'The queen can reach almost anywhere.' },
      { text: '🏯 Castling: move the king two squares toward a rook, and the rook jumps over. It keeps your king safe! Castle kingside.', fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', accept: ['e1g1'], ok: 'Castled! Your king is tucked away safely.' },
      { text: '👻 En passant: when a pawn jumps two squares and lands beside your pawn, you can capture it as if it moved one. Black just played d7-d5. Capture en passant!', fen: 'k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1', accept: ['e5d6'], ok: 'Sneaky! En passant is only allowed right away.' },
      { text: '✨ Promotion: a pawn that reaches the last rank becomes a new piece — usually a queen! Promote your pawn.', fen: 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1', accept: ['e7e8q', 'e7e8r', 'e7e8b', 'e7e8n'], ok: 'A brand-new queen! 🎉' },
    ],
  },
  {
    id: 'mates', title: 'Checkmate Patterns', coach: 'leo', level: 'Beginner', icon: '♚',
    desc: 'Six classic checkmates every player should know by heart.',
    steps: [
      { text: 'Back-rank mate: the black king is trapped behind its own pawns. Deliver checkmate!', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', accept: ['d1d8'], mate: true, ok: 'Back-rank mate! Always give your king some "luft" (air).' },
      { text: 'Scholar\'s mate: the f7 pawn is only defended by the king. Finish it!', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', accept: ['h5f7'], mate: true, ok: 'Checkmate! Now you know how to stop it, too: defend f7 early.' },
      { text: 'Smothered mate: the king is surrounded by its own pieces. A knight finishes the job!', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', accept: ['g5f7'], mate: true, ok: 'Smothered! The most beautiful knight mate.' },
      { text: 'Ladder mate: two rooks work together like a ladder. One controls the 7th rank — use the other to mate!', fen: '6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1', accept: ['b1b8'], mate: true, ok: 'The ladder (or "lawnmower") mate!' },
      { text: 'Arabian mate: a rook and knight team up in the corner. Find the mate!', fen: '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1', accept: ['a7h7'], mate: true, ok: 'One of the oldest known checkmate patterns.' },
      { text: 'The queen kiss: the queen gives mate right next to the king, protected by her own king.', fen: 'k7/8/2K5/8/8/8/8/1Q6 w - - 0 1', accept: ['b1b7'], mate: true, ok: 'A "kiss of death"! 💋' },
    ],
  },
  {
    id: 'opening', title: 'Opening Principles', coach: 'amara', level: 'Beginner', icon: '♙',
    desc: 'Control the center, develop your pieces, castle early. Play a full opening with Coach Amara.',
    steps: [
      { text: 'Principle 1: control the center. Play a central pawn move: e4 or d4.', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', accept: ['e2e4', 'd2d4'], reply: { e2e4: 'e7e5', d2d4: 'd7d5' }, ok: 'Good. Your pawn claims central squares.' },
      { text: 'Principle 2: develop knights before bishops, toward the center. Bring out a knight.', accept: ['g1f3', 'b1c3'], reply: { g1f3: 'b8c6', b1c3: 'g8f6' }, ok: 'Knights on f3 and c3 control the center beautifully.' },
      { text: 'Develop another minor piece — a knight or a bishop.', accept: ['f1c4', 'f1b5', 'f1e2', 'f1d3', 'b1c3', 'g1f3', 'c1f4', 'c1g5', 'c1e3', 'c1d2', 'g2g3'], reply: 'auto', ok: 'More pieces in the game. Development is key!' },
      { text: 'Now get your kingside ready: develop the f1-bishop (or knight) if needed, then castle. Make a developing move or castle.', accept: ['e1g1', 'f1c4', 'f1b5', 'f1e2', 'f1d3', 'g1f3', 'g2g3', 'f1g2'], reply: 'auto', ok: 'Excellent.' },
      { text: 'Principle 3: castle early! Castle kingside now (or develop a piece if castling isn\'t possible yet).', accept: ['e1g1', 'f1c4', 'f1b5', 'f1e2', 'f1d3', 'g1f3', 'f1g2', 'g2g3'], ok: 'Your king is safe and your rook is ready to join the game. That\'s a model opening!' },
    ],
  },
  {
    id: 'tactics', title: 'Basic Tactics', coach: 'maya', level: 'Intermediate', icon: '⚔️',
    desc: 'Forks, skewers, pins and removing the defender.',
    steps: [
      { text: 'The FORK: one piece attacks two targets at once. Find the knight fork that wins the rook!', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', accept: ['b5c7'], ok: 'Nc7+! The king must move and the rook falls.' },
      { text: 'The SKEWER: attack a valuable piece so that when it moves, the piece behind it is lost. Skewer the king and queen!', fen: 'q7/8/8/3k4/8/8/8/3BK3 w - - 0 1', accept: ['d1f3'], ok: 'Bf3+! The king steps aside and the queen on a8 is gone.' },
      { text: 'The PIN: a piece can\'t move because something more valuable stands behind it. Pin the knight to the king!', fen: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', accept: ['f1b5'], ok: 'Bb5! The knight on c6 is pinned to the king.' },
      { text: 'Checks, captures, threats! Find the move that wins the queen.', fen: '3qk3/8/8/8/8/8/8/3RK3 w - - 0 1', accept: ['d1d8'], ok: 'Rxd8+! Always look at captures first.' },
      { text: 'The ROYAL FORK: a knight attacking the king and queen at the same time. Find it!', fen: '4k3/8/8/7N/4q3/8/8/K7 w - - 0 1', accept: ['h5f6'], ok: 'Nf6+! King and queen forked — the queen is lost.' },
    ],
  },
  {
    id: 'endgames', title: 'Essential Endgames', coach: 'kenji', level: 'Beginner–Intermediate', icon: '♔',
    desc: 'Mate with the queen and with the rook, and promote your pawns.',
    steps: [
      { text: 'King and queen vs king: the enemy king is boxed in. Mate in one.', fen: '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', accept: ['f1f8'], mate: true, ok: 'Mate. Queen and king together.' },
      { text: 'King and rook vs king: the kings face each other. The rook delivers mate on the edge.', fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1', accept: ['a1a8'], mate: true, ok: 'Mate. The edge is the king\'s prison.' },
      { text: 'A passed pawn must be pushed. Promote to a queen.', fen: '8/5P2/8/8/8/8/k7/6K1 w - - 0 1', accept: ['f7f8q'], ok: 'A new queen. The game is decided.' },
      { text: 'The opposition: kings facing each other with one square between. Take the opposition to help your pawn! (Hint: put your king directly in front of the black king.)', fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', accept: ['e3e4'], ok: 'Holding the opposition is the key to king and pawn endings.' },
    ],
  },
];
