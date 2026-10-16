# BlockRealm

A Minecraft-style voxel sandbox that runs in your web browser. Dig for gold, build anything, fight mobs, and take down dragons.

## How to play

Open `index.html` in a browser (Chrome, Edge, Firefox or Safari). Nothing to install.

To share it with friends, turn on GitHub Pages for this repository (Settings → Pages → deploy from the `main` branch). The game is then at `https://<your-name>.github.io/My-game/`.

### Controls (keyboard and mouse)

| Key | Action |
| --- | --- |
| W A S D / arrows | Move |
| Space | Jump (double-tap in Creative to fly) |
| Shift | Sprint (fly down while flying) |
| C | Sneak (won't walk off edges) |
| Left click | Mine blocks / attack mobs |
| Right click | Place blocks, eat food, shoot the bow, open crafting tables and furnaces |
| Middle click | Pick the block you're looking at |
| E | Inventory and crafting |
| 1–9 / mouse wheel | Choose hotbar slot |
| Q | Drop item |
| V or F5 | Change camera (first person, behind, front) |
| F | Toggle flying (Creative) |
| F3 or H | Show coordinates, biome and FPS |
| Esc | Pause menu |

### Touch controls (phones and tablets)

Left stick moves, drag on the screen to look around, **tap** to place or use, **hold** to dig. Buttons for jump, sneak/fly down, items, drop and menu.

## What's in it

- **Infinite world** with biomes: plains, forests, birch forests, taiga, snowy tundra, deserts, beaches, oceans and mountains. Caves, lava lakes deep down, and ore veins.
- **70 blocks**, including every ore: coal, iron, **gold**, diamond, redstone, lapis and emerald (emerald in mountains). Also gold, iron, diamond, emerald, lapis, coal, redstone and quartz blocks, TNT, glass, bricks, obsidian, glowstone, wool in 8 colours, flowers, mushrooms, cactus, pumpkins, melons and more.
- **Desert pyramids** with gold-capped tops and a treasure room of gold blocks and a diamond block. Watch out for the TNT hidden underneath.
- **Crafting** at a Crafting Table and **smelting** in a Furnace: planks, sticks, pickaxes and swords from wood to diamond (gold tools are the fastest), bow and arrows, flint and steel, TNT, golden apples, storage blocks, dyed wool and more.
- **Mobs**:
  - Friendly: pigs, cows, sheep, chickens
  - Hostile: zombies and skeletons (they burn in daylight), creepers (they explode), spiders, endermen (they teleport)
  - Hostile mobs come out at night and in dark caves.
- **Dragons**: the **Ender Dragon** arrives a minute into a new world. It circles the sky, shoots fireballs and swoops at you. Hit it with a sword when it swoops, or shoot it with a bow. Beat it to get a Dragon Egg, diamonds, emeralds and a lot of gold. Later a **Fire Dragon** or **Ice Dragon** turns up. Right-click a Dragon Egg, or use the pause menu, to summon one yourself.
- **Survival**: health, hunger, drowning, lava, fall damage, XP levels. When you die your items drop where you fell.
- **Creative**: every block and item, flying, no damage.
- Day and night cycle with sun, moon, stars and clouds. Falling sand and gravel, water that fills in holes, and sound effects.
- Your world **saves automatically** in the browser. Use "Continue saved world" on the title screen.

## Code layout

| File | What it does |
| --- | --- |
| `js/noise.js` | Random numbers and Perlin noise for terrain |
| `js/blocks.js` | All blocks, items, recipes and the pixel-art textures (drawn by code) |
| `js/world.js` | Chunks, terrain generation, meshing, raycasting and collisions |
| `js/entities.js` | Mobs, dragons, arrows/fireballs, dropped items, TNT, particles |
| `js/player.js` | Player movement, mining, building, combat and inventory |
| `js/ui.js` | HUD, inventory, crafting screens, menus and controls |
| `js/main.js` | Rendering, sky, sounds, spawning, explosions, saving and the game loop |
| `lib/three.min.js` | [three.js](https://threejs.org) r128 3D library (MIT licence) |

BlockRealm is a fan-made game inspired by Minecraft. It is not affiliated with Mojang or Microsoft.
