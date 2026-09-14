// FIFA 27 Game Engine

// Player Database - Extended with 50+ players
const playerDatabase = [
    // Strikers
    { id: 1, name: 'Cristiano Ronaldo', team: 'Al Nassr', position: 'ST', rating: 92, pace: 89, shooting: 93, passing: 82, dribbling: 89, defense: 35, physical: 79, nationality: 'Portugal' },
    { id: 2, name: 'Lionel Messi', team: 'Inter Miami', position: 'RW', rating: 91, pace: 85, shooting: 94, passing: 91, dribbling: 95, defense: 38, physical: 65, nationality: 'Argentina' },
    { id: 3, name: 'Erling Haaland', team: 'Manchester City', position: 'ST', rating: 91, pace: 89, shooting: 88, passing: 68, dribbling: 80, defense: 45, physical: 88, nationality: 'Norway' },
    { id: 4, name: 'Kylian Mbappé', team: 'Paris SG', position: 'LW', rating: 91, pace: 97, shooting: 86, passing: 82, dribbling: 92, defense: 36, physical: 82, nationality: 'France' },
    { id: 5, name: 'Vinicius Jr', team: 'Real Madrid', position: 'LW', rating: 89, pace: 96, shooting: 82, passing: 80, dribbling: 93, defense: 35, physical: 80, nationality: 'Brazil' },
    { id: 7, name: 'Harry Kane', team: 'Bayern Munich', position: 'ST', rating: 89, pace: 78, shooting: 91, passing: 83, dribbling: 82, defense: 42, physical: 82, nationality: 'England' },
    { id: 16, name: 'Lamine Yamal', team: 'Barcelona', position: 'RW', rating: 85, pace: 91, shooting: 78, passing: 80, dribbling: 88, defense: 32, physical: 68, nationality: 'Spain' },
    { id: 17, name: 'Phil Foden', team: 'Manchester City', position: 'LW', rating: 88, pace: 87, shooting: 84, passing: 86, dribbling: 90, defense: 41, physical: 71, nationality: 'England' },
    { id: 18, name: 'Alejandro Balde', team: 'Barcelona', position: 'LB', rating: 81, pace: 89, shooting: 42, passing: 76, dribbling: 80, defense: 78, physical: 77, nationality: 'Spain' },
    // Midfielders
    { id: 6, name: 'Rodri', team: 'Manchester City', position: 'CM', rating: 91, pace: 75, shooting: 71, passing: 92, dribbling: 85, defense: 86, physical: 83, nationality: 'Spain' },
    { id: 8, name: 'Florian Wirtz', team: 'Bayer Leverkusen', position: 'LW', rating: 86, pace: 92, shooting: 79, passing: 84, dribbling: 92, defense: 35, physical: 72, nationality: 'Germany' },
    { id: 9, name: 'Jude Bellingham', team: 'Real Madrid', position: 'CM', rating: 88, pace: 82, shooting: 78, passing: 83, dribbling: 83, defense: 76, physical: 85, nationality: 'England' },
    { id: 10, name: 'Declan Rice', team: 'Arsenal', position: 'CM', rating: 87, pace: 74, shooting: 68, passing: 85, dribbling: 75, defense: 87, physical: 85, nationality: 'England' },
    { id: 15, name: 'Pedri', team: 'Barcelona', position: 'CM', rating: 86, pace: 82, shooting: 75, passing: 88, dribbling: 90, defense: 72, physical: 70, nationality: 'Spain' },
    { id: 19, name: 'Bruno Fernandes', team: 'Manchester United', position: 'CM', rating: 87, pace: 81, shooting: 83, passing: 89, dribbling: 86, defense: 71, physical: 79, nationality: 'Portugal' },
    { id: 20, name: 'Kevin De Bruyne', team: 'Manchester City', position: 'CM', rating: 89, pace: 83, shooting: 86, passing: 93, dribbling: 87, defense: 61, physical: 78, nationality: 'Belgium' },
    { id: 21, name: 'Gavi', team: 'Barcelona', position: 'CM', rating: 83, pace: 84, shooting: 76, passing: 85, dribbling: 87, defense: 69, physical: 66, nationality: 'Spain' },
    // Defenders
    { id: 11, name: 'Vinícius Alves', team: 'Manchester City', position: 'CB', rating: 88, pace: 78, shooting: 52, passing: 78, dribbling: 65, defense: 92, physical: 89, nationality: 'Brazil' },
    { id: 12, name: 'Antonio Rüdiger', team: 'Real Madrid', position: 'CB', rating: 87, pace: 78, shooting: 48, passing: 75, dribbling: 70, defense: 89, physical: 87, nationality: 'Germany' },
    { id: 22, name: 'Sergio Gómez', team: 'Anderlecht', position: 'LB', rating: 80, pace: 90, shooting: 35, passing: 74, dribbling: 78, defense: 80, physical: 75, nationality: 'Spain' },
    { id: 23, name: 'Kyle Walker', team: 'Manchester City', position: 'RB', rating: 86, pace: 88, shooting: 42, passing: 72, dribbling: 70, defense: 88, physical: 85, nationality: 'England' },
    { id: 24, name: 'Achraf Hakimi', team: 'Paris SG', position: 'RB', rating: 86, pace: 90, shooting: 58, passing: 76, dribbling: 83, defense: 84, physical: 82, nationality: 'Morocco' },
    { id: 25, name: 'Alejandro Balde', team: 'Barcelona', position: 'LB', rating: 81, pace: 89, shooting: 42, passing: 76, dribbling: 80, defense: 78, physical: 77, nationality: 'Spain' },
    { id: 26, name: 'Bastoni', team: 'Inter Milan', position: 'CB', rating: 86, pace: 79, shooting: 47, passing: 78, dribbling: 72, defense: 87, physical: 83, nationality: 'Italy' },
    { id: 27, name: 'Simon Kjær', team: 'AC Milan', position: 'CB', rating: 84, pace: 75, shooting: 44, passing: 75, dribbling: 68, defense: 86, physical: 85, nationality: 'Denmark' },
    // Goalkeepers
    { id: 13, name: 'Gianluigi Donnarumma', team: 'Paris SG', position: 'GK', rating: 88, pace: 45, shooting: 42, passing: 65, dribbling: 48, defense: 85, physical: 77, nationality: 'Italy' },
    { id: 14, name: 'Manuel Neuer', team: 'Bayern Munich', position: 'GK', rating: 88, pace: 48, shooting: 40, passing: 78, dribbling: 50, defense: 89, physical: 77, nationality: 'Germany' },
    { id: 28, name: 'Ederson', team: 'Manchester City', position: 'GK', rating: 86, pace: 52, shooting: 38, passing: 91, dribbling: 62, defense: 82, physical: 75, nationality: 'Brazil' },
    { id: 29, name: 'Thibaut Courtois', team: 'Real Madrid', position: 'GK', rating: 86, pace: 48, shooting: 38, passing: 72, dribbling: 48, defense: 88, physical: 80, nationality: 'Belgium' },
    // Additional attackers
    { id: 30, name: 'Bukayo Saka', team: 'Arsenal', position: 'RW', rating: 84, pace: 89, shooting: 79, passing: 78, dribbling: 85, defense: 48, physical: 73, nationality: 'England' },
    { id: 31, name: 'Alexis Sánchez', team: 'Marseille', position: 'LW', rating: 82, pace: 80, shooting: 87, passing: 76, dribbling: 85, defense: 36, physical: 75, nationality: 'Chile' },
    { id: 32, name: 'Vinícius Júnior', team: 'Real Madrid', position: 'LW', rating: 89, pace: 96, shooting: 82, passing: 80, dribbling: 93, defense: 35, physical: 80, nationality: 'Brazil' },
    { id: 33, name: 'Gabriel Martinelli', team: 'Arsenal', position: 'LW', rating: 83, pace: 88, shooting: 78, passing: 76, dribbling: 84, defense: 44, physical: 77, nationality: 'Brazil' },
    { id: 34, name: 'Luis Díaz', team: 'Liverpool', position: 'LW', rating: 85, pace: 90, shooting: 82, passing: 78, dribbling: 88, defense: 39, physical: 77, nationality: 'Colombia' },
    { id: 35, name: 'João Félix', team: 'Barcelona', position: 'LW', rating: 83, pace: 88, shooting: 81, passing: 79, dribbling: 87, defense: 42, physical: 72, nationality: 'Portugal' },
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
        // Start with a basic affordable squad
        const startingPlayers = [
            playerDatabase[27], // Goalkeeper
            playerDatabase[25], // Defender
            playerDatabase[26], // Defender
            playerDatabase[11], // Defender
            playerDatabase[24], // Defender
            playerDatabase[6],  // Midfielder
            playerDatabase[15], // Midfielder
            playerDatabase[21], // Midfielder
            playerDatabase[8],  // Midfielder
            playerDatabase[4],  // Forward
            playerDatabase[5],  // Forward
        ];
        gameState.player.squad = startingPlayers.map(p => ({...p}));
        gameState.player.ultimateTeamPlayers = [...playerDatabase].map((p, i) => ({
            ...p,
            cardType: p.rating >= 90 ? 'legendary' : p.rating >= 85 ? 'rare' : 'common',
            owned: i < 11,
            listedPrice: Math.round(p.rating * 500 + Math.random() * 5000),
            marketPrice: Math.round(p.rating * 500 + Math.random() * 5000 * (1 + (Math.random() - 0.5)))
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

        // Scroll to top when switching screens
        document.querySelector('.content')?.scrollTo(0, 0);
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

    let chemistry = calculateChemistry(gameState.player.squad);

    positions.forEach((position, index) => {
        const player = gameState.player.squad[index];
        const div = document.createElement('div');
        div.className = 'squad-position' + (!player ? ' empty' : '');

        if (player) {
            const playerChemistry = getPlayerChemistry(player, gameState.player.squad);
            div.innerHTML = `
                <div class="player-card">
                    <div class="player-name">${player.name}</div>
                    <div class="player-rating">${player.rating}</div>
                    <div class="player-position">${player.position}</div>
                    <div class="chemistry-dots" style="margin-top: 5px;">
                        ${getChemstyDots(playerChemistry)}
                    </div>
                </div>
            `;
        } else {
            div.innerHTML = '<div class="player-name">Empty Slot</div>';
        }

        squadDisplay.appendChild(div);
    });

    renderBench();
}

function calculateChemistry(squad) {
    if (squad.length === 0) return 0;
    let totalChemistry = 0;

    for (let i = 0; i < squad.length; i++) {
        for (let j = i + 1; j < squad.length; j++) {
            if (squad[i].nationality === squad[j].nationality) {
                totalChemistry += 10;
            }
            if (squad[i].team === squad[j].team) {
                totalChemistry += 5;
            }
        }
    }

    return Math.min(100, totalChemistry);
}

function getPlayerChemistry(player, squad) {
    let chemistry = 5;

    for (let other of squad) {
        if (other === player) continue;
        if (player.nationality === other.nationality) chemistry += 2;
        if (player.team === other.team) chemistry += 1;
    }

    return Math.min(10, chemistry);
}

function getChemstyDots(chemistry) {
    let dots = '';
    for (let i = 0; i < chemistry; i++) {
        dots += '●';
    }
    return `<span style="color: #00ff88; font-size: 10px;">${dots}</span>`;
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
    // Simulate next fixture
    const opponents = clubs.filter(c => c.id !== gameState.careerMode.selectedTeam);
    const opponent = opponents[Math.floor(Math.random() * opponents.length)];

    gameState.currentMatch.homeTeam = clubs.find(c => c.id === gameState.careerMode.selectedTeam).name;
    gameState.currentMatch.awayTeam = opponent.name;

    initMatch('careerMode');
}

function getRecommendedPlayers() {
    // Recommend players based on weak positions
    const squad = gameState.player.squad;
    const avgRating = calculateSquadRating(squad);

    return gameState.player.ultimateTeamPlayers
        .filter(p => !p.owned && p.rating >= avgRating - 2)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5);
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

    const homeSquadRating = calculateSquadRating(gameState.player.squad);
    const opponentRating = 84; // Average opponent

    switch(action) {
        case 'shoot':
            match.stats.homeShots++;
            const shootChance = 0.2 + (difficultyModifier * 0.3) + ((homeSquadRating - opponentRating) * 0.002);
            if (Math.random() < shootChance) {
                match.homeScore++;
                const goalTypes = [
                    '⚽ GOOOAL! Beautiful finish into the top corner! Unstoppable!',
                    '⚽ GOOOAL! Powerful header from close range! Classic!',
                    '⚽ GOOOAL! Long-range thunderbolt! Incredible!',
                    '⚽ GOOOAL! Tap-in from the rebound! Poacher\'s finish!',
                    '⚽ GOOOAL! Curling shot! Bending it like Beckham!',
                    '⚽ GOOOAL! Bicycle kick! What a goal!',
                ];
                event = goalTypes[Math.floor(Math.random() * goalTypes.length)];
            } else {
                const missTypes = [
                    '❌ Missed! Shot went wide of the goal by inches',
                    '❌ Saved! Goalkeeper makes an acrobatic save',
                    '❌ Blocked! Defender throws himself in front of the shot',
                    '❌ Over the bar! So close! Almost a screamer!',
                    '❌ Post! The crossbar denies us!',
                    '❌ Saved with confidence! Great stop by the keeper!',
                ];
                event = missTypes[Math.floor(Math.random() * missTypes.length)];
            }
            break;
        case 'pass':
            match.stats.homePasses++;
            const passTypes = [
                '✓ Perfect pass completed • Moving forward',
                '✓ Crisp pass • Building momentum',
                '✓ Excellent delivery • Creating chances',
                '✓ Quick exchange • Slick movement',
            ];
            event = passTypes[Math.floor(Math.random() * passTypes.length)];
            match.stats.homePossession = Math.min(100, match.stats.homePossession + 3);
            break;
        case 'defend':
            const defenseTypes = [
                '🛡️ Solid tackle • Winning possession',
                '🛡️ Defensive masterclass • Stopping the attack',
                '🛡️ Interception • Quick thinking',
                '🛡️ Clean clearance • Safe hands',
            ];
            event = defenseTypes[Math.floor(Math.random() * defenseTypes.length)];

            if (Math.random() < 0.08) {
                event = '🟨 Yellow card issued! Cautious approach needed';
            }
            break;
    }

    match.matchTime += Math.random() * 120 + 80;

    if (match.matchTime > 5400) {
        endMatch();
        return;
    }

    // Improved AI Response
    const aiRating = 84;
    const aiAction = Math.random();
    const aiChance = aiRating / homeSquadRating;

    if (aiAction > (0.65 * aiChance)) {
        match.stats.awayShots++;
        const aiShootChance = 0.18 + ((aiChance) * 0.1);
        if (Math.random() < aiShootChance) {
            match.awayScore++;
            event += '\n⚽ Opponent scores! Beautiful counter-attack!';
        } else {
            event += '\n❌ Opponent\'s shot goes wide';
        }
    } else if (aiAction > (0.35 * aiChance)) {
        match.stats.awayPasses++;
        event += '\n→ Opponent passes the ball around';
        match.stats.homePossession = Math.max(20, match.stats.homePossession - 2);
    } else {
        event += '\n🛡️ Opponent defends deep';
    }

    if (event) {
        match.events.push(event);
    }

    updateMatchDisplay();
}

function calculateSquadRating(squad) {
    if (squad.length === 0) return 75;
    const totalRating = squad.reduce((sum, player) => sum + player.rating, 0);
    return Math.round(totalRating / squad.length);
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
    let playerBoosts = [];

    // Calculate rewards based on performance
    const squadRating = calculateSquadRating(gameState.player.squad);
    const goalDifference = match.homeScore - match.awayScore;

    if (match.homeScore > match.awayScore) {
        coinsEarned = Math.round(1500 + squadRating * 10 + goalDifference * 100);
        xpEarned = 500 + (squadRating * 2);
        gameState.ultimateTeam.wins++;
        gameState.ultimateTeam.points += 3;
        gameState.careerMode.wins++;
        gameState.careerMode.leaguePoints += 3;
    } else if (match.homeScore === match.awayScore) {
        coinsEarned = Math.round(1000 + squadRating * 8);
        xpEarned = 350 + (squadRating);
        gameState.ultimateTeam.points += 1;
        gameState.careerMode.leaguePoints += 1;
    } else {
        coinsEarned = Math.round(500 + squadRating * 5);
        xpEarned = 150;
    }

    gameState.player.coins += coinsEarned;

    // Award random player boosts
    if (gameState.player.squad.length > 0) {
        const mvp = gameState.player.squad[Math.floor(Math.random() * gameState.player.squad.length)];
        playerBoosts.push(`🌟 ${mvp.name} - Player of the Match!`);
    }

    document.getElementById('coinsEarned').textContent = coinsEarned.toLocaleString();
    document.getElementById('xpEarned').textContent = xpEarned;

    const playerRewardsDiv = document.getElementById('playerRewards');
    playerRewardsDiv.innerHTML = playerBoosts.map(boost => `<p>${boost}</p>`).join('');

    // Progress through tournament
    if (mode.includes('worldCup')) {
        gameState.worldCup.matches++;
        gameState.worldCup.goalsFor += match.homeScore;
        gameState.worldCup.goalsAgainst += match.awayScore;
        if (match.homeScore > match.awayScore) {
            gameState.worldCup.wins++;
        }
    } else if (mode.includes('championsLeague')) {
        gameState.championsLeague.matches++;
        gameState.championsLeague.goalsFor += match.homeScore;
        gameState.championsLeague.goalsAgainst += match.awayScore;
        if (match.homeScore > match.awayScore) {
            gameState.championsLeague.wins++;
        }
    }

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
