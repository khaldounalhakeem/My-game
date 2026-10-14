'use strict';
// ============================================================================
// Content: maps, garage items, quick chat, bot names, playlists
// ============================================================================

const MAPS = {
  stadium: { name: 'Lumen Stadium', sub: 'Day', sky: [0x5fa8ff, 0xcfe6ff], sun: 0xffffff, sunI: 1.15, amb: 0.7, fog: 0xbfdcff, grass: ['#2f8a3a', '#2a7d34'], lines: '#ffffff', scenery: 'stadium', time: 'day' },
  park: { name: 'Greenfield Park', sub: 'Sunset', sky: [0xff8a5c, 0xffd59a], sun: 0xffc48a, sunI: 1.0, amb: 0.65, fog: 0xffc9a0, grass: ['#3a8f30', '#337f2a'], lines: '#fff6e0', scenery: 'park', time: 'sunset' },
  coliseum: { name: 'Frostpeak Coliseum', sub: 'Snowy', sky: [0x9fb7cf, 0xe8f0f8], sun: 0xf0f6ff, sunI: 0.95, amb: 0.85, fog: 0xdfe8f2, grass: ['#dfe9ef', '#d2dee6'], lines: '#5b7fa8', scenery: 'snow', time: 'day', weather: 'snow' },
  neon: { name: 'Neon District', sub: 'Night', sky: [0x05030f, 0x2a0f48], sun: 0xa0b8ff, sunI: 0.55, amb: 0.55, fog: 0x1a0b30, grass: ['#1d2b3a', '#18242f'], lines: '#5cf2ff', scenery: 'city', time: 'night' },
  shores: { name: 'Salt Shores', sub: 'Beach', sky: [0x3db4ff, 0xbdeeff], sun: 0xfff3d6, sunI: 1.2, amb: 0.75, fog: 0xbfeaff, grass: ['#3fa04a', '#379142'], lines: '#ffffff', scenery: 'beach', time: 'day' },
  storm: { name: 'Thornwick Park', sub: 'Stormy', sky: [0x2c333d, 0x6b7480], sun: 0xc8d2e0, sunI: 0.55, amb: 0.75, fog: 0x59616c, grass: ['#2c6b34', '#27602e'], lines: '#e8eef5', scenery: 'park', time: 'storm', weather: 'rain' },
  temple: { name: 'Jade Temple', sub: 'Dusk', sky: [0x2b3b6b, 0xf0a868], sun: 0xffb070, sunI: 0.9, amb: 0.65, fog: 0x8a6a7a, grass: ['#3a7a3c', '#336c35'], lines: '#ffe9b0', scenery: 'temple', time: 'sunset' },
  aqua: { name: 'Abyss Dome', sub: 'Underwater', sky: [0x02314a, 0x0d7aa0], sun: 0x9fe8ff, sunI: 0.7, amb: 0.8, fog: 0x0a5876, grass: ['#1f6f6a', '#1a625d'], lines: '#a0fff0', scenery: 'aqua', time: 'night', weather: 'bubbles' },
};

const MODES = {
  soccar: { name: 'Soccar', desc: 'Classic 3-on-3 car soccer. Score in the opponent\'s goal.', arena: 'soccar', ball: 'ball' },
  hoops: { name: 'Hoops', desc: 'Dunk the ball through the elevated hoop.', arena: 'hoops', ball: 'basketball' },
  snowday: { name: 'Snow Day', desc: 'Hockey on ice — slide a puck into the net.', arena: 'soccar', ball: 'puck', mapOverride: 'coliseum' },
  rumble: { name: 'Rumble', desc: 'Random power-ups every 10 seconds. Chaos guaranteed.', arena: 'soccar', ball: 'ball' },
  heatseeker: { name: 'Heatseeker', desc: 'The ball homes in on goals and speeds up every touch.', arena: 'soccar', ball: 'ball' },
  dropshot: { name: 'Dropshot', desc: 'Charge the ball and break the floor tiles to drop it through.', arena: 'dropshot', ball: 'dropshot' },
};

