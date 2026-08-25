'use strict';

/* ---------- Constants ---------- */

const SAVE_KEY = 'careerKickoffSave';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

const ATTR_KEYS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical', 'goalkeeping'];

const ATTR_LABELS = {
  pace: 'Pace', shooting: 'Shooting', passing: 'Passing',
  dribbling: 'Dribbling', defending: 'Defending', physical: 'Physical',
  goalkeeping: 'Goalkeeping'
};

// Which attributes matter (and how much) per position, for overall rating.
const POSITION_WEIGHTS = {
  GK:  { goalkeeping: 0.50, physical: 0.20, passing: 0.15, pace: 0.15 },
  DEF: { defending: 0.40, physical: 0.25, pace: 0.15, passing: 0.10, dribbling: 0.10 },
  MID: { passing: 0.30, dribbling: 0.25, defending: 0.15, physical: 0.15, pace: 0.15 },
  FWD: { shooting: 0.35, pace: 0.25, dribbling: 0.20, physical: 0.10, passing: 0.10 }
};

function trainableAttrs(position) {
  if (position === 'GK') return ['goalkeeping', 'pace', 'passing', 'physical'];
  return ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];
}

// Six 10-club divisions: one fictional starter league (where every career
// begins) and five real top-flight European leagues you get scouted into
// as your rating climbs. Every division has exactly 10 clubs so they all
// share the same 18-week double round-robin season length.
const LEAGUES = [
  {
    id: 'dev', name: 'Development League', tier: 1,
    clubs: [
      { name: 'Riverside FC', strength: 44 },
      { name: 'Oakdale United', strength: 40 },
      { name: 'Port Albion', strength: 42 },
      { name: 'Grange Rovers', strength: 38 },
      { name: 'Millbrook Town', strength: 46 },
      { name: 'Eastwick Athletic', strength: 41 },
      { name: 'Stonebridge FC', strength: 39 },
      { name: 'Hartley Rangers', strength: 45 },
      { name: 'Kingswell City', strength: 43 },
      { name: 'Ashford Dynamo', strength: 48 }
    ]
  },
  {
    id: 'ligue1', name: 'Ligue 1', tier: 2,
    clubs: [
      { name: 'Paris Saint-Germain', strength: 90 },
      { name: 'Marseille', strength: 78 },
      { name: 'Monaco', strength: 77 },
      { name: 'Lyon', strength: 74 },
      { name: 'Lille', strength: 73 },
      { name: 'Nice', strength: 71 },
      { name: 'Rennes', strength: 72 },
      { name: 'Lens', strength: 70 },
      { name: 'Nantes', strength: 66 },
      { name: 'Strasbourg', strength: 65 }
    ]
  },
  {
    id: 'bundesliga', name: 'Bundesliga', tier: 3,
    clubs: [
      { name: 'Bayern Munich', strength: 92 },
      { name: 'Borussia Dortmund', strength: 84 },
      { name: 'Bayer Leverkusen', strength: 83 },
      { name: 'RB Leipzig', strength: 82 },
      { name: 'Eintracht Frankfurt', strength: 75 },
      { name: 'VfB Stuttgart', strength: 74 },
      { name: 'VfL Wolfsburg', strength: 73 },
      { name: "Borussia Monchengladbach", strength: 72 },
      { name: 'SC Freiburg', strength: 71 },
      { name: 'Union Berlin', strength: 70 }
    ]
  },
  {
    id: 'seriea', name: 'Serie A', tier: 4,
    clubs: [
      { name: 'Inter Milan', strength: 87 },
      { name: 'Juventus', strength: 85 },
      { name: 'AC Milan', strength: 84 },
      { name: 'Napoli', strength: 83 },
      { name: 'Atalanta', strength: 80 },
      { name: 'AS Roma', strength: 79 },
      { name: 'Lazio', strength: 77 },
      { name: 'Fiorentina', strength: 75 },
      { name: 'Bologna', strength: 72 },
      { name: 'Torino', strength: 70 }
    ]
  },
  {
    id: 'laliga', name: 'La Liga', tier: 5,
    clubs: [
      { name: 'Real Madrid', strength: 94 },
      { name: 'FC Barcelona', strength: 91 },
      { name: 'Atletico Madrid', strength: 85 },
      { name: 'Athletic Bilbao', strength: 77 },
      { name: 'Real Sociedad', strength: 78 },
      { name: 'Villarreal', strength: 76 },
      { name: 'Real Betis', strength: 75 },
      { name: 'Sevilla', strength: 76 },
      { name: 'Valencia', strength: 72 },
      { name: 'Celta Vigo', strength: 68 }
    ]
  },
  {
    id: 'premier', name: 'Premier League', tier: 5,
    clubs: [
      { name: 'Manchester City', strength: 93 },
      { name: 'Liverpool', strength: 89 },
      { name: 'Arsenal', strength: 88 },
      { name: 'Chelsea', strength: 83 },
      { name: 'Manchester United', strength: 82 },
      { name: 'Tottenham Hotspur', strength: 81 },
      { name: 'Newcastle United', strength: 79 },
      { name: 'Aston Villa', strength: 78 },
      { name: 'West Ham United', strength: 74 },
      { name: 'Everton', strength: 70 }
    ]
  }
];

const SEASON_LENGTH = 18; // double round robin across 10 clubs
const TRAINING_SESSIONS_PER_WEEK = 2;
const RETIREMENT_AGE = 35;
const WORLD_CUP_INTERVAL = 4; // a World Cup every 4 in-game seasons, same as real life

const NATIONS = [
  { name: 'Brazil', strength: 90 }, { name: 'Argentina', strength: 89 },
  { name: 'France', strength: 89 }, { name: 'Spain', strength: 87 },
  { name: 'England', strength: 86 }, { name: 'Germany', strength: 85 },
  { name: 'Portugal', strength: 85 }, { name: 'Netherlands', strength: 84 },
  { name: 'Italy', strength: 83 }, { name: 'Belgium', strength: 82 },
  { name: 'Croatia', strength: 81 }, { name: 'Uruguay', strength: 79 },
  { name: 'Switzerland', strength: 78 }, { name: 'Colombia', strength: 78 },
  { name: 'Morocco', strength: 78 }, { name: 'Senegal', strength: 77 },
  { name: 'Denmark', strength: 79 }, { name: 'United States', strength: 76 },
  { name: 'Japan', strength: 76 }, { name: 'Nigeria', strength: 75 },
  { name: 'Mexico', strength: 75 }, { name: 'Sweden', strength: 74 },
  { name: 'South Korea', strength: 74 }, { name: 'Ghana', strength: 72 }
];

const HAIR_COLORS = [
  { name: 'Black', hex: '#1b1b1b' }, { name: 'Dark Brown', hex: '#4a2f1c' },
  { name: 'Brown', hex: '#7a4a24' }, { name: 'Blonde', hex: '#d1a24a' },
  { name: 'Ginger', hex: '#b5451c' }, { name: 'Grey', hex: '#9b9b9b' },
  { name: 'Platinum', hex: '#e8e4d8' }, { name: 'Dyed Blue', hex: '#3a5fae' }
];

