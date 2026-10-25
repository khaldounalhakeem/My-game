// Persistent settings, stats and game archive (localStorage, failure-tolerant).
const KEY = 'chesshub.v1';

export const DEFAULT_SETTINGS = {
  playerName: 'You',
  boardTheme: 'green',
  pieceSet: 'staunty',
  sound: true,
  volume: 0.8,
  coordinates: 'inside',      // inside | outside | none
  showLegal: true,
  highlightLast: true,
  animation: 200,             // ms
  autoQueen: false,
  premoves: true,
  confirmResign: true,
  figurine: true,
  reviewDepth: 14,
  evalBarInGames: false,
  coachId: 'leo',
  rightClickArrows: true,
  autoFlipFriend: false,
};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
let state = load();
state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
state.stats = { rating: 800, puzzleRating: 1000, puzzleStreak: 0, rushBest: 0, wins: 0, losses: 0, draws: 0, solved: [], botWins: {}, lessonsDone: [], ...(state.stats || {}) };
state.games = state.games || [];

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}

export const store = {
  get settings() { return state.settings; },
  get stats() { return state.stats; },
  get games() { return state.games; },
  setSetting(k, v) { state.settings[k] = v; save(); },
  updateStats(fn) { fn(state.stats); save(); },
  addGame(g) {
    state.games.unshift(g);
    if (state.games.length > 200) state.games.length = 200;
    save();
  },
  updateGame(id, patch) {
    const g = state.games.find(x => x.id === id);
    if (g) { Object.assign(g, patch); save(); }
  },
  deleteGame(id) { state.games = state.games.filter(g => g.id !== id); save(); },
  reset() { state = { settings: { ...DEFAULT_SETTINGS }, stats: {}, games: [] }; save(); location.reload(); },
};
