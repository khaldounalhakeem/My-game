// Bot roster (fictional personalities) and human-like move selection on top of Stockfish.
import { Chess } from '../vendor/chess.js';
import { scoreToCp } from './engine.js';

const S = { light: '#f1c27d', fair: '#ffdbac', tan: '#e0ac69', brown: '#c68642', dark: '#8d5524', deep: '#5c3a1e' };

export const BOT_CATEGORIES = [
  { id: 'beginner', name: 'Beginner', range: '100–800' },
  { id: 'intermediate', name: 'Intermediate', range: '900–1500' },
  { id: 'advanced', name: 'Advanced', range: '1550–2000' },
  { id: 'master', name: 'Master', range: '2100–2500' },
  { id: 'legend', name: 'Legends', range: '2600–3000' },
  { id: 'themed', name: 'Personalities', range: 'Fun styles' },
  { id: 'engine', name: 'Engine', range: 'Stockfish 19' },
];

export const BOTS = [
  // ---------- Beginner ----------
  { id: 'randy', name: 'Random Randy', rating: 100, cat: 'beginner', flag: '🤖', style: 'random', avatar: { robot: true, bg: '#7e57c2', accent: '#ffeb3b' },
    bio: 'Randy picks his moves out of a hat. Literally. A perfect first opponent.',
    chat: { greet: ['Beep boop! I choose moves at random. Good luck!'], win: ['Beep! Even a random robot gets lucky.'], lose: ['Boop... calculation error. Well played!'], blunder: ['Beep? Was that bad?'], good: ['Bzzt! Nice move, human.'] } },
  { id: 'pip', name: 'Pip', rating: 250, cat: 'beginner', flag: '🇬🇧', style: 'normal', avatar: { bg: '#81c784', skin: S.fair, hair: '#f4c542', hairStyle: 'curly', shirt: '#ff7043', blush: true },
    bio: 'Pip just learned how the horsey moves and is VERY excited about it.',
    chat: { greet: ['Hi!! I just learned chess yesterday. Be nice please!'], win: ['I WON?! I can\'t believe it!'], lose: ['Aww. That was fun though! Again?'], blunder: ['Oops! I didn\'t see that.'], good: ['Wow, how did you do that?'] } },
  { id: 'nora', name: 'Nora', rating: 400, cat: 'beginner', flag: '🇨🇦', style: 'normal', avatar: { bg: '#4fc3f7', skin: S.light, hair: '#8d4a1f', hairStyle: 'long', shirt: '#7e57c2' },
    bio: 'Nora plays chess at lunch with her friends. She loves moving her queen out early.',
    opening: { w: [['e4', 'Qh5', 'Bc4']], b: [['e5', 'Qf6']] },
    chat: { greet: ['Hey! Ready for a quick game?'], win: ['Yes! Lunchtime champion!'], lose: ['GG! You\'re good at this.'], blunder: ['Hmm, I should have looked twice.'], good: ['Sneaky!'] } },
  { id: 'bruno', name: 'Bruno', rating: 550, cat: 'beginner', flag: '🇧🇷', style: 'aggressive', avatar: { bg: '#ffb74d', skin: S.tan, hair: '#222', hairStyle: 'spiky', shirt: '#43a047' },
    bio: 'Bruno attacks everything that moves. Defending? Never heard of it.',
    chat: { greet: ['I attack, you defend. Let\'s go!'], win: ['Attack always wins!'], lose: ['Next time I attack harder!'], blunder: ['Bah, too fast!'], good: ['Ooh, nice one.'] } },
  { id: 'sami', name: 'Sami', rating: 700, cat: 'beginner', flag: '🇫🇮', style: 'defensive', avatar: { bg: '#90a4ae', skin: S.fair, hair: '#d7ccc8', hairStyle: 'short', shirt: '#1e88e5', glasses: '#333' },
    bio: 'Sami likes solid, careful chess and a tidy pawn structure.',
    opening: { w: [['d4', 'e3', 'Nf3', 'Bd3']], b: [['d5', 'e6', 'Nf6']] },
    chat: { greet: ['Hello. Let us play a careful game.'], win: ['Slow and steady.'], lose: ['Well played. I learned something.'], blunder: ['That was... imprecise.'], good: ['Good move.'] } },
  { id: 'ivy', name: 'Ivy', rating: 850, cat: 'beginner', flag: '🇮🇪', style: 'normal', avatar: { bg: '#a5d6a7', skin: S.fair, hair: '#c0392b', hairStyle: 'bun', shirt: '#26a69a', blush: true },
    bio: 'Ivy has been playing for a year and just discovered forks. Watch your knights!',
    chat: { greet: ['Hi! Watch out for my forks 😄'], win: ['Fork-tastic!'], lose: ['Great game, really.'], blunder: ['Oh no, my piece!'], good: ['That was clever!'] } },
  // ---------- Intermediate ----------
  { id: 'omar', name: 'Omar', rating: 1000, cat: 'intermediate', flag: '🇪🇬', style: 'normal', avatar: { bg: '#ffcc80', skin: S.brown, hair: '#1b1b1b', hairStyle: 'short', shirt: '#5c6bc0', beard: '#1b1b1b' },
    bio: 'Omar plays at the café every evening and knows a few opening traps.',
    opening: { w: [['e4', 'Nf3', 'Bc4', 'c3']], b: [['e5', 'Nc6', 'Bc5']] },
    chat: { greet: ['Salaam! A friendly game?'], win: ['Good game, my friend.'], lose: ['Excellent play. Tea is on me.'], blunder: ['Ah, I was careless.'], good: ['Very nice.'] } },
  { id: 'lena', name: 'Lena', rating: 1100, cat: 'intermediate', flag: '🇩🇪', style: 'positional', avatar: { bg: '#ce93d8', skin: S.light, hair: '#f5deb3', hairStyle: 'long', shirt: '#37474f' },
    bio: 'Lena studies classic games and loves a good outpost for her knight.',
    opening: { w: [['d4', 'c4', 'Nc3', 'Nf3']], b: [['Nf6', 'e6', 'd5']] },
    chat: { greet: ['Guten Tag! Let\'s have a nice positional game.'], win: ['Structure wins games.'], lose: ['Sehr gut! Well played.'], blunder: ['Ugh, that was sloppy.'], good: ['Precise.'] } },
  { id: 'dax', name: 'Dax', rating: 1200, cat: 'intermediate', flag: '🇺🇸', style: 'aggressive', avatar: { bg: '#ef9a9a', skin: S.fair, hair: '#3e2723', hairStyle: 'short', shirt: '#212121', hat: 'cap', hatColor: '#1565c0', mood: 'smirk' },
    bio: 'Dax plays fast and loves a kingside attack. Trash talk included.',
    chat: { greet: ['Hope you brought your A game.'], win: ['Too easy!'], lose: ['Okay okay, you got me.'], blunder: ['Whatever, I meant that.'], good: ['Not bad...'] } },
  { id: 'priya', name: 'Priya', rating: 1350, cat: 'intermediate', flag: '🇮🇳', style: 'tactical', avatar: { bg: '#ffab91', skin: S.brown, hair: '#111', hairStyle: 'long', shirt: '#d81b60' },
    bio: 'Priya is a puzzle addict. She finds tactics others miss.',
    opening: { w: [['e4', 'Nf3', 'd4']], b: [['c5', 'd6', 'Nf6']] },
    chat: { greet: ['I solved 50 puzzles today. Let\'s see if you\'re one of them!'], win: ['Tactics flow from a superior position!'], lose: ['Wow, you out-calculated me.'], blunder: ['How did I miss that?'], good: ['Great tactic!'] } },
  { id: 'hugo', name: 'Hugo', rating: 1450, cat: 'intermediate', flag: '🇫🇷', style: 'positional', avatar: { bg: '#80cbc4', skin: S.light, hair: '#5d4037', hairStyle: 'short', shirt: '#283593', beard: '#5d4037', glasses: '#795548' },
    bio: 'Hugo is a club player who adores the French Defense and long endgames.',
    opening: { w: [['e4', 'd4', 'e5']], b: [['e6', 'd5', 'c5']] },
    chat: { greet: ['Bonjour! Shall we?'], win: ['Magnifique.'], lose: ['Bravo, well deserved.'], blunder: ['Zut alors!'], good: ['Très bien!'] } },
  // ---------- Advanced ----------
  { id: 'marta', name: 'Marta', rating: 1550, cat: 'advanced', flag: '🇪🇸', style: 'normal', avatar: { bg: '#fff59d', skin: S.tan, hair: '#4e342e', hairStyle: 'bun', shirt: '#c62828' },
    bio: 'Marta coaches the junior team and rarely leaves a piece hanging.',
    opening: { w: [['e4', 'Nf3', 'Bb5']], b: [['e5', 'Nc6', 'a6']] },
    chat: { greet: ['¡Hola! Good luck.'], win: ['Buena partida.'], lose: ['¡Bien jugado!'], blunder: ['Ay, no.'], good: ['¡Excelente!'] } },
  { id: 'felix', name: 'Felix', rating: 1650, cat: 'advanced', flag: '🇦🇹', style: 'tactical', avatar: { bg: '#b39ddb', skin: S.fair, hair: '#ffcc80', hairStyle: 'spiky', shirt: '#00897b' },
    bio: 'Felix plays gambits in every game and has the scars to prove it.',
    opening: { w: [['e4', 'f4', 'Nf3']], b: [['e5', 'exf4']] },
    chat: { greet: ['Pawns are just a down payment on an attack.'], win: ['The gambit pays off!'], lose: ['Gambits giveth, gambits taketh away.'], blunder: ['Hmm, the attack fizzled.'], good: ['Strong!'] } },
  { id: 'zara', name: 'Zara', rating: 1750, cat: 'advanced', flag: '🇰🇪', style: 'normal', avatar: { bg: '#4db6ac', skin: S.dark, hair: '#111', hairStyle: 'curly', shirt: '#fbc02d' },
    bio: 'Zara is a rising national junior star with excellent endgame technique.',
    chat: { greet: ['Hi! Let\'s make it a good one.'], win: ['GG! That endgame was fun.'], lose: ['Well played, truly.'], blunder: ['I\'ll be thinking about that one.'], good: ['Nice find!'] } },
  { id: 'tobias', name: 'Tobias', rating: 1850, cat: 'advanced', flag: '🇸🇪', style: 'positional', avatar: { bg: '#90caf9', skin: S.fair, hair: '#fff176', hairStyle: 'short', shirt: '#455a64', beard: '#fbc02d' },
    bio: 'Tobias plays the Catalan with the patience of a glacier.',
    opening: { w: [['d4', 'c4', 'g3', 'Bg2']], b: [['d5', 'e6', 'Nf6', 'Be7']] },
    chat: { greet: ['Hej. Let\'s play slowly and well.'], win: ['Patience is a weapon.'], lose: ['Very strong play.'], blunder: ['Unfortunate.'], good: ['Accurate.'] } },
  { id: 'aiko', name: 'Aiko', rating: 1950, cat: 'advanced', flag: '🇯🇵', style: 'tactical', avatar: { bg: '#f48fb1', skin: S.fair, hair: '#1a1a1a', hairStyle: 'bun', shirt: '#311b92' },
    bio: 'Aiko is a blitz specialist with lightning-fast tactical vision.',
    opening: { w: [['e4', 'Nf3', 'd4', 'Nxd4']], b: [['c5', 'Nc6', 'g6', 'Bg7']] },
    chat: { greet: ['よろしく! Ready?'], win: ['Thank you for the game!'], lose: ['Impressive. お見事!'], blunder: ['Ah... too hasty.'], good: ['Sharp!'] } },
  // ---------- Master ----------
  { id: 'rafael', name: 'Rafael', rating: 2100, cat: 'master', flag: '🇦🇷', style: 'aggressive', avatar: { bg: '#a1887f', skin: S.tan, hair: '#212121', hairStyle: 'short', shirt: '#0277bd', beard: '#212121', mood: 'smirk' },
    bio: 'Rafael is a candidate master known for brave sacrifices.',
    chat: { greet: ['Hola. Expect fireworks.'], win: ['Fortune favors the bold.'], lose: ['Bravo, you defended well.'], blunder: ['Too ambitious.'], good: ['Impressive.'] } },
  { id: 'sofia', name: 'Sofia', rating: 2200, cat: 'master', flag: '🇮🇹', style: 'positional', avatar: { bg: '#e6ee9c', skin: S.light, hair: '#3e2723', hairStyle: 'long', shirt: '#6a1b9a', glasses: '#212121' },
    bio: 'Sofia is a FIDE Master and a deep opening theoretician.',
    chat: { greet: ['Ciao. Let\'s see your preparation.'], win: ['Theory and technique.'], lose: ['Complimenti, very well played.'], blunder: ['A rare oversight.'], good: ['Very good.'] } },
  { id: 'dmitri', name: 'Dmitri', rating: 2300, cat: 'master', flag: '🇺🇦', style: 'normal', avatar: { bg: '#78909c', skin: S.fair, hair: '#bdbdbd', hairStyle: 'bald', shirt: '#263238', beard: '#9e9e9e', glasses: '#424242', mood: 'angry' },
    bio: 'Dmitri is a strict old-school master. He expects your best.',
    chat: { greet: ['Sit. Play.'], win: ['Study more endgames.'], lose: ['Hm. Not bad. Not bad at all.'], blunder: ['Unacceptable!'], good: ['Correct.'] } },
  { id: 'elena', name: 'Elena', rating: 2450, cat: 'master', flag: '🇬🇪', style: 'tactical', avatar: { bg: '#ffe082', skin: S.light, hair: '#111', hairStyle: 'long', shirt: '#b71c1c', mood: 'smirk' },
    bio: 'Elena is an International Master with a razor-sharp attacking style.',
    chat: { greet: ['Let\'s play something sharp.'], win: ['That attack was beautiful.'], lose: ['Very well calculated.'], blunder: ['I got carried away.'], good: ['Strong move!'] } },
  // ---------- Legend ----------
  { id: 'orion', name: 'GM Orion', rating: 2650, cat: 'legend', flag: '🌌', style: 'normal', avatar: { bg: '#283593', skin: S.brown, hair: '#e0e0e0', hairStyle: 'short', shirt: '#000', beard: '#e0e0e0', glasses: '#ffd54f' },
    bio: 'A fictional grandmaster who has seen every opening a thousand times.',
    chat: { greet: ['Show me what you\'ve learned.'], win: ['A good effort. Review it carefully.'], lose: ['Remarkable. You have a bright future.'], blunder: ['Even grandmasters err.'], good: ['A master\'s move.'] } },
  { id: 'professor', name: 'The Professor', rating: 2800, cat: 'legend', flag: '🎓', style: 'positional', avatar: { bg: '#5d4037', skin: S.fair, hair: '#fafafa', hairStyle: 'curly', shirt: '#3e2723', glasses: '#000', beard: '#fafafa', hat: 'wizard', hatColor: '#4527a0' },
    bio: 'The Professor has written 40 books on positional chess. None of them are short.',
    chat: { greet: ['Ah, a new student. Begin.'], win: ['Class dismissed.'], lose: ['Extraordinary! I must update my lecture notes.'], blunder: ['A deliberate teaching moment, of course.'], good: ['Textbook.'] } },
  { id: 'nova', name: 'Nova', rating: 3000, cat: 'legend', flag: '✨', style: 'normal', avatar: { robot: true, bg: '#0d47a1', accent: '#00e5ff' },
    bio: 'Nova is an experimental AI that plays almost perfectly. Almost.',
    chat: { greet: ['Initializing game. Probability of your victory: 0.3%.'], win: ['As calculated.'], lose: ['Anomaly detected. Congratulations, human.'], blunder: ['Recalibrating.'], good: ['Interesting.'] } },
  // ---------- Themed ----------
  { id: 'gambit-gary', name: 'Gambit Gary', rating: 1300, cat: 'themed', flag: '🎲', style: 'aggressive', avatar: { bg: '#ff8a65', skin: S.fair, hair: '#6d4c41', hairStyle: 'mohawk', shirt: '#000' },
    bio: 'Gary sacrifices a pawn on move two in every single game. No exceptions.',
    opening: { w: [['e4', 'd4', 'c3'], ['e4', 'f4'], ['d4', 'e4']], b: [['e5', 'Nc6', 'Nf6', 'Bc5'], ['d5', 'e5']] },
    chat: { greet: ['Free pawn for you! Take it. I dare you.'], win: ['GAMBITS ARE SOUND!'], lose: ['The gambit was sound, I just... wasn\'t.'], blunder: ['All part of the plan.'], good: ['Nice.'] } },
  { id: 'fortress', name: 'Fortress Fiona', rating: 1500, cat: 'themed', flag: '🏰', style: 'defensive', avatar: { bg: '#8d6e63', skin: S.light, hair: '#bf360c', hairStyle: 'long', shirt: '#546e7a', hat: 'crown' },
    bio: 'Fiona builds walls. Breaking through will take patience.',
    opening: { w: [['d4', 'Nf3', 'Bf4', 'e3', 'c3']], b: [['c6', 'd5', 'Bf5', 'e6']] },
    chat: { greet: ['My castle will not fall.'], win: ['The walls held.'], lose: ['You breached the fortress. Well done.'], blunder: ['A crack in the wall!'], good: ['Clever siege.'] } },
  { id: 'queeny', name: 'Queen Quinn', rating: 650, cat: 'themed', flag: '👑', style: 'aggressive', avatar: { bg: '#f06292', skin: S.tan, hair: '#4a148c', hairStyle: 'long', shirt: '#880e4f', hat: 'crown' },
    bio: 'Quinn believes the queen should do all the work. All of it.',
    opening: { w: [['e4', 'Qh5', 'Bc4', 'Qxf7']], b: [['e5', 'Qh4']] },
    chat: { greet: ['My queen will handle this.'], win: ['Long live the queen!'], lose: ['My queen... needed friends.'], blunder: ['Not my queen!'], good: ['Royal move.'] } },
  { id: 'pawnstorm', name: 'Pawnstorm Pete', rating: 1150, cat: 'themed', flag: '⛈️', style: 'pawns', avatar: { bg: '#4dd0e1', skin: S.fair, hair: '#795548', hairStyle: 'short', shirt: '#0d47a1', hat: 'beanie', hatColor: '#0d47a1' },
    bio: 'Pete pushes pawns. Lots of pawns. Toward your king.',
    chat: { greet: ['Storm\'s coming!'], win: ['The storm swept you away!'], lose: ['The storm passed...'], blunder: ['Lightning strikes the wrong place!'], good: ['Weathered it well.'] } },
  { id: 'trader', name: 'Trader Tom', rating: 950, cat: 'themed', flag: '🔄', style: 'trader', avatar: { bg: '#aed581', skin: S.dark, hair: '#212121', hairStyle: 'short', shirt: '#2e7d32', glasses: '#000', mood: 'cool' },
    bio: 'Tom trades every piece he can. Endgame or bust!',
    chat: { greet: ['Let\'s make a deal. Lots of deals.'], win: ['Profitable trades all around.'], lose: ['Bad investment.'], blunder: ['That trade didn\'t add up.'], good: ['Shrewd.'] } },
];

