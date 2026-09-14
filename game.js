// FIFA 27 Game Engine

// Player Database
const playerDatabase = [
    { id: 1, name: 'Cristiano Ronaldo', team: 'Al Nassr', position: 'ST', rating: 92, pace: 89, shooting: 93, passing: 82, dribbling: 89, defense: 35, physical: 79, nationality: 'Portugal' },
    { id: 2, name: 'Lionel Messi', team: 'Inter Miami', position: 'RW', rating: 91, pace: 85, shooting: 94, passing: 91, dribbling: 95, defense: 38, physical: 65, nationality: 'Argentina' },
    { id: 3, name: 'Erling Haaland', team: 'Manchester City', position: 'ST', rating: 91, pace: 89, shooting: 88, passing: 68, dribbling: 80, defense: 45, physical: 88, nationality: 'Norway' },
    { id: 4, name: 'Kylian Mbappé', team: 'Paris SG', position: 'LW', rating: 91, pace: 97, shooting: 86, passing: 82, dribbling: 92, defense: 36, physical: 82, nationality: 'France' },
    { id: 5, name: 'Vinicius Jr', team: 'Real Madrid', position: 'LW', rating: 89, pace: 96, shooting: 82, passing: 80, dribbling: 93, defense: 35, physical: 80, nationality: 'Brazil' },
    { id: 6, name: 'Rodri', team: 'Manchester City', position: 'CM', rating: 91, pace: 75, shooting: 71, passing: 92, dribbling: 85, defense: 86, physical: 83, nationality: 'Spain' },
    { id: 7, name: 'Harry Kane', team: 'Bayern Munich', position: 'ST', rating: 89, pace: 78, shooting: 91, passing: 83, dribbling: 82, defense: 42, physical: 82, nationality: 'England' },
    { id: 8, name: 'Florian Wirtz', team: 'Bayer Leverkusen', position: 'LW', rating: 86, pace: 92, shooting: 79, passing: 84, dribbling: 92, defense: 35, physical: 72, nationality: 'Germany' },
    { id: 9, name: 'Jude Bellingham', team: 'Real Madrid', position: 'CM', rating: 88, pace: 82, shooting: 78, passing: 83, dribbling: 83, defense: 76, physical: 85, nationality: 'England' },
    { id: 10, name: 'Declan Rice', team: 'Arsenal', position: 'CM', rating: 87, pace: 74, shooting: 68, passing: 85, dribbling: 75, defense: 87, physical: 85, nationality: 'England' },
    { id: 11, name: 'Vinícius Alves', team: 'Manchester City', position: 'CB', rating: 88, pace: 78, shooting: 52, passing: 78, dribbling: 65, defense: 92, physical: 89, nationality: 'Brazil' },
    { id: 12, name: 'Antonio Rüdiger', team: 'Real Madrid', position: 'CB', rating: 87, pace: 78, shooting: 48, passing: 75, dribbling: 70, defense: 89, physical: 87, nationality: 'Germany' },
    { id: 13, name: 'Gianluigi Donnarumma', team: 'Paris SG', position: 'GK', rating: 88, pace: 45, shooting: 42, passing: 65, dribbling: 48, defense: 85, physical: 77, nationality: 'Italy' },
    { id: 14, name: 'Manuel Neuer', team: 'Bayern Munich', position: 'GK', rating: 88, pace: 48, shooting: 40, passing: 78, dribbling: 50, defense: 89, physical: 77, nationality: 'Germany' },
    { id: 15, name: 'Pedri', team: 'Barcelona', position: 'CM', rating: 86, pace: 82, shooting: 75, passing: 88, dribbling: 90, defense: 72, physical: 70, nationality: 'Spain' },
];

