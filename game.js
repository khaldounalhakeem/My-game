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

// Trainable attrs per position (goalkeeping only for GK, kept out of others' training list)
function trainableAttrs(position) {
  if (position === 'GK') return ['goalkeeping', 'pace', 'passing', 'physical'];
  return ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];
}

const CLUB_NAMES = [
  'Riverside FC', 'Oakdale United', 'Port Albion', 'Grange Rovers', 'Millbrook Town',
  'Eastwick Athletic', 'Stonebridge FC', 'Hartley Rangers', 'Kingswell City', 'Ashford Dynamo'
];

const SEASON_LENGTH = 18; // double round robin across 10 clubs
const TRAINING_SESSIONS_PER_WEEK = 2;
const RETIREMENT_AGE = 35;

/* ---------- Utility ---------- */

function rand(min, max) { return Math.random() * (max - min) + min; }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }
function choice(arr) { return arr[randi(0, arr.length - 1)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function computeOverall(player) {
  const weights = POSITION_WEIGHTS[player.position];
  let total = 0;
  for (const key in weights) total += player.attrs[key] * weights[key];
  return Math.round(total);
}

function starRating(potentialAvg) {
  // potentialAvg roughly 55-95 -> 1-5 stars
  const stars = Math.round(clamp((potentialAvg - 55) / 40, 0, 1) * 4) + 1;
  return clamp(stars, 1, 5);
}

/* ---------- State ---------- */

let state = null;

function freshClubs() {
  // tier: relative strength 1 (weak) - 5 (elite), base strength 38-92
  return CLUB_NAMES.map((name, i) => {
    const tier = i < 4 ? 1 : i < 7 ? 2 : i < 9 ? 3 : 4;
    const base = { 1: 42, 2: 58, 3: 72, 4: 85 }[tier] + randi(-4, 4);
    return { name, tier, strength: base };
  });
}

function newPlayer(name, position) {
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

function startNewCareer(name, position) {
  const clubs = freshClubs();
  const player = newPlayer(name, position);
  // Start at a weak club (tier 1) chosen randomly among tier-1 clubs.
  const tier1 = clubs.map((c, i) => i).filter(i => clubs[i].tier === 1);
  player.clubIndex = choice(tier1);

  state = {
    player,
    clubs,
    season: 1,
    week: 1,
    trainingLeft: TRAINING_SESSIONS_PER_WEEK,
    trainedThisWeek: [],
    fixtures: buildFixtures(clubs.length),
    table: newLeagueTable(clubs),
    history: [],
    pendingOffers: []
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
  } else {
    // Past prime: training only slows decline elsewhere; still counts as a session.
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

/* ---------- Match simulation ---------- */

function currentRound() {
  return state.fixtures[state.week - 1];
}

function findPlayerFixture(round) {
  return round.find(([h, a]) => h === state.player.clubIndex || a === state.player.clubIndex);
}

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

let lastMatchResult = null;

function playMatchDay() {
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

  const log = [];
  let goals = 0, assists = 0, rating = 6.0;
  let injured = false;

  if (p.injuredWeeksLeft > 0) {
    p.injuredWeeksLeft--;
    log.push(`${p.name} is sidelined with injury and misses the match.`);
    const [sh, sa] = simQuickScore(club.strength, opp.strength);
    const scoreClub = sh, scoreOpp = sa;
    if (isHome) updateTable(p.clubIndex, oppIdx, scoreClub, scoreOpp);
    else updateTable(oppIdx, p.clubIndex, scoreOpp, scoreClub);
    lastMatchResult = {
      title: `${club.name} vs ${opp.name}`,
      home: isHome ? club.name : opp.name,
      away: isHome ? opp.name : club.name,
      scoreHome: isHome ? scoreClub : scoreOpp,
      scoreAway: isHome ? scoreOpp : scoreClub,
      log, played: false, rating: null, goals: 0, assists: 0
    };
    p.fitness = clamp(p.fitness + 10, 0, 100);
    state.week++;
    state.trainingLeft = TRAINING_SESSIONS_PER_WEEK;
    state.trainedThisWeek = [];
    save();
    return;
  }

  const overall = computeOverall(p);
  const teamStrength = club.strength * 0.75 + overall * 0.25;
  const [rawClubGoals, rawOppGoals] = simQuickScore(teamStrength, opp.strength);
  let clubGoals = rawClubGoals, oppGoals = rawOppGoals;

  // Individual contribution layered on top of the simulated score.
  const form = clamp((p.fitness + p.morale) / 2, 0, 100) / 100;
  if (p.position === 'FWD') {
    const chance = clamp(p.attrs.shooting / 130, 0.05, 0.55) * form;
    for (let i = 0; i < 3; i++) if (Math.random() < chance) goals++;
    clubGoals = Math.max(clubGoals, goals);
    const assistChance = clamp(p.attrs.passing / 200, 0.03, 0.3) * form;
    if (Math.random() < assistChance && clubGoals > goals) assists++;
  } else if (p.position === 'MID') {
    const assistChance = clamp(p.attrs.passing / 140, 0.05, 0.5) * form;
    for (let i = 0; i < 2; i++) if (Math.random() < assistChance && clubGoals > 0) assists++;
    const chance = clamp(p.attrs.shooting / 260, 0.02, 0.2) * form;
    if (Math.random() < chance) { goals++; clubGoals = Math.max(clubGoals, goals + assists); }
  } else if (p.position === 'DEF') {
    const assistChance = clamp(p.attrs.passing / 220, 0.02, 0.15) * form;
    if (Math.random() < assistChance && clubGoals > 0) assists++;
  }

  const cleanSheet = oppGoals === 0;
  if (cleanSheet && (p.position === 'GK' || p.position === 'DEF')) p.careerStats.cleanSheets++, state.player.seasonStats.cleanSheets++;

  // Rating calculation.
  rating = 6.0;
  rating += (overall - opp.strength) / 40;
  rating += goals * 0.9 + assists * 0.5;
  if (p.position === 'GK' || p.position === 'DEF') rating += cleanSheet ? 0.8 : (oppGoals >= 3 ? -0.6 : 0);
  rating += (form - 0.6) * 1.2;
  rating += rand(-0.4, 0.4);
  rating = clamp(Math.round(rating * 10) / 10, 2.0, 10.0);

  const scoreClub = clubGoals, scoreOpp = oppGoals;
  if (isHome) updateTable(p.clubIndex, oppIdx, scoreClub, scoreOpp);
  else updateTable(oppIdx, p.clubIndex, scoreOpp, scoreClub);

  log.push(`Kickoff: ${isHome ? club.name : opp.name} vs ${isHome ? opp.name : club.name}.`);
  if (goals > 0) log.push(`⚽ GOAL! ${p.name} scores${goals > 1 ? ` (x${goals})` : ''}!`);
  if (assists > 0) log.push(`🎯 ${p.name} sets up a goal with a great assist${assists > 1 ? ` (x${assists})` : ''}.`);
  if (cleanSheet && (p.position === 'GK' || p.position === 'DEF')) log.push(`🧤 Clean sheet held!`);
  log.push(`Full time: ${isHome ? club.name : opp.name} ${isHome ? scoreClub : scoreOpp} - ${isHome ? scoreOpp : scoreClub} ${isHome ? opp.name : club.name}.`);
  log.push(`${p.name} rated ${rating.toFixed(1)} for the match.`);

  // Injury chance.
  const injuryChance = clamp(0.03 + (100 - p.fitness) / 400, 0.02, 0.14);
  if (Math.random() < injuryChance) {
    injured = true;
    p.injuredWeeksLeft = randi(2, 5);
    log.push(`⚠️ ${p.name} picked up an injury and will be out for ${p.injuredWeeksLeft} weeks.`);
  }

  p.fitness = clamp(p.fitness - randi(12, 22), 0, 100);
  p.morale = clamp(p.morale + (rating >= 7 ? randi(3, 8) : rating <= 5 ? -randi(3, 8) : randi(-2, 2)), 0, 100);

  p.careerStats.matches++; p.careerStats.goals += goals; p.careerStats.assists += assists;
  const ss = p.seasonStats;
  ss.matches++; ss.goals += goals; ss.assists += assists; ss.ratingSum += rating; ss.ratingCount++;

  lastMatchResult = {
    title: `${isHome ? club.name : opp.name} vs ${isHome ? opp.name : club.name}`,
    home: isHome ? club.name : opp.name,
    away: isHome ? opp.name : club.name,
    scoreHome: isHome ? scoreClub : scoreOpp,
    scoreAway: isHome ? scoreOpp : scoreClub,
    log, played: true, rating, goals, assists, injured
  };

  state.week++;
  state.trainingLeft = TRAINING_SESSIONS_PER_WEEK;
  state.trainedThisWeek = [];
  save();
}

/* ---------- Season end / transfers / aging ---------- */

function isSeasonOver() { return state.week > SEASON_LENGTH; }

function finishSeason() {
  const p = state.player;
  const table = sortedTable();
  const clubRow = table.find(r => r.clubIndex === p.clubIndex);
  const finishPosition = table.findIndex(r => r.clubIndex === p.clubIndex) + 1;

  let trophy = null;
  if (finishPosition === 1) {
    trophy = `League Champion (S${state.season})`;
    p.careerStats.trophies.push(trophy);
  }

  const avgRating = p.seasonStats.ratingCount ? p.seasonStats.ratingSum / p.seasonStats.ratingCount : 0;
  if (avgRating >= 7.6 && computeOverall(p) >= 82) {
    const capTrophy = `International Call-up (S${state.season})`;
    p.careerStats.trophies.push(capTrophy);
  }

  state.history.push({
    season: state.season,
    club: state.clubs[p.clubIndex].name,
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
  const currentTier = state.clubs[p.clubIndex].tier;
  if (avgRating < 6.2 && overall < 55) return [];

  const offers = [];
  const numOffers = avgRating >= 7.5 ? randi(1, 3) : randi(0, 2);
  const candidateIdx = state.clubs
    .map((c, i) => i)
    .filter(i => i !== p.clubIndex && c_tierEligible(state.clubs[i].tier, currentTier, overall));

  function c_tierEligible(tier, curTier, ov) {
    if (tier <= curTier) return tier >= curTier - 1;
    const needed = { 2: 55, 3: 68, 4: 80 }[tier] || 40;
    return ov >= needed - 8;
  }

  for (let i = 0; i < numOffers && candidateIdx.length; i++) {
    const idx = candidateIdx.splice(randi(0, candidateIdx.length - 1), 1)[0];
    const club = state.clubs[idx];
    const wage = Math.round((300 + overall * 25 + club.tier * 250) * rand(0.9, 1.25) / 10) * 10;
    offers.push({ clubIndex: idx, name: club.name, tier: club.tier, wage });
  }
  return offers.sort((a, b) => b.wage - a.wage);
}

function acceptOffer(clubIndex) {
  const p = state.player;
  const offer = state.pendingOffers.find(o => o.clubIndex === clubIndex);
  if (!offer) return;
  p.clubIndex = clubIndex;
  p.wage = offer.wage;
  p.contractYearsLeft = randi(2, 4);
  p.morale = clamp(p.morale + 10, 0, 100);
  state.pendingOffers = [];
  save();
}

function stayAtClub() {
  const p = state.player;
  p.contractYearsLeft = Math.max(1, p.contractYearsLeft - 1);
  if (p.contractYearsLeft <= 1) p.wage = Math.round(p.wage * rand(1.03, 1.15) / 10) * 10;
  state.pendingOffers = [];
  save();
}

function beginNextSeason() {
  const p = state.player;
  p.age += 1;
  p.seasonStats = { matches: 0, goals: 0, assists: 0, cleanSheets: 0, ratingSum: 0, ratingCount: 0 };
  p.fitness = 100;

  if (p.age >= RETIREMENT_AGE) {
    p.retired = true;
    save();
    return true; // retired
  }

  state.season += 1;
  state.week = 1;
  state.trainingLeft = TRAINING_SESSIONS_PER_WEEK;
  state.trainedThisWeek = [];
  state.fixtures = buildFixtures(state.clubs.length);
  state.table = newLeagueTable(state.clubs);
  save();
  return false;
}

/* ---------- Rendering ---------- */

const screens = ['create', 'hub', 'match', 'season-end', 'retire'];
function showScreen(id) {
  for (const s of screens) {
    document.getElementById(`screen-${s}`).classList.toggle('active', s === id);
  }
  document.getElementById('topbar').classList.toggle('visible', id === 'hub' || id === 'match');
}

function renderTopbar() {
  if (!state) return;
  const p = state.player;
  document.getElementById('hdrName').textContent = `${p.name} (${p.position})`;
  document.getElementById('hdrClub').textContent = state.clubs[p.clubIndex].name;
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

function renderCreateScreen() {
  const posGrid = document.getElementById('posGrid');
  posGrid.innerHTML = POSITIONS.map(pos =>
    `<button type="button" class="pos-btn" data-pos="${pos}">${pos}</button>`
  ).join('');
  let selectedPos = null;
  posGrid.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPos = btn.dataset.pos;
      posGrid.querySelectorAll('.pos-btn').forEach(b => b.classList.toggle('selected', b === btn));
      document.getElementById('scoutPreview').innerHTML =
        `Position: <strong>${selectedPos}</strong> — a raw 16-year-old academy graduate. Scout says: hidden potential, only football will tell.`;
    });
  });

  document.getElementById('btnStartCareer').onclick = () => {
    const name = document.getElementById('playerName').value.trim() || 'Alex Rookie';
    if (!selectedPos) { alert('Pick a position first.'); return; }
    startNewCareer(name, selectedPos);
    showScreen('hub');
    renderTopbar();
    renderHub();
  };
}

function renderHub() {
  const p = state.player;
  document.getElementById('hubWeekTitle').textContent =
    p.injuredWeeksLeft > 0 ? `Week ${state.week} — Injured (${p.injuredWeeksLeft} wks left)` : `Week ${state.week} of ${SEASON_LENGTH}`;
  document.getElementById('hubSeasonLabel').textContent = `Season ${state.season}`;

  const overall = computeOverall(p);
  document.getElementById('hubStatus').innerHTML = `
    <div class="muted">${state.clubs[p.clubIndex].name} · Overall Rating: <strong>${overall}</strong> · Contract: ${p.contractYearsLeft} yr(s) left</div>
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
    playMatchDay();
    renderMatchScreen();
    showScreen('match');
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
          <td>${i + 1}</td><td>${r.name}</td><td class="num">${r.played}</td><td class="num">${r.won}</td>
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
    Career: ${cs.matches} apps · ${cs.goals} goals · ${cs.assists} assists · ${cs.cleanSheets} clean sheets<br>
    ${trophiesHtml}
  `;
  document.getElementById('btnNewCareer').onclick = () => {
    if (confirm('This ends your current career permanently and starts a new one. Continue?')) {
      clearSave();
      state = null;
      showScreen('create');
    }
  };
}

function renderMatchScreen() {
  const r = lastMatchResult;
  document.getElementById('matchTitle').textContent = r.title;
  document.getElementById('matchScore').textContent = `${r.scoreHome} - ${r.scoreAway}`;
  document.getElementById('matchTeams').textContent = `${r.home} (H)  vs  ${r.away} (A)`;
  document.getElementById('matchLog').innerHTML = r.log.map(line =>
    `<li class="${/GOAL|Full time/.test(line) ? 'big' : ''}">${line}</li>`
  ).join('');
  document.getElementById('matchRatingBox').textContent = r.played
    ? `Match rating: ${r.rating.toFixed(1)} · Goals: ${r.goals} · Assists: ${r.assists}`
    : `Did not play this match.`;

  document.getElementById('btnContinueAfterMatch').onclick = () => {
    if (isSeasonOver()) {
      finishSeason();
      renderSeasonEndScreen();
      showScreen('season-end');
    } else {
      renderHub();
      showScreen('hub');
    }
  };
}

function renderSeasonEndScreen() {
  const p = state.player;
  const h = state.history[state.history.length - 1];
  document.getElementById('seasonSummary').innerHTML = `
    <p><strong>${state.clubs[p.clubIndex].name}</strong> finished <strong>#${h.finish}</strong> this season.</p>
    <p>${p.name}: ${h.apps} apps · ${h.goals} goals · ${h.assists} assists · avg rating ${h.avgRating || '—'}</p>
    ${h.trophy ? `<span class="trophy">🏆 ${h.trophy}</span>` : ''}
  `;
  renderLeagueTable('finalTable', true);

  const offersList = document.getElementById('offersList');
  if (state.pendingOffers.length === 0) {
    offersList.innerHTML = `<p class="muted">No transfer offers this window.</p>`;
  } else {
    offersList.innerHTML = state.pendingOffers.map(o => `
      <div class="offer-card">
        <div>
          <strong>${o.name}</strong> (Tier ${o.tier})
          <div class="info">Wage offer: $${o.wage}/wk</div>
        </div>
        <button data-club="${o.clubIndex}" class="primary offer-btn">Sign</button>
      </div>
    `).join('');
    offersList.querySelectorAll('.offer-btn').forEach(btn => {
      btn.onclick = () => {
        acceptOffer(Number(btn.dataset.club));
        renderSeasonEndScreen();
      };
    });
  }

  document.getElementById('btnStayAtClub').onclick = () => {
    stayAtClub();
    renderSeasonEndScreen();
  };

  document.getElementById('btnStartNextSeason').onclick = () => {
    const retired = beginNextSeason();
    if (retired) {
      renderRetireScreen('You reached retirement age.');
      showScreen('retire');
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
    `<tr><td>${h.season}</td><td>${h.club}</td><td class="num">${h.apps}</td><td class="num">${h.goals}</td><td class="num">${h.assists}</td><td class="num">${h.avgRating || '—'}</td><td class="num">#${h.finish}</td></tr>`
  ).join('');

  document.getElementById('retireSummary').innerHTML = `
    <h3>${p.name} — ${p.position}</h3>
    <p>Final overall rating: <strong>${computeOverall(p)}</strong></p>
    <p>Career totals: ${cs.matches} apps · ${cs.goals} goals · ${cs.assists} assists · ${cs.cleanSheets} clean sheets</p>
    <p>${trophiesHtml}</p>
    <h3>Season by season</h3>
    <div style="overflow-x:auto;"><table>
      <thead><tr><th>S</th><th>Club</th><th class="num">Apps</th><th class="num">G</th><th class="num">A</th><th class="num">Avg</th><th class="num">Finish</th></tr></thead>
      <tbody>${historyRows}</tbody>
    </table></div>
  `;

  document.getElementById('btnNewCareerAfterRetire').onclick = () => {
    clearSave();
    state = null;
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