const PAINTS = [
  { name: 'Team', hex: null }, { name: 'Crimson', hex: 0xd0202a }, { name: 'Lime', hex: 0x7fe02a }, { name: 'Purple', hex: 0x8a3cff },
  { name: 'Black', hex: 0x1b1d22 }, { name: 'Titanium White', hex: 0xf4f4f0 }, { name: 'Cobalt', hex: 0x2948d6 }, { name: 'Sky Blue', hex: 0x5cc8ff },
  { name: 'Saffron', hex: 0xf2c814 }, { name: 'Forest Green', hex: 0x1f7a3c }, { name: 'Pink', hex: 0xff5fb6 }, { name: 'Burnt Sienna', hex: 0x9a4a1e },
];
const ACCENTS = [0xeeeeee, 0x111111, 0xf2c814, 0x00e0ff, 0xff2bd0, 0x7fe02a, 0xff3030, 0x9a5cff];

const ITEMS = {
  body: { octane: 'Octane', dominus: 'Dominus', fennec: 'Fennec', striker: 'Striker', phantom: 'Phantom', blade: 'Blade', wedge: 'Wedge', hybrid: 'Hybrid X', tank: 'Bulwark' },
  decal: { none: 'None', stripes: 'Racing Stripes', flames: 'Flames', tiger: 'Tiger', checker: 'Checkered', lightning: 'Lightning', dots: 'Polka', camo: 'Camo' },
  wheels: { classic: 'Classic', spinner: 'Spinners', neon: 'Neon Rims', gold: 'Gold Rush', offroad: 'Offroad', star: 'Star Hubs' },
  boost: { standard: 'Standard', flames: 'Hellfire', neon: 'Neon', rainbow: 'Rainbow', bubbles: 'Bubbles', ion: 'Ion Sparks', smoke: 'Smokestack', hearts: 'Lovestruck' },
  explosion: { classic: 'Classic', fireworks: 'Fireworks', confetti: 'Confetti', lightning: 'Thunderstrike', shockwave: 'Shockwave', supernova: 'Supernova' },
  topper: { none: 'None', cap: 'Ball Cap', crown: 'Royal Crown', halo: 'Halo', propeller: 'Propeller', cone: 'Traffic Cone', horns: 'Devil Horns' },
  antenna: { none: 'None', flag: 'Team Flag', ball: 'Mini Ball', star: 'Gold Star', heart: 'Heart', bolt: 'Bolt' },
};
const RARITY = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Import', 'Exotic', 'Black Market'];
const RARITY_COLORS = ['#c8c8c8', '#9fe06a', '#6aa8ff', '#b27dff', '#ff5a5a', '#ffd54a', '#ff3db8'];

const QUICKCHAT = {
  Information: ['I got it!', 'Need boost!', 'Take the shot!', 'Defending...', 'Go for it!', 'Centering!', 'All yours.', 'In position.', 'Incoming!', 'Faking.', 'Bumping!', 'On your left.', 'On your right.', 'Passing!', 'Rotating back.'],
  Compliments: ['Nice shot!', 'Great pass!', 'Thanks!', 'What a save!', 'Nice one!', 'What a play!', 'Great clear!', 'Nice block!', 'Nice bump!', 'Nice demo!'],
  Reactions: ['OMG!', 'Noooo!', 'Wow!', 'Close one!', 'No way!', 'Holy cow!', 'Whew.', 'Siiiick!', 'Calculated.', 'Savage!', 'Okay.'],
  Apologies: ['$#@%!', 'No problem.', 'Whoops...', 'Sorry!', 'My bad...', 'Oops!', 'My fault.'],
  PostGame: ['gg', 'Well played.', 'That was fun!', 'Rematch!', 'One. More. Game.', 'What a game!', 'Nice moves!', 'Everybody dance!'],
};

