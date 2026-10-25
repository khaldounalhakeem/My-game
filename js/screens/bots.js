import { store } from '../storage.js';
import { go } from '../app.js';
import { BOTS, BOT_CATEGORIES, engineBot, ENGINE_LEVELS, pick, botById } from '../bots.js';
import { COACHES, coachById } from '../coaches.js';
import { avatar, esc, toggle, $ } from '../ui.js';

export const TIME_CONTROLS = [
  { id: 'none', label: 'No timer', base: null },
  { id: '1+0', label: '1 min', base: 60, inc: 0 },
  { id: '3+2', label: '3 | 2', base: 180, inc: 2 },
  { id: '5+0', label: '5 min', base: 300, inc: 0 },
  { id: '10+0', label: '10 min', base: 600, inc: 0 },
  { id: '15+10', label: '15 | 10', base: 900, inc: 10 },
  { id: '30+0', label: '30 min', base: 1800, inc: 0 },
];

export function render(main, { payload }) {
  const prefs = { botId: 'pip', color: 'random', tc: 'none', engineLevel: 5, hints: true, takebacks: true, evalbar: false, coach: false, threats: false, legal: true, ...(JSON.parse(localStorage.getItem('chesshub.botprefs') || 'null') || {}) };
  if (payload?.coach) { prefs.coach = true; prefs.hints = true; prefs.takebacks = true; }
  const savePrefs = () => { try { localStorage.setItem('chesshub.botprefs', JSON.stringify(prefs)); } catch { /* ignore */ } };
  const beaten = store.stats.botWins || {};

  const currentBot = () => prefs.botId === 'engine' ? engineBot(prefs.engineLevel) : botById(prefs.botId) || BOTS[1];

  main.innerHTML = `<div class="bots-layout">
    <div>
      <h1 style="margin:4px 0 6px">Play vs Bots</h1>
      <p class="muted" style="margin:0 0 6px">Pick an opponent. Every bot has its own rating, style and opening repertoire. ✅ marks bots you've beaten.</p>
      <div id="cats"></div>
    </div>
    <div><div class="bot-hero" id="hero"></div></div>
  </div>`;

  const cats = $('#cats', main);
  cats.innerHTML = BOT_CATEGORIES.map(cat => {
    if (cat.id === 'engine') {
      return `<div class="bot-cat"><h3><span>${cat.name}</span><span>${cat.range}</span></h3><div class="bot-grid"><div class="bot-tile" data-bot="engine">${avatar({ engine: true }, 64)}<div class="n">Stockfish</div><div class="r">Lv 1–10</div></div></div></div>`;
    }
    const list = BOTS.filter(b => b.cat === cat.id);
    return `<div class="bot-cat"><h3><span>${cat.name}</span><span>${cat.range}</span></h3><div class="bot-grid">${list.map(b => `
      <div class="bot-tile" data-bot="${b.id}" title="${esc(b.name)} (${b.rating})">${beaten[b.id] ? '<span class="beaten">✅</span>' : ''}${avatar(b.avatar, 64)}<div class="n">${esc(b.name)}</div><div class="r">${b.rating}</div></div>`).join('')}</div></div>`;
  }).join('');

  const hero = $('#hero', main);
  function renderHero() {
    const b = currentBot();
    const coach = coachById(store.settings.coachId);
    cats.querySelectorAll('.bot-tile').forEach(t => t.classList.toggle('selected', t.dataset.bot === prefs.botId));
    hero.innerHTML = `
      <div class="top">${avatar(b.avatar, 110)}<div>
        <h2>${esc(b.name)} <span style="font-size:20px">${b.flag}</span></h2>
        <div style="font-size:20px;color:var(--muted);font-weight:700">${b.rating}</div>
        <div class="speech" style="margin-top:8px">${esc(pick(b.chat.greet))}</div>
      </div></div>
      <div class="bio">${esc(b.bio)}</div>
      ${prefs.botId === 'engine' ? `<div class="opt-group"><label class="lbl">Engine level: <b id="lvl-label">${prefs.engineLevel}</b> (~${ENGINE_LEVELS[prefs.engineLevel - 1].rating})</label><input type="range" min="1" max="10" value="${prefs.engineLevel}" id="lvl"></div>` : ''}
      <div class="opt-group"><label class="lbl">I play as</label>
        <div class="seg" id="color">
          <button data-v="w" class="color-pick" title="White">♔</button>
          <button data-v="random" class="color-pick" title="Random">🎲</button>
          <button data-v="b" class="color-pick" title="Black">♚</button>
        </div></div>
      <div class="opt-group"><label class="lbl">Time control</label>
        <div class="seg" id="tc">${TIME_CONTROLS.map(t => `<button data-v="${t.id}">${t.label}</button>`).join('')}</div></div>
      <div class="opt-group"><label class="lbl">Assistance</label>
        ${toggle('o-coach', `🧑‍🏫 Coach mode (${esc(coach.name)})`, prefs.coach)}
        ${toggle('o-hints', '💡 Hints', prefs.hints)}
        ${toggle('o-takebacks', '↩️ Takebacks', prefs.takebacks)}
        ${toggle('o-evalbar', '📊 Evaluation bar', prefs.evalbar)}
        ${toggle('o-threats', '⚠️ Show threats', prefs.threats)}
      </div>
      <button class="btn primary big" id="play">Play</button>`;
    hero.querySelectorAll('#color button').forEach(x => { x.classList.toggle('active', x.dataset.v === prefs.color); x.onclick = () => { prefs.color = x.dataset.v; savePrefs(); renderHero(); }; });
    hero.querySelectorAll('#tc button').forEach(x => { x.classList.toggle('active', x.dataset.v === prefs.tc); x.onclick = () => { prefs.tc = x.dataset.v; savePrefs(); renderHero(); }; });
    for (const k of ['coach', 'hints', 'takebacks', 'evalbar', 'threats']) {
      const el = hero.querySelector('#o-' + k);
      el.onchange = () => { prefs[k] = el.checked; savePrefs(); };
    }
    const lvl = hero.querySelector('#lvl');
    if (lvl) lvl.oninput = () => { prefs.engineLevel = +lvl.value; savePrefs(); renderHero(); };
    hero.querySelector('#play').onclick = () => {
      const color = prefs.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : prefs.color;
      const tc = TIME_CONTROLS.find(t => t.id === prefs.tc);
      go('play', {
        mode: 'bot', botId: b.id, playerColor: color,
        time: tc.base ? { base: tc.base * 1000, inc: tc.inc * 1000, label: tc.label } : null,
        assist: { hints: prefs.hints, takebacks: prefs.takebacks, evalbar: prefs.evalbar, coach: prefs.coach, threats: prefs.threats },
      });
    };
  }
  cats.querySelectorAll('.bot-tile').forEach(t => t.onclick = () => { prefs.botId = t.dataset.bot; savePrefs(); renderHero(); if (innerWidth < 860) hero.scrollIntoView({ behavior: 'smooth' }); });
  renderHero();
}