const JERSEY_COLORS = [
  { name: 'Red', hex: '#c23b3b' }, { name: 'Blue', hex: '#2b5faa' },
  { name: 'Sky Blue', hex: '#4fa8d8' }, { name: 'Green', hex: '#2f8f4e' },
  { name: 'Gold', hex: '#d4a94c' }, { name: 'Black', hex: '#1c1c1c' },
  { name: 'White', hex: '#f2f2f2' }, { name: 'Purple', hex: '#6a3fa0' }
];

const CUP_INFO = {
  ucl: { label: 'UEFA Champions League' },
  wc: { label: 'World Cup' }
};
const CUP_STAGES = ['qf', 'sf', 'final'];
const CUP_STAGE_LABELS = { qf: 'Quarterfinal', sf: 'Semifinal', final: 'Final' };

/* ---------- Utility ---------- */

function rand(min, max) { return Math.random() * (max - min) + min; }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function choice(arr) { return arr[randi(0, arr.length - 1)]; }

function computeOverall(player) {
  const weights = POSITION_WEIGHTS[player.position];
  let total = 0;
  for (const key in weights) total += player.attrs[key] * weights[key];
  return Math.round(total);
}

function findLeague(leagueId) { return LEAGUES.find(l => l.id === leagueId); }
function currentLeague() { return findLeague(state.leagueId); }
function nationStrength(name) { const n = NATIONS.find(x => x.name === name); return n ? n.strength : 74; }

function allClubsFlat() {
  return LEAGUES.flatMap(l => l.clubs.map(c => ({
    name: c.name, strength: c.strength, leagueId: l.id, leagueName: l.name, tier: l.tier
  })));
}

/* ---------- Club crests (generated, not real club artwork) ---------- */
// Every club (and nation) gets a small original shield badge — a
// deterministic color and initials derived from its name — so real and
// fictional clubs alike get a visual identity without reproducing any
// actual team's logo.

function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const CREST_SHORT_PREFIXES = new Set(['FC', 'AC', 'AS', 'SC', 'RB', 'RC', 'VfB', 'VfL', 'US', 'SSC']);

