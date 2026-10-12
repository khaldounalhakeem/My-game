'use strict';
// ============================================================================
// Ranked & casual matchmaking: placements, ranks with divisions, MMR, and
// bot difficulty that scales with your rating
// ============================================================================

const PLACEMENT_GAMES = 10;
const PLAYLISTS = { 1: 'Duel', 2: 'Doubles', 3: 'Standard', hoops: 'Hoops', rumble: 'Rumble', heatseeker: 'Heatseeker', dropshot: 'Dropshot', snowday: 'Snow Day' };
const RANKED_KEYS = ['1', '2', '3', 'hoops', 'rumble', 'heatseeker', 'dropshot', 'snowday'];
// placements: your rank after 10 games comes from how many you won (10/10 = Supersonic Legend)
const PLACEMENT_MMR = [40, 120, 220, 380, 600, 820, 1040, 1270, 1480, 1630, 1760];
function placementMMR(wins, games) {
  if (!games) return 1000; // first placement game: bots start in the middle (Diamond)
  const x = wins / games * PLACEMENT_GAMES, i = Math.floor(x), f = x - i;
  return i >= PLACEMENT_GAMES ? PLACEMENT_MMR[PLACEMENT_GAMES] : PLACEMENT_MMR[i] + (PLACEMENT_MMR[i + 1] - PLACEMENT_MMR[i]) * f;
}
// Soccar has Duel/Doubles/Standard; every other mode has one rank of its own
function rankedKey(cfg) { return cfg.mode && cfg.mode !== 'soccar' ? cfg.mode : String(cfg.teamSize); }

// tiers: [name, min MMR, colour]
const TIERS = [
  ['Bronze', 0, '#c07a3e'], ['Silver', 300, '#b9c4cf'], ['Gold', 520, '#e9b931'], ['Platinum', 740, '#5fd6e3'],
  ['Diamond', 960, '#3d7dff'], ['Champion', 1180, '#a35cff'], ['Grand Champion', 1420, '#ff3b5c'], ['Supersonic Legend', 1700, '#ffffff'],
];
const ROMAN = ['I', 'II', 'III'];
const DIVS = ['I', 'II', 'III', 'IV'];

// a rank: tier index, sub-rank (I/II/III), division (I-IV)
function rankInfo(mmr) {
  mmr = Math.max(0, mmr);
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (mmr >= TIERS[i][1]) t = i;
  const tier = TIERS[t];
  if (t === TIERS.length - 1) return { tier: t, name: tier[0], full: tier[0], color: tier[2], sub: 0, div: 0, divName: '', index: t * 3 };
  const span = TIERS[t + 1][1] - tier[1];
  const step = span / 3;
  const sub = Math.min(2, Math.floor((mmr - tier[1]) / step));
  const within = (mmr - tier[1] - sub * step) / step;
  const div = Math.min(3, Math.floor(within * 4));
  return { tier: t, name: tier[0] + ' ' + ROMAN[sub], full: tier[0] + ' ' + ROMAN[sub], color: tier[2], sub, div, divName: 'Div ' + DIVS[div], index: t * 3 + sub };
}
function rankFor(mmr) { return rankInfo(mmr).name; }

// ---------------------------------------------------------------------------
// Bot skill that scales with MMR (interpolated between anchor levels)
// ---------------------------------------------------------------------------
const SKILL_ANCHORS = [
  // better reactions, aim and decisions as the rank rises — same car, same boost, same physics as you
  [0, { react: 0.4, skill: 0.3, aerial: 0, maxBoost: 0.35, flip: 0.25, aim: 0.45, assist: 0.04, aggro: 0 }],
  [300, { react: 0.28, skill: 0.45, aerial: 0.15, maxBoost: 0.5, flip: 0.45, aim: 0.6, assist: 0.1, aggro: 0 }],
  [740, { react: 0.14, skill: 0.75, aerial: 0.55, maxBoost: 0.9, flip: 0.85, aim: 0.88, assist: 0.25, aggro: 0 }],
  [1180, { react: 0.055, skill: 0.97, aerial: 0.95, maxBoost: 1, flip: 1, aim: 0.99, assist: 0.27, aggro: 0 }],
  [1420, { react: 0.035, skill: 1, aerial: 1, maxBoost: 1, flip: 1, aim: 1, assist: 0.3, aggro: 1 }],
  [1700, { react: 0.022, skill: 1, aerial: 1.05, maxBoost: 1, flip: 1, aim: 1, assist: 0.35, aggro: 1 }],
  [2000, { react: 0.015, skill: 1, aerial: 1.1, maxBoost: 1, flip: 1, aim: 1, assist: 0.4, aggro: 1 }],
];
function levelForMMR(mmr) {
  const A = SKILL_ANCHORS;
  let i = 0;
  while (i < A.length - 2 && mmr > A[i + 1][0]) i++;
  const [m0, a] = A[i], [m1, b] = A[i + 1];
  const t = clamp((mmr - m0) / (m1 - m0), 0, 1);
  const lv = { name: 'Rated ' + Math.round(mmr), mmr };
  for (const k in a) lv[k] = a[k] + (b[k] - a[k]) * t;
  return lv;
}