// Player names by rank, so lobbies look like real servers (made-up gamertags, not real people)
const PLAYER_NAMES = [
  // Bronze / Silver
  ['Twang Jones', 'Tom Joe', 'carguy2009', 'xX_Dylan_Xx', 'MrPotato77', 'noob4life', 'SockLord', 'Blaze Gamer', 'goalie_jen', 'BigTruckBob',
    'sweatyteddy', 'PizzaCat', 'turbo_tim', 'lilmax08', 'Dad Gamer', 'jjmoney', 'toaster pro', 'NotAScrub', 'grandma_rl', 'ChickenNugget', 'Kevin2011', 'whiffmaster'],
  // Gold / Platinum
  ['Mocha', 'DriftKing', 'Ozzy', 'kev.', 'SlimShot', 'Rook', 'Pixel', 'Breezy', 'Jaxx', 'Nova Kid', 'frosty', 'Tango', 'Dukes', 'Ricochet',
    'bananas', 'Hex', 'Slate', 'Wavey', 'Cobalt', 'Spud', 'Marbles', 'Sizzle'],
  // Diamond / Champion
  ['Senju', 'Ravyn', 'Zephr', 'Talon', 'Kito', 'Vanta', 'Orbit', 'Crux', 'Lumen', 'Sable', 'Drako', 'Quill', 'Halcyon', 'Juno', 'Pyre',
    'Rune', 'Echo7', 'Flux', 'Mirage', 'Tidal', 'Aster', 'Kestrel'],
  // Grand Champion / Supersonic Legend
  ['Vexx', 'Nyx', 'Kairo', 'Rhyno', 'Saelo', 'Aeon', 'Zyre', 'Kaelix', 'Voidd', 'Solace', 'Nero', 'Azure', 'Kyro', 'Lyric', 'Exo', 'Vyn',
    'Onyx', 'Hyperion', 'Zenith', 'Wraith', 'Seraph', 'Ixion'],
];
// which name pool fits a bot: by its rating, or by a fixed difficulty
function namePoolFor(rating, level) {
  if (rating != null) return rating < 520 ? 0 : rating < 960 ? 1 : rating < 1420 ? 2 : 3;
  return level === 'rookie' ? 0 : level === 'pro' ? 1 : 3;
}
function pickPlayerName(pool, used) {
  const list = PLAYER_NAMES[pool] || PLAYER_NAMES[1];
  let n, k = 0;
  do { n = pick(list); k++; } while (used.has(n) && k < 60);
  used.add(n);
  return n;
}
const BOT_NAMES = ['Armstrong', 'Bandit', 'Beast', 'Boomer', 'Buzz', 'Casper', 'Caveman', 'C-Block', 'Centice', 'Chipper', 'Cougar', 'Dude',
  'Foamer', 'Fury', 'Gerwin', 'Goose', 'Heater', 'Hollywood', 'Hound', 'Iceman', 'Imp', 'Jester', 'Junker', 'Khan', 'Marley', 'Maverick',
  'Merlin', 'Middy', 'Mountain', 'Myrtle', 'Outlaw', 'Poncho', 'Rainmaker', 'Raja', 'Rex', 'Roundhouse', 'Sabretooth', 'Saltie', 'Samara',
  'Scout', 'Shepard', 'Slider', 'Squall', 'Sticks', 'Stinger', 'Storm', 'Sultan', 'Sundown', 'Swabbie', 'Tex', 'Tusk', 'Viper', 'Wolfman', 'Yuri'];

const BOT_LEVELS = {
  rookie: { name: 'Rookie', react: 0.3, skill: 0.45, aerial: 0.15, maxBoost: 0.5, flip: 0.45, aim: 0.6, assist: 0.1, aggro: 0, pass: 0, mech: 0 },
  pro: { name: 'Pro', react: 0.1, skill: 0.85, aerial: 0.75, maxBoost: 1, flip: 0.95, aim: 0.93, assist: 0.32, aggro: 0, pass: 0.4, mech: 0.4 },
  allstar: { name: 'All-Star', react: 0.035, skill: 1, aerial: 1.1, maxBoost: 1, flip: 1, aim: 1, assist: 0.35, aggro: 1, pass: 0.8, mech: 0.85 },
};

const TRAINING_PACKS = {
  striker: { name: 'Striker', desc: 'Put rolling and bouncing balls into the net.', count: 8 },
  goalie: { name: 'Goalie', desc: 'Shots fly at your goal. Stop them.', count: 8 },
  aerial: { name: 'Aerial', desc: 'Take to the sky and score off high balls.', count: 8 },
};