function clubInitials(name) {
  let words = name.replace(/[^A-Za-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
  const withoutPrefix = words.filter(w => !CREST_SHORT_PREFIXES.has(w));
  if (withoutPrefix.length > 0) words = withoutPrefix;
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

let crestIdCounter = 0;

function clubCrestSvg(name, size) {
  size = size || 40;
  const h = hashStr(name);
  const hue = h % 360;
  const hue2 = (hue + 34) % 360;
  const initials = clubInitials(name);
  // A fresh id per call (not just per club) avoids duplicate-id gradient
  // resolution bugs when the same club's crest is rendered in more than
  // one place at once (e.g. a hidden screen still in the DOM).
  const gid = 'crest' + (crestIdCounter++) + '_' + (h % 997);
  const fontSize = initials.length >= 3 ? 27 : 34;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${initials} crest">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue},58%,28%)" />
        <stop offset="100%" stop-color="hsl(${hue2},62%,44%)" />
      </linearGradient>
    </defs>
    <path d="M50 4 L92 18 L92 50 C92 77 74 92 50 97 C26 92 8 77 8 50 L8 18 Z" fill="url(#${gid})" stroke="rgba(255,255,255,0.55)" stroke-width="2.5"/>
    <text x="50" y="59" text-anchor="middle" font-family="Oswald, sans-serif" font-weight="700" font-size="${fontSize}" fill="#fff" style="letter-spacing:0.5px">${initials}</text>
  </svg>`;
}

function crestPlainHtml(name, size) {
  return `<span class="crest-plain">${clubCrestSvg(name, size)}</span>`;
}

function crestWithRatingHtml(name, strength, size) {
  return `<span class="crest-wrap" style="width:${size}px;height:${size}px;">${clubCrestSvg(name, size)}<span class="rating-chip">${Math.round(strength)}</span></span>`;
}

/* ---------- Player avatar (hair + jersey, generated) ---------- */

function playerAvatarSvg(hairHex, primaryHex, secondaryHex, size) {
  size = size || 48;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="player avatar">
    <path d="M20 99 C20 70 33 56 50 56 C67 56 80 70 80 99 Z" fill="${secondaryHex}"/>
    <path d="M20 99 C20 70 33 56 50 56 L50 99 Z" fill="${primaryHex}"/>
    <path d="M39 57 L35 67 L50 76 L65 67 L61 57" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="50" cy="32" rx="25" ry="23" fill="${hairHex}"/>
    <circle cx="50" cy="39" r="18" fill="#e0ac69"/>
  </svg>`;
}

/* ---------- State ---------- */

let state = null;
let lastMatchResult = null;

function instantiateLeagueClubs(leagueId) {
  const league = findLeague(leagueId);
  return league.clubs.map(c => ({
    name: c.name,
    tier: league.tier,
    strength: leagueId === 'dev' ? clamp(c.strength + randi(-3, 3), 30, 60) : c.strength
  }));
}

function newPlayer(name, position, nation, hair, jerseyPrimary, jerseySecondary) {
  const weights = POSITION_WEIGHTS[position];
  const attrs = {};
  for (const key of ATTR_KEYS) attrs[key] = randi(28, 40);
  // Bump the attributes relevant to this position a bit for a playable start.
  for (const key in weights) attrs[key] = randi(42, 55);

  const potential = {};
  const potentialBase = randi(58, 92);
  for (const key of ATTR_KEYS) potential[key] = clamp(potentialBase + randi(-8, 8), attrs[key] + 10, 99);

  return {
    name, position, age: 16,
    nation, hair, jerseyPrimary, jerseySecondary,
    attrs, potential,
    fitness: 100, morale: 70,
    wage: 300, contractYearsLeft: 2,
    clubIndex: 0,
    injuredWeeksLeft: 0,
    careerStats: { matches: 0, goals: 0, assists: 0, cleanSheets: 0, trophies: [] },
    seasonStats: { matches: 0, goals: 0, assists: 0, cleanSheets: 0, ratingSum: 0, ratingCount: 0 },
    retired: false
  };
}

function buildFixtures(numTeams) {
  // Circle method round robin, then mirrored for a double round robin.
  const teamIdx = [...Array(numTeams).keys()];
  const rounds = [];
  const fixed = teamIdx[0];
  let rest = teamIdx.slice(1);
  const half = numTeams / 2;
  for (let r = 0; r < numTeams - 1; r++) {
    const round = [];
    const left = [fixed, ...rest.slice(0, half - 1)];
    const right = rest.slice(half - 1).reverse();
    for (let i = 0; i < half; i++) round.push([left[i], right[i]]);
    rounds.push(round);
    rest.push(rest.shift());
  }
  const firstLeg = rounds;
  const secondLeg = rounds.map(round => round.map(([h, a]) => [a, h]));
  return [...firstLeg, ...secondLeg]; // array of rounds, each round = array of [homeIdx, awayIdx]
}

function newLeagueTable(clubs) {
  return clubs.map((c, i) => ({
    clubIndex: i, name: c.name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0
  }));
}

function pickStartingClubChoices() {
  const devClubs = instantiateLeagueClubs('dev');
  const idxPool = [...Array(devClubs.length).keys()];
  const chosen = [];
  for (let i = 0; i < 3 && idxPool.length; i++) chosen.push(idxPool.splice(randi(0, idxPool.length - 1), 1)[0]);
  return chosen.map(i => devClubs[i]);
}

function startNewCareer(name, position, nation, hair, jerseyPrimary, jerseySecondary, chosenClub) {
  const player = newPlayer(name, position, nation, hair, jerseyPrimary, jerseySecondary);
  const clubs = instantiateLeagueClubs('dev');
  let idx = clubs.findIndex(c => c.name === chosenClub.name);
  if (idx === -1) idx = 0;
  clubs[idx].strength = chosenClub.strength; // keep the strength shown at selection time
  player.clubIndex = idx;

  state = {
    player,
    leagueId: 'dev',
    clubs,
    season: 1,
    week: 1,
    trainingLeft: TRAINING_SESSIONS_PER_WEEK,
    trainedThisWeek: [],
    fixtures: buildFixtures(clubs.length),
    table: newLeagueTable(clubs),
    history: [],
    pendingOffers: [],
    pendingTransfer: null,
    cup: null
  };
  save();
}

/* ---------- Persistence ---------- */

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore quota errors */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    state = JSON.parse(raw);
    return true;
  } catch (e) { return false; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

/* ---------- Training / rest ---------- */

function growthFactor(age) {
  if (age <= 21) return 1.4;
  if (age <= 25) return 1.0;
  if (age <= 29) return 0.55;
  if (age <= 32) return 0.15;
  return -0.6; // decline
}

function trainAttribute(key) {
  const p = state.player;
  if (state.trainingLeft <= 0) return;
  const gf = growthFactor(p.age);
  if (gf >= 0) {
    const room = p.potential[key] - p.attrs[key];
    const gain = Math.max(0, rand(0.5, 2.2) * gf * clamp(room / 20, 0.15, 1));
    p.attrs[key] = clamp(Math.round((p.attrs[key] + gain) * 10) / 10, 1, 99);
  }
  p.fitness = clamp(p.fitness - randi(3, 7), 0, 100);
  state.trainingLeft -= 1;
  state.trainedThisWeek.push(key);
  save();
  renderHub();
}

function restWeek() {
  const p = state.player;
  p.fitness = clamp(p.fitness + 18, 0, 100);
  p.morale = clamp(p.morale + 8, 0, 100);
  state.trainingLeft = 0;
  save();
  renderHub();
}

/* ---------- Core match simulation (shared by league + cup matches) ---------- */

function simQuickScore(strengthA, strengthB) {
  const diff = (strengthA - strengthB) / 12;
  const lambdaA = clamp(1.1 + diff * 0.5 + rand(-0.4, 0.4), 0.2, 4.5);
  const lambdaB = clamp(1.1 - diff * 0.5 + rand(-0.4, 0.4), 0.2, 4.5);
  return [poisson(lambdaA), poisson(lambdaB)];
}

function poisson(lambda) {
  // Simple poisson-ish draw via Knuth's algorithm, capped for sanity.
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L && k < 8);
  return k - 1;
}

// Simulates one match for the player's personal involvement. Pure aside
// from mutating the player's fitness/morale/career (and season, if
// trackSeasonStats) stats — never touches league tables or fixtures, so
// the same engine drives domestic weeks and cup matches alike.
function simulatePlayerMatch(myTeamName, myTeamStrengthBase, oppName, oppStrength, trackSeasonStats) {
  const p = state.player;
  const log = [];

  if (p.injuredWeeksLeft > 0) {
    if (trackSeasonStats) p.injuredWeeksLeft--;
    const [sh, sa] = simQuickScore(myTeamStrengthBase, oppStrength);
    log.push(`${p.name} is sidelined with injury and misses the match.`);
    p.fitness = clamp(p.fitness + 10, 0, 100);
    return {
      myTeamName, oppName, scoreMine: sh, scoreOpp: sa,
      myStrength: myTeamStrengthBase, oppStrength,
      log, played: false, rating: null, goals: 0, assists: 0, injured: false
    };
  }

  const overall = computeOverall(p);
  const teamStrength = myTeamStrengthBase * 0.75 + overall * 0.25;
  const [rawMine, rawOpp] = simQuickScore(teamStrength, oppStrength);
  let myGoals = rawMine, oppGoals = rawOpp;
  let goals = 0, assists = 0;

  const form = clamp((p.fitness + p.morale) / 2, 0, 100) / 100;
  if (p.position === 'FWD') {
    const chance = clamp(p.attrs.shooting / 130, 0.05, 0.55) * form;
    for (let i = 0; i < 3; i++) if (Math.random() < chance) goals++;
    myGoals = Math.max(myGoals, goals);
    const assistChance = clamp(p.attrs.passing / 200, 0.03, 0.3) * form;
    if (Math.random() < assistChance && myGoals > goals) assists++;
  } else if (p.position === 'MID') {
    const assistChance = clamp(p.attrs.passing / 140, 0.05, 0.5) * form;
    for (let i = 0; i < 2; i++) if (Math.random() < assistChance && myGoals > 0) assists++;
    const chance = clamp(p.attrs.shooting / 260, 0.02, 0.2) * form;
    if (Math.random() < chance) { goals++; myGoals = Math.max(myGoals, goals + assists); }
  } else if (p.position === 'DEF') {
    const assistChance = clamp(p.attrs.passing / 220, 0.02, 0.15) * form;
    if (Math.random() < assistChance && myGoals > 0) assists++;
  }

  const cleanSheet = oppGoals === 0;
  if (cleanSheet && (p.position === 'GK' || p.position === 'DEF')) {
    p.careerStats.cleanSheets++;
    if (trackSeasonStats) p.seasonStats.cleanSheets++;
  }

  let rating = 6.0;
  rating += (overall - oppStrength) / 40;
  rating += goals * 0.9 + assists * 0.5;
  if (p.position === 'GK' || p.position === 'DEF') rating += cleanSheet ? 0.8 : (oppGoals >= 3 ? -0.6 : 0);
  rating += (form - 0.6) * 1.2;
  rating += rand(-0.4, 0.4);
  rating = clamp(Math.round(rating * 10) / 10, 2.0, 10.0);

  log.push(`Kickoff: ${myTeamName} vs ${oppName}.`);
  if (goals > 0) log.push(`⚽ GOAL! ${p.name} scores${goals > 1 ? ` (x${goals})` : ''}!`);
  if (assists > 0) log.push(`🎯 ${p.name} sets up a goal with a great assist${assists > 1 ? ` (x${assists})` : ''}.`);
  if (cleanSheet && (p.position === 'GK' || p.position === 'DEF')) log.push(`🧤 Clean sheet held!`);
  log.push(`Full time: ${myTeamName} ${myGoals} - ${oppGoals} ${oppName}.`);
  log.push(`${p.name} rated ${rating.toFixed(1)} for the match.`);

  const injuryChance = clamp(0.03 + (100 - p.fitness) / 400, 0.02, 0.14);
  let injured = false;
  if (Math.random() < injuryChance) {
    injured = true;
    p.injuredWeeksLeft = randi(2, 5);
    log.push(`⚠️ ${p.name} picked up an injury and will be out for ${p.injuredWeeksLeft} weeks.`);
  }

  p.fitness = clamp(p.fitness - randi(12, 22), 0, 100);
  p.morale = clamp(p.morale + (rating >= 7 ? randi(3, 8) : rating <= 5 ? -randi(3, 8) : randi(-2, 2)), 0, 100);

  p.careerStats.matches++; p.careerStats.goals += goals; p.careerStats.assists += assists;
  if (trackSeasonStats) {
    const ss = p.seasonStats;
    ss.matches++; ss.goals += goals; ss.assists += assists; ss.ratingSum += rating; ss.ratingCount++;
  }

  return {
    myTeamName, oppName, scoreMine: myGoals, scoreOpp: oppGoals,
    myStrength: teamStrength, oppStrength,
    log, played: true, rating, goals, assists, injured
  };
}

/* ---------- Domestic league matches ---------- */

function currentRound() {
  return state.fixtures[state.week - 1];
}

function findPlayerFixture(round) {
  return round.find(([h, a]) => h === state.player.clubIndex || a === state.player.clubIndex);
}

function updateTable(clubIndexA, clubIndexB, scoreA, scoreB) {
  const rowA = state.table.find(r => r.clubIndex === clubIndexA);
  const rowB = state.table.find(r => r.clubIndex === clubIndexB);
  rowA.played++; rowB.played++;
  rowA.gf += scoreA; rowA.ga += scoreB;
  rowB.gf += scoreB; rowB.ga += scoreA;
  if (scoreA > scoreB) { rowA.won++; rowB.lost++; rowA.pts += 3; }
  else if (scoreA < scoreB) { rowB.won++; rowA.lost++; rowB.pts += 3; }
  else { rowA.drawn++; rowB.drawn++; rowA.pts += 1; rowB.pts += 1; }
}

function sortedTable() {
  return [...state.table].sort((a, b) => (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
}

function playDomesticMatchDay() {
  const round = currentRound();
  const playerFixture = findPlayerFixture(round);
  const p = state.player;
  const club = state.clubs[p.clubIndex];

  // Simulate the other matches quickly first.
  for (const [h, a] of round) {
    if (h === p.clubIndex || a === p.clubIndex) continue;
    const [sh, sa] = simQuickScore(state.clubs[h].strength, state.clubs[a].strength);
    updateTable(h, a, sh, sa);
  }

  const [homeIdx, awayIdx] = playerFixture;
  const isHome = homeIdx === p.clubIndex;
  const oppIdx = isHome ? awayIdx : homeIdx;
  const opp = state.clubs[oppIdx];

  const result = simulatePlayerMatch(club.name, club.strength, opp.name, opp.strength, true);

  const scoreClub = result.scoreMine, scoreOpp = result.scoreOpp;
  if (isHome) updateTable(p.clubIndex, oppIdx, scoreClub, scoreOpp);
  else updateTable(oppIdx, p.clubIndex, scoreOpp, scoreClub);

  lastMatchResult = {
    context: `${currentLeague().name} · Week ${state.week}`,
    title: `${isHome ? club.name : opp.name} vs ${isHome ? opp.name : club.name}`,
    home: isHome ? club.name : opp.name,
    away: isHome ? opp.name : club.name,
    homeStrength: isHome ? club.strength : opp.strength,
    awayStrength: isHome ? opp.strength : club.strength,
    scoreHome: isHome ? scoreClub : scoreOpp,
    scoreAway: isHome ? scoreOpp : scoreClub,
    playerIsHome: isHome,
    log: result.log, played: result.played, rating: result.rating,
    goals: result.goals, assists: result.assists, injured: result.injured
  };

  state.week++;
  state.trainingLeft = TRAINING_SESSIONS_PER_WEEK;
  state.trainedThisWeek = [];
  save();
}

/* ---------- Continental / international cups ---------- */

function pickCupOpponent(type) {
  if (type === 'ucl') {
    const myName = state.clubs[state.player.clubIndex].name;
    const pool = allClubsFlat().filter(c => c.tier >= 2 && c.name !== myName);
    return choice(pool);
  }
  const pool = NATIONS.filter(n => n.name !== state.player.nation);
  return choice(pool);
}

function checkChampionsLeagueQualification() {
  if (currentLeague().id === 'dev') return false;
  const table = sortedTable();
  const pos = table.findIndex(r => r.clubIndex === state.player.clubIndex) + 1;
  return pos <= 6;
}

function qualifiesForNationalTeam() {
  return computeOverall(state.player) >= 66;
}

function startChampionsLeague() {
  const opp = pickCupOpponent('ucl');
  state.cup = { type: 'ucl', stage: 'qf', opponentName: opp.name, opponentStrength: opp.strength, result: null };
  save();
}

function startWorldCup() {
  const opp = pickCupOpponent('wc');
  state.cup = { type: 'wc', stage: 'qf', opponentName: opp.name, opponentStrength: opp.strength, result: null };
  save();
}

function advanceCup(won) {
  const cup = state.cup;
  if (!won) {
    cup.result = 'eliminated';
    save();
    return;
  }
  const idx = CUP_STAGES.indexOf(cup.stage);
  if (idx === CUP_STAGES.length - 1) {
    cup.result = 'won';
    const trophyName = cup.type === 'ucl'
      ? `UEFA Champions League Winner (S${state.season})`
      : `World Cup Winner — ${state.player.nation} (S${state.season})`;
    state.player.careerStats.trophies.push(trophyName);
  } else {
    cup.stage = CUP_STAGES[idx + 1];
    const opp = pickCupOpponent(cup.type);
    cup.opponentName = opp.name;
    cup.opponentStrength = opp.strength;
    cup.result = 'advance';
  }
  save();
}

function playCupMatch() {
  const p = state.player;
  const cup = state.cup;
  const myName = cup.type === 'ucl' ? state.clubs[p.clubIndex].name : p.nation;
  const myStrength = cup.type === 'ucl' ? state.clubs[p.clubIndex].strength : nationStrength(p.nation);
  const result = simulatePlayerMatch(myName, myStrength, cup.opponentName, cup.opponentStrength, false);

  let scoreMine = result.scoreMine, scoreOpp = result.scoreOpp;
  if (scoreMine === scoreOpp) {
    // Knockout football: a draw is settled on penalties.
    const winProb = clamp(0.5 + (myStrength - cup.opponentStrength) / 200, 0.3, 0.7);
    const iWon = Math.random() < winProb;
    result.log.push(iWon ? `Penalties: ${myName} win the shootout!` : `Penalties: ${cup.opponentName} win the shootout.`);
    var won = iWon;
  } else {
    var won = scoreMine > scoreOpp;
  }

  lastMatchResult = {
    context: `${CUP_INFO[cup.type].label} · ${CUP_STAGE_LABELS[cup.stage]}`,
    title: `${myName} vs ${cup.opponentName}`,
    home: myName, away: cup.opponentName,
    homeStrength: myStrength, awayStrength: cup.opponentStrength,
    scoreHome: scoreMine, scoreAway: scoreOpp,
    playerIsHome: true,
    log: result.log, played: result.played, rating: result.rating,
    goals: result.goals, assists: result.assists, injured: result.injured
  };

  advanceCup(won);
}

/* ---------- Season end / transfers / aging ---------- */

function isSeasonOver() { return state.week > SEASON_LENGTH; }

function finishSeason() {
  const p = state.player;
  const table = sortedTable();
  const finishPosition = table.findIndex(r => r.clubIndex === p.clubIndex) + 1;

  let trophy = null;
  if (finishPosition === 1) {
    trophy = `${currentLeague().name} Champion (S${state.season})`;
    p.careerStats.trophies.push(trophy);
  }

  const avgRating = p.seasonStats.ratingCount ? p.seasonStats.ratingSum / p.seasonStats.ratingCount : 0;

  state.history.push({
    season: state.season,
    club: state.clubs[p.clubIndex].name,
    league: currentLeague().name,
    apps: p.seasonStats.matches,
    goals: p.seasonStats.goals,
    assists: p.seasonStats.assists,
    avgRating: Math.round(avgRating * 10) / 10,
    finish: finishPosition,
    trophy
  });

  state.pendingOffers = generateTransferOffers();
  save();
}

function generateTransferOffers() {
  const p = state.player;
  const overall = computeOverall(p);
  const avgRating = p.seasonStats.ratingCount ? p.seasonStats.ratingSum / p.seasonStats.ratingCount : 6;
  const currentTier = currentLeague().tier;
  if (avgRating < 6.2 && overall < 55) return [];

  function tierEligible(tier, curTier, ov) {
    if (tier < curTier) return avgRating < 6.8; // dip in form: a step down is plausible
    if (tier === curTier) return true; // lateral moves always plausible
    const needed = { 2: 50, 3: 60, 4: 70, 5: 83 }[tier] || 40;
    return ov >= needed - 8;
  }

  const currentClubName = state.clubs[p.clubIndex].name;
  const pool = allClubsFlat().filter(c => c.name !== currentClubName && tierEligible(c.tier, currentTier, overall));

  const numOffers = avgRating >= 7.5 ? randi(1, 3) : randi(0, 2);
  const offers = [];
  for (let i = 0; i < numOffers && pool.length; i++) {
    const idx = randi(0, pool.length - 1);
    const c = pool.splice(idx, 1)[0];
    const wage = Math.round((300 + overall * 25 + c.tier * 250) * rand(0.9, 1.25) / 10) * 10;
    offers.push({ id: `${c.leagueId}:${c.name}`, clubName: c.name, leagueId: c.leagueId, leagueName: c.leagueName, tier: c.tier, strength: c.strength, wage });
  }
  return offers.sort((a, b) => b.wage - a.wage);
}

function acceptOffer(offerId) {
  const offer = state.pendingOffers.find(o => o.id === offerId);
  if (!offer) return;
  state.pendingTransfer = { leagueId: offer.leagueId, clubName: offer.clubName, wage: offer.wage };
  state.player.morale = clamp(state.player.morale + 10, 0, 100);
  state.pendingOffers = [];
  save();
}

function stayAtClub() {
  const p = state.player;
  p.contractYearsLeft = Math.max(1, p.contractYearsLeft - 1);
  if (p.contractYearsLeft <= 1) p.wage = Math.round(p.wage * rand(1.03, 1.15) / 10) * 10;
  state.pendingTransfer = null;
  state.pendingOffers = [];
  save();
}

// Returns { retired, worldCup } describing what the next season kicks off with.
function beginNextSeason() {
  const p = state.player;
  p.age += 1;
  p.seasonStats = { matches: 0, goals: 0, assists: 0, cleanSheets: 0, ratingSum: 0, ratingCount: 0 };
  p.fitness = 100;

  if (p.age >= RETIREMENT_AGE) {
    p.retired = true;
    save();
    return { retired: true, worldCup: false };
  }

  state.season += 1;
  state.week = 1;
  state.trainingLeft = TRAINING_SESSIONS_PER_WEEK;
  state.trainedThisWeek = [];

  if (state.pendingTransfer) {
    const t = state.pendingTransfer;
    state.leagueId = t.leagueId;
    state.clubs = instantiateLeagueClubs(t.leagueId);
    p.clubIndex = state.clubs.findIndex(c => c.name === t.clubName);
    p.wage = t.wage;
    p.contractYearsLeft = randi(2, 4);
    state.pendingTransfer = null;
  }

  state.fixtures = buildFixtures(state.clubs.length);
  state.table = newLeagueTable(state.clubs);

  let worldCup = false;
  if ((state.season - 1) % WORLD_CUP_INTERVAL === 0 && qualifiesForNationalTeam()) {
    startWorldCup();
    worldCup = true;
  }

  save();
  return { retired: false, worldCup };
}

/* ---------- Live match playback ---------- */

const MATCH_FLAVOR_LINES = [
  'A cagey opening as both sides feel each other out.',
  'End-to-end stuff here, chances at both ends.',
  'The keeper is called into action, tips it behind for a corner.',
  'A crunching tackle wins the ball back in midfield.',
  'Off the post! So close to a goal there.',
  'The bench is on its feet, shouting instructions.',
  'A cynical foul breaks up a promising attack.',
  'Both sides pushing men forward now, chasing the game.',
  'A long-range effort flies well over the bar.',
  'Neat build-up play, but the final ball lets them down.'
];

function buildMatchTimeline(r) {
  const p = state.player;
  const usedMinutes = new Set([45]);
  function pickMinute() {
    let m;
    do { m = randi(2, 89); } while (usedMinutes.has(m));
    usedMinutes.add(m);
    return m;
  }

  const homeGoalMinutes = Array.from({ length: r.scoreHome }, pickMinute).sort((a, b) => a - b);
  const awayGoalMinutes = Array.from({ length: r.scoreAway }, pickMinute).sort((a, b) => a - b);
  const mySideMinutes = r.playerIsHome ? homeGoalMinutes : awayGoalMinutes;
  const playerGoalMinutes = mySideMinutes.slice(0, r.goals || 0);
  const assistMinutes = mySideMinutes.slice(r.goals || 0, (r.goals || 0) + (r.assists || 0));

  const events = [{
    minute: 0,
    text: r.played ? `Kickoff: ${r.home} vs ${r.away}.` : `${p.name} is sidelined and misses out. Kickoff: ${r.home} vs ${r.away}.`
  }];

  const flavorCount = randi(3, 5);
  for (let i = 0; i < flavorCount; i++) events.push({ minute: pickMinute(), text: choice(MATCH_FLAVOR_LINES) });

  function addGoalEvents(minutes, teamSide, teamName, isPlayerTeam) {
    minutes.forEach(m => {
      let text;
      if (isPlayerTeam && playerGoalMinutes.includes(m)) text = `⚽ GOAL! ${p.name} scores for ${teamName}!`;
      else if (isPlayerTeam && assistMinutes.includes(m)) text = `⚽ GOAL for ${teamName}! (assist: ${p.name})`;
      else text = `⚽ GOAL for ${teamName}!`;
      events.push({ minute: m, text, team: teamSide });
    });
  }
  addGoalEvents(homeGoalMinutes, 'home', r.home, r.playerIsHome);
  addGoalEvents(awayGoalMinutes, 'away', r.away, !r.playerIsHome);

  const htHome = homeGoalMinutes.filter(m => m <= 45).length;
  const htAway = awayGoalMinutes.filter(m => m <= 45).length;
  events.push({ minute: 45, text: `Half-time: ${r.home} ${htHome} - ${htAway} ${r.away}.` });

  events.push({ minute: 90, text: `Full time: ${r.home} ${r.scoreHome} - ${r.scoreAway} ${r.away}.` });
  if (r.played) events.push({ minute: 90, text: `${p.name} rated ${r.rating.toFixed(1)} for the match.` });
  if (r.injured) events.push({ minute: 90, text: `⚠️ ${p.name} picked up a knock and will be out for a spell.` });

  events.sort((a, b) => a.minute - b.minute);
  return events;
}

let liveTimer = null;

function clearLivePlayback() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

// Plays a precomputed match result back in real time (default: a 90-minute
// match compressed into ~2 minutes of wall-clock time), revealing events
// and the live score as the clock ticks. The final outcome is already
// decided — this only controls the pacing of how it's revealed.
function startLivePlayback(r, events, totalMs, onDone) {
  clearLivePlayback();
  const logEl = document.getElementById('matchLog');
  logEl.innerHTML = '';
  document.getElementById('liveClock').textContent = "0'";
  document.getElementById('liveScore').textContent = '0 - 0';
  document.getElementById('btnSkipToFullTime').style.display = 'inline-block';
  document.getElementById('btnContinueAfterMatch').style.display = 'none';
  document.getElementById('matchRatingBox').textContent = '';

  const startTs = Date.now();
  let revealedCount = 0;
  let runHome = 0, runAway = 0;

  function revealUpTo(minute) {
    while (revealedCount < events.length && events[revealedCount].minute <= minute) {
      const ev = events[revealedCount];
      if (ev.team === 'home') runHome++;
      else if (ev.team === 'away') runAway++;
      if (ev.team) document.getElementById('liveScore').textContent = `${runHome} - ${runAway}`;
      const li = document.createElement('li');
      li.textContent = ev.text;
      if (ev.team || /Full time/.test(ev.text)) li.className = 'big';
      logEl.appendChild(li);
      logEl.scrollTop = logEl.scrollHeight;
      revealedCount++;
    }
  }

  function finish() {
    clearLivePlayback();
    document.getElementById('liveClock').textContent = 'FT';
    document.getElementById('btnSkipToFullTime').style.display = 'none';
    document.getElementById('btnContinueAfterMatch').style.display = 'block';
    document.getElementById('matchRatingBox').textContent = r.played
      ? `Match rating: ${r.rating.toFixed(1)} · Goals: ${r.goals} · Assists: ${r.assists}`
      : `Did not play this match.`;
    onDone();
  }

  liveTimer = setInterval(() => {
    const elapsed = Date.now() - startTs;
    const virtualMinute = Math.min(90, (elapsed / totalMs) * 90);
    document.getElementById('liveClock').textContent = Math.floor(virtualMinute) + "'";
    revealUpTo(virtualMinute);
    if (virtualMinute >= 90) finish();
  }, 250);

  document.getElementById('btnSkipToFullTime').onclick = () => {
    clearLivePlayback();
    revealUpTo(90);
    finish();
  };
}

/* ---------- Rendering ---------- */

const screens = ['create', 'hub', 'match', 'cup-intro', 'cup-result', 'season-end', 'retire'];
function showScreen(id) {
  for (const s of screens) {
    document.getElementById(`screen-${s}`).classList.toggle('active', s === id);
  }
  document.getElementById('topbar').classList.toggle('visible', ['hub', 'match', 'cup-intro', 'cup-result'].includes(id));
}

function renderTopbar() {
  if (!state) return;
  const p = state.player;
  document.getElementById('hdrAvatar').innerHTML = playerAvatarSvg(p.hair, p.jerseyPrimary, p.jerseySecondary, 34);
  document.getElementById('hdrName').textContent = `${p.name} (${p.position})`;
  document.getElementById('hdrClub').textContent = `${state.clubs[p.clubIndex].name} — ${currentLeague().name}`;
  document.getElementById('hdrAge').textContent = `Age ${p.age}`;
  document.getElementById('hdrWage').textContent = `$${p.wage}/wk`;
}

function attrBarsHtml(player, extraKeys) {
  const keys = extraKeys || Object.keys(POSITION_WEIGHTS[player.position]);
  return keys.map(key => {
    const val = Math.round(player.attrs[key]);
    return `<div class="bar-row">
      <span class="label">${ATTR_LABELS[key]}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${val}%"></div></div>
      <span class="bar-val">${val}</span>
    </div>`;
  }).join('');
}

/* ---- Create screen (profile + club choice) ---- */

const createChoice = {
  position: null,
  nation: NATIONS[0].name,
  hair: HAIR_COLORS[0].hex,
  jerseyPrimary: JERSEY_COLORS[1].hex,
  jerseySecondary: JERSEY_COLORS[6].hex,
  clubOptions: []
};

function updateAvatarPreview() {
  const el = document.getElementById('avatarPreview');
  if (el) el.innerHTML = playerAvatarSvg(createChoice.hair, createChoice.jerseyPrimary, createChoice.jerseySecondary, 76);
}

function renderCreateScreen() {
  const posGrid = document.getElementById('posGrid');
  posGrid.innerHTML = POSITIONS.map(pos =>
    `<button type="button" class="pos-btn" data-pos="${pos}">${pos}</button>`
  ).join('');
  posGrid.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      createChoice.position = btn.dataset.pos;
      posGrid.querySelectorAll('.pos-btn').forEach(b => b.classList.toggle('selected', b === btn));
      document.getElementById('scoutPreview').innerHTML =
        `Position: <strong>${createChoice.position}</strong> — a raw 16-year-old academy graduate starting in the Development League. Scout says: hidden potential, only football will tell.`;
    });
  });

  const nationSelect = document.getElementById('nationSelect');
  nationSelect.innerHTML = NATIONS.map(n => `<option value="${n.name}">${n.name}</option>`).join('');
  nationSelect.value = createChoice.nation;
  nationSelect.onchange = () => { createChoice.nation = nationSelect.value; };

  function buildSwatchGrid(elId, colors, key) {
    const grid = document.getElementById(elId);
    grid.innerHTML = colors.map(c =>
      `<button type="button" class="swatch-btn" data-hex="${c.hex}" title="${c.name}" style="background:${c.hex};"></button>`
    ).join('');
    function refresh() {
      grid.querySelectorAll('.swatch-btn').forEach(b => b.classList.toggle('selected', b.dataset.hex === createChoice[key]));
    }
    grid.querySelectorAll('.swatch-btn').forEach(b => {
      b.onclick = () => { createChoice[key] = b.dataset.hex; refresh(); updateAvatarPreview(); };
    });
    refresh();
  }
  buildSwatchGrid('hairGrid', HAIR_COLORS, 'hair');
  buildSwatchGrid('jerseyPrimaryGrid', JERSEY_COLORS, 'jerseyPrimary');
  buildSwatchGrid('jerseySecondaryGrid', JERSEY_COLORS, 'jerseySecondary');
  updateAvatarPreview();

  document.getElementById('btnToClubChoice').onclick = () => {
    if (!createChoice.position) { alert('Pick a position first.'); return; }
    createChoice.clubOptions = pickStartingClubChoices();
    renderClubChoiceStep();
    document.getElementById('createStepProfile').style.display = 'none';
    document.getElementById('createStepClub').style.display = 'block';
  };
}

