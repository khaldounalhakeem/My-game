# 🚀 ROCKET LEAGUE

A fully functional Rocket League clone built with JavaScript, Canvas API, and realistic physics simulation.

## Quick Start

### Option 1: Standalone (Easiest)
Simply open `rocket-league-standalone.html` in your browser - everything is in one file!

### Option 2: Modular Setup
Open `index.html` in a web server. Requires all files:
- `index.html` - Main game UI
- `game.js` - Game logic and rendering
- `physics.js` - Physics engine with collision detection
- `ai.js` - AI controllers for opponents

## Controls

| Key | Action |
|-----|--------|
| **Arrow Keys** or **WASD** | Move and rotate car |
| **Space** | Jump |
| **Shift** | Boost (recharges over time) |
| **P** | Pause/Resume |

## Game Modes

### Start Game
Play a 5-minute match against 2 AI opponents. First to score the most goals wins!

### Training Mode
Practice without time limits or opponents. Perfect for learning controls.

## Features

### Physics Engine
- **Realistic ball physics** with gravity, friction, and bouncing
- **Car dynamics** with acceleration, rotation, and momentum
- **Collision detection** between ball-walls, ball-cars, and car-cars
- **Multiple physics iterations** per frame for accurate simulation

### AI System
- **Intelligent opponent behavior**:
  - Chase and intercept the ball
  - Attempt shots at goal
  - Patrol defensive positions
  - Strategic boost usage
- **Decision-making** based on ball position and game state

### Game Features
- **Score tracking** for both teams (Blue vs Orange)
- **5-minute countdown timer**
- **Goal detection** with automatic field reset
- **Boost system** with limited fuel and automatic recharge
- **Jump mechanics** with cooldown
- **Real-time stats display** (Speed, Boost %, Position)

### Visual Polish
- **Dual-team arena** with blue and orange zones
- **Smooth 60 FPS gameplay**
- **Professional UI** with menus and overlays
- **Boost indicator bar** above each car
- **Center field line** for field reference
- **Game over screen** with winner announcement

## Game Rules

1. **Objective**: Score goals by hitting the ball into the opponent's goal zone
2. **Time Limit**: 5 minutes per match
3. **Scoring**: Each goal is worth 1 point
4. **Winner**: Team with most goals when time expires
5. **Field Reset**: After each goal, all cars and ball return to starting positions

## Car Mechanics

### Movement
- Forward/backward acceleration
- Smooth rotation
- Velocity-based momentum
- Maximum speed limits

### Jumping
- Single jump per ground contact
- Mid-air orientation possible
- Useful for reaching aerial balls

### Boost
- 100-unit boost capacity
- 1.5x speed multiplier when active
- Automatic recharge when not in use
- Depletes 2 units per frame while boosting

## Ball Physics

- **Gravity**: Realistic downward acceleration
- **Friction**: Energy loss over time
- **Restitution**: Bouncing energy retention
- **Collision Response**: Impulse-based collision with conservation of momentum

## Technical Details

### Architecture
- **Modular JavaScript**: Separate files for physics, game logic, and AI
- **Canvas 2D Rendering**: Efficient frame-by-frame drawing
- **Vector Math**: 2D vector class for all physics calculations
- **Physics Loop**: Multiple iterations per frame for stability

### Performance
- 60 FPS target frame rate
- 4 physics iterations per render frame
- Efficient collision detection
- Optimized drawing order

## Compatibility

Works on all modern browsers with:
- ES6 JavaScript support
- HTML5 Canvas 2D context
- RequestAnimationFrame support

Tested on:
- Chrome/Chromium
- Firefox
- Safari
- Edge

## File Structure

```
My-game/
├── index.html                    # Main game with linked files
├── game.js                       # Game logic and rendering
├── physics.js                    # Physics engine
├── ai.js                         # AI controllers
├── rocket-league-standalone.html # All-in-one version
└── README.md                     # This file
```

## Tips for Playing

1. **Use boost wisely** - It's limited, plan your shots
2. **Jump early** - Anticipate where the ball will be
3. **Rotate before moving** - Align your car with your target
4. **Defend the goal** - AI opponents are aggressive
5. **Chain movements** - Smooth movement flows are most efficient

## Future Enhancements

Possible additions:
- Multiplayer (local 2-player or online)
- More game modes (3v3, 2v2, 1v1)
- Power-ups and special abilities
- Custom arenas
- Replays and highlights
- Sound effects
- Advanced graphics with lighting
- Mobile touch controls

---

**Made with ❤️ using JavaScript Canvas**