const nations = [
    { name: 'England', teams: ['Manchester City', 'Manchester United', 'Arsenal', 'Liverpool'] },
    { name: 'Spain', teams: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Valencia'] },
    { name: 'France', teams: ['Paris SG', 'Marseille', 'Lyon', 'Monaco'] },
    { name: 'Germany', teams: ['Bayern Munich', 'Borussia Dortmund', 'Bayer Leverkusen', 'RB Leipzig'] },
    { name: 'Italy', teams: ['AC Milan', 'Inter Milan', 'Juventus', 'Roma'] },
    { name: 'Argentina', teams: ['River Plate', 'Boca Juniors', 'Racing', 'Independiente'] },
    { name: 'Brazil', teams: ['Flamengo', 'Sao Paulo', 'Palmeiras', 'Santos'] },
    { name: 'Portugal', teams: ['Benfica', 'Porto', 'Sporting CP', 'Braga'] },
];

const clubs = [
    { id: 1, name: 'Manchester City', league: 'Premier League', country: 'England' },
    { id: 2, name: 'Real Madrid', league: 'La Liga', country: 'Spain' },
    { id: 3, name: 'Bayern Munich', league: 'Bundesliga', country: 'Germany' },
    { id: 4, name: 'Paris SG', league: 'Ligue 1', country: 'France' },
    { id: 5, name: 'Inter Milan', league: 'Serie A', country: 'Italy' },
    { id: 6, name: 'Liverpool', league: 'Premier League', country: 'England' },
    { id: 7, name: 'Barcelona', league: 'La Liga', country: 'Spain' },
    { id: 8, name: 'Arsenal', league: 'Premier League', country: 'England' },
    { id: 9, name: 'Bayer Leverkusen', league: 'Bundesliga', country: 'Germany' },
    { id: 10, name: 'Juventus', league: 'Serie A', country: 'Italy' },
];

// Game State
const gameState = {
    currentScreen: 'mainMenu',
    player: {
        coins: 100000,
        futPoints: 5000,
        squad: [],
        bench: [],
        ultimateTeamPlayers: [],
    },
    ultimateTeam: {
        division: 10,
        wins: 0,
        losses: 0,
        points: 0,
        season: 1,
        divisionRewards: {},
    },
    worldCup: {
        stage: 'groupStage',
        groupStageProgress: 0,
        knockoutProgress: 0,
        matches: 0,
        wins: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
    },
    championsLeague: {
        stage: 'groupStage',
        groupStageProgress: 0,
        knockoutProgress: 0,
        matches: 0,
        wins: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
    },
    careerMode: {
        selectedTeam: null,
        season: 1,
        leaguePosition: 0,
        leaguePoints: 0,
        transferBudget: 100,
        matches: 0,
        wins: 0,
        losses: 0,
    },
    currentMatch: {
        homeTeam: null,
        awayTeam: null,
        homeScore: 0,
        awayScore: 0,
        matchTime: 0,
        period: '1st Half',
        events: [],
        stats: {
            homePossession: 50,
            homeShots: 0,
            awaySshots: 0,
            homePasses: 0,
            awayPasses: 0,
            homeFouls: 0,
            awayFouls: 0,
        }
    },
    settings: {
        musicVolume: 100,
        sfxVolume: 100,
        difficulty: 'normal',
        autoSave: true,
    }
};

// Initialize Game
function initGame() {
    loadGameState();
    generateStartingSquad();
    generateMarketPlayers();
    displayScreen('mainMenu');
}

function loadGameState() {
    const saved = localStorage.getItem('fifa27GameState');
    if (saved) {
        Object.assign(gameState, JSON.parse(saved));
    }
}

function saveGameState() {
    localStorage.setItem('fifa27GameState', JSON.stringify(gameState));
}

function generateStartingSquad() {
    if (gameState.player.squad.length === 0) {
        const startingPlayers = playerDatabase.slice(0, 11);
        gameState.player.squad = startingPlayers.map(p => ({...p}));
        gameState.player.ultimateTeamPlayers = [...playerDatabase].map((p, i) => ({
            ...p,
            cardType: i < 5 ? 'legendary' : i < 15 ? 'rare' : 'common',
            owned: i < 3,
            marketPrice: p.rating * 500 + Math.random() * 1000
        }));
    }
}

function generateMarketPlayers() {
    // Generate some random market listings
    if (!gameState.marketListings) {
        gameState.marketListings = [];
    }
}

// Screen Management
function displayScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const screen = document.getElementById(screenName + 'Screen') || document.getElementById(screenName);
    if (screen) {
        screen.classList.add('active');
        gameState.currentScreen = screenName;
    }
}