function renderClubChoiceStep() {
  const list = document.getElementById('clubChoiceList');
  list.innerHTML = createChoice.clubOptions.map((c, i) => `
    <div class="offer-card">
      <div class="offer-card-main">
        ${crestWithRatingHtml(c.name, c.strength, 44)}
        <div><strong>${c.name}</strong><div class="info">Development League</div></div>
      </div>
      <button type="button" class="primary club-choice-btn" data-idx="${i}">Sign</button>
    </div>
  `).join('');
  list.querySelectorAll('.club-choice-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.idx);
      const name = document.getElementById('playerName').value.trim() || 'Alex Rookie';
      startNewCareer(name, createChoice.position, createChoice.nation, createChoice.hair, createChoice.jerseyPrimary, createChoice.jerseySecondary, createChoice.clubOptions[idx]);
      showScreen('hub');
      renderTopbar();
      renderHub();
    };
  });
  document.getElementById('btnBackToProfile').onclick = () => {
    document.getElementById('createStepClub').style.display = 'none';
    document.getElementById('createStepProfile').style.display = 'block';
  };
}

/* ---- Hub ---- */

function lastMatchMiniHtml() {
  const r = lastMatchResult;
  if (!r) return '';
  const resultLine = `${r.home} ${r.scoreHome} - ${r.scoreAway} ${r.away}`;
  const perf = r.played ? ` · You rated ${r.rating.toFixed(1)}${r.goals ? ` · ${r.goals} goal${r.goals > 1 ? 's' : ''}` : ''}${r.assists ? ` · ${r.assists} assist${r.assists > 1 ? 's' : ''}` : ''}` : ' · You did not play (injured)';
  return `<div class="muted" id="lastMatchMini">Last match${r.context ? ` (${r.context})` : ''}: ${resultLine}${perf}</div>`;
}

