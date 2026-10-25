// App shell: hash router, sidebar, global settings application.
import { store } from './storage.js';
import { $, $$, avatar, playerAvatarSpec } from './ui.js';
import { sound } from './sound.js';

const routes = {
  home: () => import('./screens/home.js'),
  bots: () => import('./screens/bots.js'),
  play: () => import('./screens/game.js'),
  friend: () => import('./screens/friend.js'),
  review: () => import('./screens/review.js'),
  analysis: () => import('./screens/analysis.js'),
  puzzles: () => import('./screens/puzzles.js'),
  learn: () => import('./screens/learn.js'),
  lesson: () => import('./screens/learn.js'),
  coaches: () => import('./screens/coaches.js'),
  archive: () => import('./screens/archive.js'),
  settings: () => import('./screens/settings.js'),
};

// In-memory hand-off between screens (e.g. game config, PGN to review)
export const app = { pending: null };

let cleanup = null;
let navToken = 0;

export function go(route, payload) {
  if (payload !== undefined) app.pending = payload;
  const hash = '#/' + route;
  if (location.hash === hash) render(); else location.hash = hash;
}

async function render() {
  const token = ++navToken;
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const route = routes[name] ? name : 'home';
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  document.getElementById('modal-root').innerHTML = '';
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.go === route || (route === 'play' && a.dataset.go === 'bots') || (route === 'lesson' && a.dataset.go === 'learn')));
  const main = $('#main');
  main.innerHTML = '';
  const mod = await routes[route]();
  if (token !== navToken) return;
  const payload = app.pending;
  app.pending = null;
  window.scrollTo(0, 0);
  cleanup = (await mod.render(main, { params: rest, payload, route })) || null;
}

export function applySettings() {
  const s = store.settings;
  document.body.dataset.board = s.boardTheme;
  $('#side-name').textContent = s.playerName;
  $('#side-rating').textContent = `♟ ${store.stats.rating}  🧩 ${store.stats.puzzleRating}`;
  $('#side-avatar').innerHTML = avatar(playerAvatarSpec(), 32);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if (t && !t.closest('.main')) { e.preventDefault(); go(t.dataset.go); }
});
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });
window.addEventListener('hashchange', render);
applySettings();
render();