// Engine levels (Stockfish Skill Level)
export const ENGINE_LEVELS = Array.from({ length: 10 }, (_, i) => ({
  level: i + 1,
  skill: [0, 3, 5, 8, 10, 12, 14, 16, 18, 20][i],
  depth: [3, 5, 7, 9, 11, 13, 15, 17, 19, 22][i],
  rating: [1350, 1500, 1700, 1900, 2100, 2300, 2500, 2700, 2900, 3200][i],
  movetime: [150, 250, 350, 500, 700, 900, 1200, 1500, 2000, 2500][i],
}));

export function engineBot(level) {
  const L = ENGINE_LEVELS[level - 1];
  return {
    id: 'stockfish-' + level, name: `Stockfish Lv ${level}`, rating: L.rating, cat: 'engine', flag: '🐟', style: 'engine', engineLevel: L,
    avatar: { engine: true }, bio: 'Stockfish 19 — the strongest open-source chess engine in the world.',
    chat: { greet: ['Engine ready.'], win: ['1-0.'], lose: ['Congratulations.'], blunder: [''], good: [''] },
  };
}

export function botById(id) {
  if (id && id.startsWith('stockfish-')) return engineBot(+id.split('-')[1]);
  return BOTS.find(b => b.id === id);
}

export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function repertoireMove(chess, bot) {
  if (!bot.opening) return null;
  const color = chess.turn();
  const mine = bot.opening[color];
  if (!mine) return null;
  // Our own moves so far must match a line prefix; opponent moves are free.
  const hist = chess.history({ verbose: true }).filter(m => m.color === color).map(m => m.san);
  const cands = mine.filter(line => line.length > hist.length && hist.every((s, i) => line[i] === s));
  for (const line of cands.sort(() => Math.random() - 0.5)) {
    const san = line[hist.length];
    const legal = chess.moves();
    if (legal.includes(san) || legal.includes(san + '+') || legal.includes(san + '#')) return legal.find(m => m.replace(/[+#]/, '') === san.replace(/[+#]/, ''));
  }
  return null;
}

function styleBonus(chess, uci, style) {
  const c = new Chess(chess.fen());
  let m;
  try { m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return 0; }
  if (!m) return 0;
  let b = 0;
  if (style === 'aggressive' || style === 'tactical') { if (c.isCheck()) b += 30; if (m.captured) b += 20; }
  if (style === 'aggressive') { const toward = m.color === 'w' ? +m.to[1] - +m.from[1] : +m.from[1] - +m.to[1]; b += toward * 6; }
  if (style === 'defensive') { if (m.piece === 'k' && (m.flags.includes('k') || m.flags.includes('q'))) b += 40; if (m.captured) b -= 5; }
  if (style === 'trader' && m.captured && ['n', 'b', 'r', 'q'].includes(m.captured)) b += 60;
  if (style === 'pawns' && m.piece === 'p') b += 45;
  if (style === 'positional' && (m.piece === 'n' || m.piece === 'b')) b += 10;
  return b;
}

/**
 * Choose a move for a bot. Returns SAN (or {from,to,promotion}) and a "think time" in ms.
 */
export async function chooseBotMove(engine, chess, bot) {
  const legal = chess.moves({ verbose: true });
  if (!legal.length) return null;
  const r = bot.rating;

  if (bot.style === 'random') {
    const caps = legal.filter(m => m.captured);
    const m = Math.random() < 0.3 && caps.length ? pick(caps) : pick(legal);
    return { move: m.san, think: 400 + Math.random() * 700 };
  }

  const ply = chess.history().length;
  const book = ply < 16 ? repertoireMove(chess, bot) : null;
  if (book && Math.random() < 0.92) return { move: book, think: 300 + Math.random() * 500 };

  if (bot.engineLevel) {
    const L = bot.engineLevel;
    const res = await engine.analyse(chess.fen(), { depth: L.depth, movetime: L.movetime, skill: L.skill, multipv: 1 });
    return { move: res?.bestmove, think: 200 };
  }

  // Human-like: shallow-ish search, softmax over candidate moves by eval loss
  const depth = Math.max(1, Math.min(18, Math.round(1 + (r - 100) / 160)));
  const multipv = Math.min(legal.length, r < 1800 ? 8 : 5);
  const res = await engine.analyse(chess.fen(), { depth, multipv });
  if (!res || !res.lines.length) return { move: pick(legal).san, think: 500 };
  const sign = chess.turn() === 'w' ? 1 : -1;
  const lines = res.lines.map(l => ({ uci: l.pv[0], s: sign * scoreToCp(l) }));

  // Occasional outright blunder (a random legal move), more likely at low ratings
  const blunderP = Math.max(0, 0.25 - r * 0.00018);
  if (Math.random() < blunderP) {
    const weighted = legal.flatMap(m => (m.captured || m.san.includes('+')) ? [m, m, m] : [m]);
    return { move: pick(weighted).san, think: 400 + Math.random() * 1200 };
  }
  const best = Math.max(...lines.map(l => l.s));
  // Don't miss mate-in-one / huge wins too often at higher ratings
  const T = Math.max(6, 420 * Math.exp(-r / 430));
  const weights = lines.map(l => {
    const loss = Math.max(0, Math.min(2000, best - l.s - styleBonus(chess, l.uci, bot.style)));
    return Math.exp(-loss / T);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let x = Math.random() * total, chosen = lines[0];
  for (let i = 0; i < lines.length; i++) { x -= weights[i]; if (x <= 0) { chosen = lines[i]; break; } }
  const think = 500 + Math.random() * (r > 1800 ? 1800 : 1200);
  return { move: { from: chosen.uci.slice(0, 2), to: chosen.uci.slice(2, 4), promotion: chosen.uci[4] }, think };
}