function renderHub() {
  const p = state.player;
  document.getElementById('hubWeekTitle').textContent =
    p.injuredWeeksLeft > 0 ? `Week ${state.week} — Injured (${p.injuredWeeksLeft} wks left)` : `Week ${state.week} of ${SEASON_LENGTH}`;
  document.getElementById('hubSeasonLabel').textContent = `Season ${state.season}`;

  const overall = computeOverall(p);
  document.getElementById('hubStatus').innerHTML = `
    ${lastMatchMiniHtml()}
    <div class="muted club-line">${crestPlainHtml(state.clubs[p.clubIndex].name, 22)}${state.clubs[p.clubIndex].name} · ${currentLeague().name} · Overall Rating: <strong>${overall}</strong> · Contract: ${p.contractYearsLeft} yr(s) left</div>
    <div class="bar-row"><span class="label">Fitness</span><div class="bar-track"><div class="bar-fill fitness" style="width:${p.fitness}%"></div></div><span class="bar-val">${Math.round(p.fitness)}</span></div>
    <div class="bar-row"><span class="label">Morale</span><div class="bar-track"><div class="bar-fill morale" style="width:${p.morale}%"></div></div><span class="bar-val">${Math.round(p.morale)}</span></div>
  `;

  const displayKeys = trainableAttrs(p.position);
  document.getElementById('hubAttrs').innerHTML = `<h3>Attributes</h3>` + attrBarsHtml(p, displayKeys);

  const trainGrid = document.getElementById('trainGrid');
  const trainable = trainableAttrs(p.position);
  const disabled = state.trainingLeft <= 0 || p.injuredWeeksLeft > 0;
  trainGrid.innerHTML = trainable.map(key =>
    `<button type="button" class="train-btn" data-key="${key}" ${disabled ? 'disabled' : ''}>Train ${ATTR_LABELS[key]}</button>`
  ).join('');
  trainGrid.querySelectorAll('.train-btn').forEach(btn => {
    btn.onclick = () => trainAttribute(btn.dataset.key);
  });

  document.getElementById('btnRest').disabled = state.trainingLeft <= 0;
  document.getElementById('btnRest').onclick = restWeek;

  document.getElementById('hubActionsHint').textContent = p.injuredWeeksLeft > 0
    ? `Recovering from injury — training unavailable this week.`
    : `Training sessions left this week: ${state.trainingLeft} / ${TRAINING_SESSIONS_PER_WEEK}`;

  document.getElementById('btnPlayMatch').onclick = () => {
    playDomesticMatchDay();
    renderMatchScreen();
    showScreen('match');
  };

  document.getElementById('btnSimMatch').onclick = () => {
    playDomesticMatchDay();
    proceedAfterMatch();
  };

  renderLeagueTable('leagueTable', true);
  renderCareerSummaryMini();
  renderTopbar();
}