// ---------------------------------------------------------------------------
// Player rating state (stored in Profile)
// ---------------------------------------------------------------------------
function ensureRatings() {
  const P = Profile;
  if (!P.ranked || P.rankVer !== 3) { P.ranked = {}; P.rankVer = 3; } // placements are back: everyone re-places
  if (!P.casual) P.casual = {};
  for (const k of RANKED_KEYS) if (!P.ranked[k]) P.ranked[k] = { mmr: placementMMR(0, 0), games: 0, wins: 0, losses: 0, placed: false, peak: 0, streak: 0 };
  for (const k of ['1', '2', '3']) if (!P.casual[k]) P.casual[k] = { mmr: 250, games: 0, wins: 0, losses: 0, streak: 0 };
}
function rankedState(key) { ensureRatings(); return Profile.ranked[String(key)]; }
function casualState(size) { ensureRatings(); return Profile.casual[String(size)]; }
function rankLabel(key) {
  const r = rankedState(key), ri = rankInfo(r.mmr);
  if (!r.placed) return { text: `Unranked · placement ${r.games}/${PLACEMENT_GAMES}`, color: '#9fb0cf', placed: false, info: null };
  return { text: `${ri.name}${ri.divName ? ' · ' + ri.divName : ''}`, color: ri.color, placed: true, info: ri };
}
function bestRank() {
  ensureRatings();
  let best = null;
  for (const k of RANKED_KEYS) { const r = Profile.ranked[k]; if (r.placed && (!best || r.mmr > best.mmr)) best = r; }
  return best ? rankInfo(best.mmr) : null;
}

// The rating the bots are tuned to for a match
function matchRating(cfg) {
  if (cfg.competitive) {
    const r = rankedState(rankedKey(cfg));
    if (r.placed) return r.mmr;
    // placements: bots start in the middle and move towards your record a bit more every game
    const k = Math.min(1, r.games / PLACEMENT_GAMES);
    return 1000 + (placementMMR(r.pw || 0, r.games) - 1000) * (0.35 + 0.65 * k) * (r.games ? 1 : 0);
  }
  if (cfg.level === 'adaptive') return casualState(cfg.teamSize).mmr;
  return null;
}

// Apply a finished match; returns a summary for the post-match screen
function applyRatingResult(cfg, won, goalDiff) {
  const size = cfg.teamSize;
  if (cfg.competitive) {
    const key = rankedKey(cfg);
    const r = rankedState(key);
    const before = rankInfo(r.mmr);
    r.games++; if (won) r.wins++; else r.losses++;
    r.streak = won ? Math.max(1, r.streak + 1) : Math.min(-1, r.streak - 1);
    if (!r.placed) {
      // placement match: the rank comes from the record so far, revealed after game 10
      r.pw = (r.pw || 0) + (won ? 1 : 0);
      const done = r.games >= PLACEMENT_GAMES;
      r.mmr = placementMMR(r.pw, r.games);
      if (done) { r.placed = true; r.peak = r.mmr; }
      const after = rankInfo(r.mmr);
      return { ranked: true, playlist: PLAYLISTS[key], delta: 0, placed: done, justPlaced: done, games: r.games, placeWins: r.pw, before, after, rankUp: false, rankDown: false, divUp: false, divDown: false };
    }
    // wins climb steadily; losing streaks drop faster until you find the rank you can hold
    let delta;
    // every loss costs a real chunk, more on a losing streak: 2–3 losses in a row drop a rank
    if (won) delta = 14 + Math.min(8, (r.streak - 1) * 2) + clamp(goalDiff, 0, 3);
    else delta = -Math.min(80, 25 + 10 * (-r.streak - 1)) + clamp(goalDiff, -3, 0);
    r.mmr = clamp(r.mmr + delta, 0, 2200);
    r.peak = Math.max(r.peak || 0, r.mmr);
    const after = rankInfo(r.mmr);
    return {
      ranked: true, playlist: PLAYLISTS[key], delta, placed: true, games: r.games,
      before, after, rankUp: after.index > before.index, rankDown: after.index < before.index,
      divUp: after.index === before.index && after.div > before.div, divDown: after.index === before.index && after.div < before.div,
    };
  }
  if (cfg.level === 'adaptive') {
    const c = casualState(size);
    c.games++; if (won) c.wins++; else c.losses++;
    c.streak = won ? Math.max(1, c.streak + 1) : Math.min(-1, c.streak - 1);
    const delta = (won ? 18 : -14) + clamp(goalDiff, -3, 3) * 2;
    c.mmr = clamp(c.mmr + delta, 0, 2000);
    return { ranked: false, delta, casualMmr: c.mmr };
  }
  return null;
}

// small rank emblem (inline SVG) used in menus and the post-match screen
function rankBadge(info, size) {
  size = size || 48;
  const c = info ? info.color : '#5c6678';
  const pips = info && info.tier < TIERS.length - 1 ? info.sub + 1 : 0;
  const glow = info && info.tier >= 6;
  let p = '';
  for (let i = 0; i < pips; i++) p += `<rect x="${36 + (i - (pips - 1) / 2) * 12 - 3}" y="56" width="6" height="10" rx="1" fill="${c}"/>`;
  return `<svg class="rbadge" width="${size}" height="${size}" viewBox="0 0 72 72" aria-hidden="true">
    ${glow ? `<circle cx="36" cy="34" r="30" fill="${c}" opacity=".18"/>` : ''}
    <path d="M36 4 L62 18 L62 44 L36 60 L10 44 L10 18 Z" fill="#0d1428" stroke="${c}" stroke-width="4"/>
    <path d="M36 14 L52 23 L52 40 L36 50 L20 40 L20 23 Z" fill="${c}" opacity="${info ? 0.85 : 0.3}"/>
    ${info && info.tier >= 5 ? `<path d="M36 18 L41 30 L54 30 L44 38 L48 50 L36 42 L24 50 L28 38 L18 30 L31 30 Z" fill="#fff" opacity=".9" transform="translate(0,-2) scale(1)"/>` : ''}
    ${p}
  </svg>`;
}