// How bots answer quick chat. who: hero (the player being complimented), team, opp, others
const CHAT_REPLIES = {
  'Nice shot!': { who: 'hero', r: ['Thanks!', 'Thanks!', 'Calculated.', 'Thanks!'] },
  'What a play!': { who: 'hero', r: ['Thanks!', 'Calculated.', 'Siiiick!'] },
  'Nice one!': { who: 'hero', r: ['Thanks!', 'Thanks!'] },
  'Great pass!': { who: 'hero', r: ['Thanks!', 'No problem.', 'Nice shot!'] },
  'What a save!': { who: 'hero', r: ['Thanks!', 'Thanks!', 'Whew.'] },
  'Great clear!': { who: 'hero', r: ['Thanks!', 'No problem.'] },
  'Nice block!': { who: 'hero', r: ['Thanks!', 'Whew.'] },
  'Nice bump!': { who: 'hero', r: ['Thanks!', 'Bumping!'] },
  'Nice demo!': { who: 'hero', r: ['Thanks!', 'Savage!'] },
  'Thanks!': { who: 'team', r: ['No problem.', 'No problem.', 'Okay.'] },
  'Sorry!': { who: 'team', r: ['No problem.', 'No problem.', 'Okay.', 'No problem.'] },
  'My bad...': { who: 'team', r: ['No problem.', 'Okay.'] },
  'My fault.': { who: 'team', r: ['No problem.', 'Okay.'] },
  'Whoops...': { who: 'team', r: ['No problem.', 'Close one!'] },
  'Oops!': { who: 'team', r: ['No problem.', 'Okay.'] },
  '$#@%!': { who: 'team', r: ['No problem.', 'Close one!', 'Okay.'], opp: ['Calculated.', 'Okay.'] },
  'I got it!': { who: 'team', r: ['All yours.', 'Okay.', 'In position.'] },
  'Need boost!': { who: 'team', r: ['Okay.', 'Defending...'] },
  'Take the shot!': { who: 'team', r: ['Okay.', 'I got it!'] },
  'Defending...': { who: 'team', r: ['Okay.', 'Go for it!'] },
  'Go for it!': { who: 'team', r: ['I got it!', 'Okay.'] },
  'Centering!': { who: 'team', r: ['In position.', 'Take the shot!'] },
  'All yours.': { who: 'team', r: ['I got it!', 'Okay.'] },
  'In position.': { who: 'team', r: ['Centering!', 'Okay.'] },
  'Incoming!': { who: 'team', r: ['Defending...', 'Okay.'] },
  'Passing!': { who: 'team', r: ['In position.', 'Okay.'] },
  'Rotating back.': { who: 'team', r: ['Okay.', 'Go for it!'] },
  'Bumping!': { who: 'team', r: ['Okay.', 'Go for it!'] },
  'On your left.': { who: 'team', r: ['Okay.', 'Passing!'] },
  'On your right.': { who: 'team', r: ['Okay.', 'Passing!'] },
  'Faking.': { who: 'team', r: ['Okay.'] },
  'OMG!': { who: 'others', r: ['Wow!', 'What a play!', 'Close one!'], chance: 0.6 },
  'Wow!': { who: 'others', r: ['What a play!', 'OMG!', 'Wow!'], chance: 0.5 },
  'Holy cow!': { who: 'others', r: ['Wow!', 'OMG!'], chance: 0.5 },
  'No way!': { who: 'others', r: ['Calculated.', 'Wow!', 'Close one!'], chance: 0.5 },
  'Siiiick!': { who: 'others', r: ['What a play!', 'Wow!'], chance: 0.5 },
  'Noooo!': { who: 'team', r: ['Close one!', 'No problem.', 'Whew.'] },
  'Close one!': { who: 'others', r: ['Whew.', 'Close one!'], chance: 0.6 },
  'Calculated.': { who: 'opp', r: ['Savage!', 'Okay.', 'Wow!'], chance: 0.6 },
  'Savage!': { who: 'opp', r: ['Calculated.', 'Okay.'], chance: 0.5 },
  'Okay.': { who: 'none' }, 'No problem.': { who: 'none' }, 'Whew.': { who: 'none' },
};
const POSTGAME_REPLIES = ['gg', 'gg', 'Well played.', 'That was fun!', 'What a game!', 'Nice moves!', 'Rematch!'];