function renderLeagueTable(elId, highlightPlayer) {
  const rows = sortedTable();
  const p = state.player;
  const html = `
    <thead><tr><th>#</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GD</th><th class="num">Pts</th></tr></thead>
    <tbody>
      ${rows.map((r, i) => `
        <tr class="${highlightPlayer && r.clubIndex === p.clubIndex ? 'you' : ''}">
          <td>${i + 1}</td><td class="club-cell">${crestPlainHtml(r.name, 20)}${r.name}</td><td class="num">${r.played}</td><td class="num">${r.won}</td>
          <td class="num">${r.drawn}</td><td class="num">${r.lost}</td><td class="num">${r.gf - r.ga}</td><td class="num">${r.pts}</td>
        </tr>`).join('')}
    </tbody>`;
  document.getElementById(elId).innerHTML = html;
}

function renderCareerSummaryMini() {
  const cs = state.player.careerStats;
  const trophiesHtml = cs.trophies.length
    ? cs.trophies.map(t => `<span class="trophy">🏆 ${t}</span>`).join(' ')
    : '<span class="muted">No trophies yet.</span>';
  document.getElementById('careerSummaryMini').innerHTML = `
    Career: ${cs.matches} apps · ${cs.goals} goals · ${cs.assists} assists · ${cs.cleanSheets} clean sheets · Nation: ${state.player.nation}<br>
    ${trophiesHtml}
  `;
  document.getElementById('btnNewCareer').onclick = () => {
    if (confirm('This ends your current career permanently and starts a new one. Continue?')) {
      clearSave();
      state = null;
      lastMatchResult = null;
      showScreen('create');
    }
  };
}