function startGame(mode) {
    switch(mode) {
        case 'ultimateTeam':
            displayScreen('ultimateTeam');
            renderUltimateTeam();
            break;
        case 'worldCup':
            displayScreen('worldCup');
            renderWorldCup();
            break;
        case 'championsLeague':
            displayScreen('championsLeague');
            renderChampionsLeague();
            break;
        case 'careerMode':
            displayScreen('careerMode');
            renderCareerMode();
            break;
    }
    saveGameState();
}

function backToMenu() {
    displayScreen('mainMenu');
    saveGameState();
}

function openSettings() {
    displayScreen('settings');
}

// ===== ULTIMATE TEAM =====
function renderUltimateTeam() {
    updateCurrencyDisplay();
    switchUTTab('squad');
    renderSquad();
    renderDivisions();
}

function updateCurrencyDisplay() {
    document.getElementById('coins').textContent = gameState.player.coins.toLocaleString();
    document.getElementById('futPoints').textContent = gameState.player.futPoints.toLocaleString();
}

function renderSquad() {
    const squadDisplay = document.getElementById('squadDisplay');
    squadDisplay.innerHTML = '';

    const formation = document.getElementById('formationSelect').value || '433';
    const positions = getFormationPositions(formation);

    positions.forEach((position, index) => {
        const player = gameState.player.squad[index];
        const div = document.createElement('div');
        div.className = 'squad-position' + (!player ? ' empty' : '');

        if (player) {
            div.innerHTML = `
                <div class="player-card">
                    <div class="player-name">${player.name}</div>
                    <div class="player-rating">${player.rating}</div>
                    <div class="player-position">${player.position}</div>
                </div>
            `;
        } else {
            div.innerHTML = '<div class="player-name">Empty Slot</div>';
        }

        squadDisplay.appendChild(div);
    });

    renderBench();
}