/* ---- Match screen (live playback for both league and cup matches) ---- */

function renderMatchScreen() {
  const r = lastMatchResult;
  document.getElementById('matchTitle').textContent = r.context || 'Match Day';
  document.getElementById('matchupRow').innerHTML = `
    <div class="team-side">
      ${crestWithRatingHtml(r.home, r.homeStrength, 56)}
      <div class="team-name">${r.home}</div>
    </div>
    <div class="score-live">
      <div class="live-clock" id="liveClock">0'</div>
      <div class="score-banner" id="liveScore">0 - 0</div>
    </div>
    <div class="team-side">
      ${crestWithRatingHtml(r.away, r.awayStrength, 56)}
      <div class="team-name">${r.away}</div>
    </div>
  `;

  document.getElementById('btnContinueAfterMatch').onclick = () => {
    if (state.cup) afterCupMatch();
    else proceedAfterMatch();
  };

  const events = buildMatchTimeline(r);
  startLivePlayback(r, events, 120000, () => {});
}

// Shared next-step routing after a domestic league match finishes.
function proceedAfterMatch() {
  if (isSeasonOver()) {
    if (checkChampionsLeagueQualification()) {
      startChampionsLeague();
      renderCupIntroScreen();
      showScreen('cup-intro');
    } else {
      finishSeason();
      renderSeasonEndScreen();
      showScreen('season-end');
    }
  } else {
    renderHub();
    showScreen('hub');
  }
}

/* ---- Cup screens (Champions League / World Cup) ---- */

function renderCupIntroScreen() {
  const cup = state.cup;
  const p = state.player;
  const myName = cup.type === 'ucl' ? state.clubs[p.clubIndex].name : p.nation;
  const myStrength = cup.type === 'ucl' ? state.clubs[p.clubIndex].strength : nationStrength(p.nation);

  document.getElementById('cupIntroTitle').textContent = CUP_INFO[cup.type].label;
  document.getElementById('cupIntroStage').textContent = `${CUP_STAGE_LABELS[cup.stage]} · ${cup.type === 'ucl' ? 'qualified for reaching the top 6' : `representing ${p.nation}`}`;
  document.getElementById('cupIntroMatchup').innerHTML = `
    <div class="team-side">${crestWithRatingHtml(myName, myStrength, 56)}<div class="team-name">${myName}</div></div>
    <div class="score-banner">VS</div>
    <div class="team-side">${crestWithRatingHtml(cup.opponentName, cup.opponentStrength, 56)}<div class="team-name">${cup.opponentName}</div></div>
  `;

  document.getElementById('btnCupPlay').onclick = () => {
    playCupMatch();
    renderMatchScreen();
    showScreen('match');
  };
  document.getElementById('btnCupSim').onclick = () => {
    playCupMatch();
    afterCupMatch();
  };
}

function afterCupMatch() {
  const cup = state.cup;
  if (cup.result === 'advance') {
    renderCupIntroScreen();
    showScreen('cup-intro');
  } else {
    renderCupResultScreen();
    showScreen('cup-result');
  }
}

function renderCupResultScreen() {
  const cup = state.cup;
  const won = cup.result === 'won';
  document.getElementById('cupResultTitle').textContent = won ? `${CUP_INFO[cup.type].label} Winners! 🏆` : 'Eliminated';
  document.getElementById('cupResultBody').innerHTML = won
    ? `<p>You lifted the ${CUP_INFO[cup.type].label} trophy!</p>`
    : `<p>Your run in the ${CUP_INFO[cup.type].label} ended at the ${CUP_STAGE_LABELS[cup.stage]} stage.</p>`;

  document.getElementById('btnCupResultContinue').onclick = () => {
    const type = cup.type;
    state.cup = null;
    save();
    if (type === 'ucl') {
      finishSeason();
      renderSeasonEndScreen();
      showScreen('season-end');
    } else {
      renderHub();
      showScreen('hub');
    }
  };
}

/* ---- Season end / retirement ---- */

function renderSeasonEndScreen() {
  const p = state.player;
  const h = state.history[state.history.length - 1];
  document.getElementById('seasonSummary').innerHTML = `
    <p class="club-line">${crestPlainHtml(state.clubs[p.clubIndex].name, 26)}<strong>${state.clubs[p.clubIndex].name}</strong> (${h.league}) finished <strong>#${h.finish}</strong> this season.</p>
    <p>${p.name}: ${h.apps} apps · ${h.goals} goals · ${h.assists} assists · avg rating ${h.avgRating || '—'}</p>
    ${h.trophy ? `<span class="trophy">🏆 ${h.trophy}</span>` : ''}
  `;
  renderLeagueTable('finalTable', true);

  const offersList = document.getElementById('offersList');
  if (state.pendingTransfer) {
    const t = state.pendingTransfer;
    offersList.innerHTML = `<p>You've agreed to join <strong>${t.clubName}</strong> (${findLeague(t.leagueId).name}) for $${t.wage}/wk — it kicks in next season.</p>`;
  } else if (state.pendingOffers.length === 0) {
    offersList.innerHTML = `<p class="muted">No transfer offers this window.</p>`;
  } else {
    offersList.innerHTML = state.pendingOffers.map(o => `
      <div class="offer-card">
        <div class="offer-card-main">
          ${crestWithRatingHtml(o.clubName, o.strength, 44)}
          <div>
            <strong>${o.clubName}</strong>
            <div class="info">${o.leagueName} · Wage offer: $${o.wage}/wk</div>
          </div>
        </div>
        <button data-offer="${o.id}" class="primary offer-btn">Sign</button>
      </div>
    `).join('');
    offersList.querySelectorAll('.offer-btn').forEach(btn => {
      btn.onclick = () => {
        acceptOffer(btn.dataset.offer);
        renderSeasonEndScreen();
      };
    });
  }

  document.getElementById('btnStayAtClub').disabled = !!state.pendingTransfer;
  document.getElementById('btnStayAtClub').onclick = () => {
    stayAtClub();
    renderSeasonEndScreen();
  };

  document.getElementById('btnStartNextSeason').onclick = () => {
    const outcome = beginNextSeason();
    if (outcome.retired) {
      renderRetireScreen('You reached retirement age.');
      showScreen('retire');
    } else if (outcome.worldCup) {
      renderCupIntroScreen();
      showScreen('cup-intro');
    } else {
      renderHub();
      showScreen('hub');
    }
  };
}

function renderRetireScreen(reason) {
  const p = state.player;
  document.getElementById('retireReason').textContent = reason;
  const cs = p.careerStats;
  const trophiesHtml = cs.trophies.length
    ? cs.trophies.map(t => `<span class="trophy">🏆 ${t}</span>`).join(' ')
    : '<span class="muted">No trophies won.</span>';

  const historyRows = state.history.map(h =>
    `<tr><td>${h.season}</td><td>${h.club}</td><td>${h.league}</td><td class="num">${h.apps}</td><td class="num">${h.goals}</td><td class="num">${h.assists}</td><td class="num">${h.avgRating || '—'}</td><td class="num">#${h.finish}</td></tr>`
  ).join('');

  document.getElementById('retireSummary').innerHTML = `
    <div class="club-line">${playerAvatarSvg(p.hair, p.jerseyPrimary, p.jerseySecondary, 48)}<h3 style="margin:0;">${p.name} — ${p.position} — ${p.nation}</h3></div>
    <p>Final overall rating: <strong>${computeOverall(p)}</strong></p>
    <p>Career totals: ${cs.matches} apps · ${cs.goals} goals · ${cs.assists} assists · ${cs.cleanSheets} clean sheets</p>
    <p>${trophiesHtml}</p>
    <h3>Season by season</h3>
    <div style="overflow-x:auto;"><table>
      <thead><tr><th>S</th><th>Club</th><th>League</th><th class="num">Apps</th><th class="num">G</th><th class="num">A</th><th class="num">Avg</th><th class="num">Finish</th></tr></thead>
      <tbody>${historyRows}</tbody>
    </table></div>
  `;

  document.getElementById('btnNewCareerAfterRetire').onclick = () => {
    clearSave();
    state = null;
    lastMatchResult = null;
    showScreen('create');
  };
}

/* ---------- Boot ---------- */

function boot() {
  renderCreateScreen();
  if (load() && state && state.player && !state.player.retired) {
    renderTopbar();
    renderHub();
    showScreen('hub');
  } else {
    showScreen('create');
  }
}

document.addEventListener('DOMContentLoaded', boot);