function getFormationPositions(formation) {
    const formations = {
        '433': ['GK', 'CB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'RB', 'ST', 'ST', 'ST'],
        '442': ['GK', 'CB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'RB', 'ST', 'ST'],
        '352': ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
        '541': ['GK', 'CB', 'CB', 'CB', 'CB', 'CB', 'CM', 'CM', 'ST'],
    };
    return formations[formation] || formations['433'];
}

function renderBench() {
    const benchDisplay = document.getElementById('benchDisplay');
    benchDisplay.innerHTML = '';

    gameState.player.bench.forEach(player => {
        const div = document.createElement('div');
        div.className = 'bench-player';
        div.innerHTML = `
            <div><strong>${player.name}</strong></div>
            <div>${player.rating}</div>
        `;
        div.onclick = () => addToBench(player);
        benchDisplay.appendChild(div);
    });
}

function changeFormation() {
    renderSquad();
}

function renderMarket() {
    const marketList = document.getElementById('marketList');
    marketList.innerHTML = '';

    gameState.player.ultimateTeamPlayers.forEach(player => {
        if (!player.owned) {
            const div = document.createElement('div');
            div.className = 'market-item';
            div.innerHTML = `
                <div class="market-item-name">${player.name}</div>
                <div class="market-item-stats">${player.position} | ${player.team}</div>
                <div class="market-item-stats">Rating: ${player.rating}</div>
                <div class="market-item-price">💰 ${Math.round(player.marketPrice).toLocaleString()}</div>
                <button class="buy-btn" onclick="buyPlayer(${player.id})">Buy</button>
            `;
            marketList.appendChild(div);
        }
    });
}

function searchPlayers() {
    const search = document.getElementById('playerSearch').value.toLowerCase();
    const marketList = document.getElementById('marketList');

    const filtered = gameState.player.ultimateTeamPlayers.filter(p =>
        !p.owned && p.name.toLowerCase().includes(search)
    );

    marketList.innerHTML = '';
    filtered.forEach(player => {
        const div = document.createElement('div');
        div.className = 'market-item';
        div.innerHTML = `
            <div class="market-item-name">${player.name}</div>
            <div class="market-item-stats">${player.position} | ${player.team}</div>
            <div class="market-item-stats">Rating: ${player.rating}</div>
            <div class="market-item-price">💰 ${Math.round(player.marketPrice).toLocaleString()}</div>
            <button class="buy-btn" onclick="buyPlayer(${player.id})">Buy</button>
        `;
        marketList.appendChild(div);
    });
}

function filterMarket() {
    renderMarket();
}

function buyPlayer(playerId) {
    const player = gameState.player.ultimateTeamPlayers.find(p => p.id === playerId);
    if (player && gameState.player.coins >= player.marketPrice) {
        gameState.player.coins -= Math.round(player.marketPrice);
        player.owned = true;
        gameState.player.squad.push(player);
        updateCurrencyDisplay();
        renderSquad();
        renderMarket();
    } else {
        alert('Not enough coins!');
    }
}

function openPack(packType, price) {
    if (gameState.player.coins < price) {
        alert('Not enough coins!');
        return;
    }

    gameState.player.coins -= price;
    updateCurrencyDisplay();

    const packSizes = { bronze: 3, silver: 5, gold: 12, elite: 20, premium: 30 };
    const packSize = packSizes[packType];
    const packPlayers = [];

    for (let i = 0; i < packSize; i++) {
        const randomPlayer = gameState.player.ultimateTeamPlayers[
            Math.floor(Math.random() * gameState.player.ultimateTeamPlayers.length)
        ];
        if (!randomPlayer.owned) {
            randomPlayer.owned = true;
            gameState.player.squad.push(randomPlayer);
        }
        packPlayers.push(randomPlayer);
    }

    displayPackContents(packPlayers);
}

function displayPackContents(players) {
    document.getElementById('packOpening').style.display = 'block';
    const contents = document.getElementById('packContents');
    contents.innerHTML = '';

    players.forEach((player, index) => {
        const div = document.createElement('div');
        div.className = 'pack-player';
        div.innerHTML = `
            <div><strong>${player.name}</strong></div>
            <div>${player.rating}</div>
            <div>${player.position}</div>
        `;
        setTimeout(() => contents.appendChild(div), index * 100);
    });
}

function renderDivisions() {
    document.getElementById('currentDivision').textContent = gameState.ultimateTeam.division;
    document.getElementById('divisionWins').textContent = gameState.ultimateTeam.wins;
    document.getElementById('divisionPoints').textContent = gameState.ultimateTeam.points;

    const leaderboard = document.getElementById('leaderboardList');
    leaderboard.innerHTML = '';

    for (let i = 1; i <= 10; i++) {
        const div = document.createElement('div');
        div.className = 'leaderboard-entry';
        div.innerHTML = `
            <div class="leaderboard-rank">#${i}</div>
            <div>Player ${i}</div>
            <div>${1000 - i * 100} pts</div>
        `;
        leaderboard.appendChild(div);
    }
}

function addToBench(player) {
    const index = gameState.player.squad.indexOf(player);
    if (index > -1) {
        gameState.player.squad.splice(index, 1);
        gameState.player.bench.push(player);
        renderSquad();
    }
}

function switchUTTab(tabName) {
    document.querySelectorAll('.ut-tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName + 'Tab').classList.add('active');

    document.querySelectorAll('.ut-navigation .nav-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (tabName === 'market') renderMarket();
    if (tabName === 'division') renderDivisions();
}

// ===== WORLD CUP =====
function renderWorldCup() {
    const groupsDisplay = document.getElementById('groupsDisplay');
    groupsDisplay.innerHTML = '';

    nations.forEach((nation, index) => {
        const div = document.createElement('div');
        div.className = 'group';
        div.innerHTML = `
            <div class="group-name">Group ${String.fromCharCode(65 + index)}</div>
            <div class="group-teams">
                ${nation.teams.map(team => `<div>🏴 ${team}</div>`).join('')}
            </div>
        `;
        groupsDisplay.appendChild(div);
    });
}

function playWorldCupMatch() {
    initMatch('worldCup');
}

function renderChampionsLeague() {
    const groupsDisplay = document.getElementById('clGroupsDisplay');
    groupsDisplay.innerHTML = '';

    clubs.slice(0, 8).forEach((club, index) => {
        const div = document.createElement('div');
        div.className = 'group';
        div.innerHTML = `
            <div class="group-name">Group ${String.fromCharCode(65 + index)}</div>
            <div class="group-teams">
                <div>🏟️ ${club.name}</div>
            </div>
        `;
        groupsDisplay.appendChild(div);
    });
}

function playClMatch() {
    initMatch('championsLeague');
}

// ===== CAREER MODE =====
function renderCareerMode() {
    switchCareerTab('overview');
    if (!gameState.careerMode.selectedTeam) {
        const firstTeam = clubs[0];
        gameState.careerMode.selectedTeam = firstTeam.id;
    }
    updateCareerInfo();
}

function switchCareerTab(tabName) {
    document.querySelectorAll('.career-tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName + 'Tab').classList.add('active');

    document.querySelectorAll('.career-navigation .nav-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function updateCareerInfo() {
    const team = clubs.find(c => c.id === gameState.careerMode.selectedTeam);
    if (team) {
        document.getElementById('teamName').textContent = team.name;
        document.getElementById('currentSeason').textContent = 2026 + gameState.careerMode.season;
        document.getElementById('leaguePosition').textContent = gameState.careerMode.leaguePosition || 'N/A';
        document.getElementById('leaguePoints').textContent = gameState.careerMode.leaguePoints;
        document.getElementById('transferBudget').textContent = gameState.careerMode.transferBudget;
    }
}

function playCareerMatch() {
    initMatch('careerMode');
}

// ===== MATCH ENGINE =====
function initMatch(mode) {
    gameState.currentMatch = {
        homeTeam: 'Your Team',
        awayTeam: 'Opponent',
        homeScore: 0,
        awayScore: 0,
        matchTime: 0,
        period: '1st Half',
        events: [],
        stats: {
            homePossession: 50,
            homeShots: 0,
            awayShots: 0,
            homePasses: 0,
            awayPasses: 0,
            homeFouls: 0,
            awayFouls: 0,
        }
    };
    displayScreen('match');
    updateMatchDisplay();
}

function updateMatchDisplay() {
    const match = gameState.currentMatch;
    document.getElementById('homeTeam').textContent = match.homeTeam;
    document.getElementById('awayTeam').textContent = match.awayTeam;
    document.getElementById('homeScore').textContent = match.homeScore;
    document.getElementById('awayScore').textContent = match.awayScore;
    document.getElementById('matchTime').textContent = `${Math.floor(match.matchTime / 60)}:${(match.matchTime % 60).toString().padStart(2, '0')}`;
    document.getElementById('matchPeriod').textContent = match.matchTime < 2700 ? '1st Half' : '2nd Half';

    const possession = Math.min(100, Math.max(0, gameState.currentMatch.stats.homePossession));
    document.getElementById('possession').textContent = possession + '%';
    document.getElementById('shots').textContent = `${gameState.currentMatch.stats.homeShots} - ${gameState.currentMatch.stats.awayShots}`;
    document.getElementById('passes').textContent = `${gameState.currentMatch.stats.homePasses} - ${gameState.currentMatch.stats.awayPasses}`;
    document.getElementById('fouls').textContent = `${gameState.currentMatch.stats.homeFouls} - ${gameState.currentMatch.stats.awayFouls}`;

    updateEventsList();
}

function performAction(action) {
    const match = gameState.currentMatch;
    let event = '';

    const difficulty = gameState.settings.difficulty;
    const difficultyModifier = { easy: 0.7, normal: 0.5, hard: 0.3, legendary: 0.1 }[difficulty] || 0.5;

    switch(action) {
        case 'shoot':
            match.stats.homeShots++;
            if (Math.random() > (0.7 + difficultyModifier)) {
                match.homeScore++;
                event = '⚽ GOOOAL! Spectacular finish!';
            } else {
                event = '❌ Missed shot! Blocked by defender';
            }
            break;
        case 'pass':
            match.stats.homePasses++;
            event = '✓ Good pass completed';
            match.stats.homePossession = Math.min(100, match.stats.homePossession + 2);
            break;
        case 'defend':
            match.stats.homeFouls++;
            event = '🛡️ Solid defensive block';
            break;
    }

    match.matchTime += Math.random() * 120 + 60;

    if (match.matchTime > 5400) {
        endMatch();
        return;
    }

    // AI Response
    const aiAction = Math.random();
    if (aiAction > 0.7) {
        match.stats.awayShots++;
        if (Math.random() > (0.6 - difficultyModifier)) {
            match.awayScore++;
            event += '\n⚽ Opponent scores!';
        }
    } else if (aiAction > 0.4) {
        match.stats.awayPasses++;
        match.stats.homePossession = Math.max(20, match.stats.homePossession - 1);
    }

    if (event) {
        match.events.push(event);
    }

    updateMatchDisplay();
}

function skipMatch() {
    while (gameState.currentMatch.matchTime < 5400) {
        performAction(['shoot', 'pass', 'defend'][Math.floor(Math.random() * 3)]);
    }
    endMatch();
}

function updateEventsList() {
    const eventsList = document.getElementById('eventsList');
    eventsList.innerHTML = gameState.currentMatch.events.map(event =>
        `<div class="event">${event}</div>`
    ).join('');
    eventsList.scrollTop = eventsList.scrollHeight;
}

function endMatch() {
    const match = gameState.currentMatch;
    displayMatchResult();
}

function displayMatchResult() {
    const match = gameState.currentMatch;
    const mode = gameState.currentScreen;

    document.getElementById('resultTitle').textContent = 'Match Finished';
    document.getElementById('resultHomeTeam').textContent = match.homeTeam;
    document.getElementById('resultHomeScore').textContent = match.homeScore;
    document.getElementById('resultAwayTeam').textContent = match.awayTeam;
    document.getElementById('resultAwayScore').textContent = match.awayScore;

    let coinsEarned = 0;
    let xpEarned = 0;

    if (match.homeScore > match.awayScore) {
        coinsEarned = 1000;
        xpEarned = 500;
        gameState.ultimateTeam.wins++;
        gameState.ultimateTeam.points += 3;
    } else if (match.homeScore === match.awayScore) {
        coinsEarned = 500;
        xpEarned = 250;
        gameState.ultimateTeam.points += 1;
    } else {
        coinsEarned = 250;
        xpEarned = 100;
    }

    gameState.player.coins += coinsEarned;
    document.getElementById('coinsEarned').textContent = coinsEarned.toLocaleString();
    document.getElementById('xpEarned').textContent = xpEarned;

    displayScreen('result');
    saveGameState();
}

// Settings
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('musicVolume')?.addEventListener('change', (e) => {
        gameState.settings.musicVolume = e.target.value;
    });

    document.getElementById('sfxVolume')?.addEventListener('change', (e) => {
        gameState.settings.sfxVolume = e.target.value;
    });

    document.getElementById('difficulty')?.addEventListener('change', (e) => {
        gameState.settings.difficulty = e.target.value;
    });

    document.getElementById('autoSave')?.addEventListener('change', (e) => {
        gameState.settings.autoSave = e.target.checked;
    });

    // Auto save
    setInterval(() => {
        if (gameState.settings.autoSave) {
            saveGameState();
        }
    }, 30000);

    initGame();
});
