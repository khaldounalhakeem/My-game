# BlockRealm

A Minecraft-style voxel sandbox that runs in your web browser. Dig for gold, build anything, fight mobs, and take down dragons.

## How to play

**Website (works for everyone, no account needed):**
https://raw.githack.com/khaldounalhakeem/My-game/blockrealm-game/index.html

This link only works while this repository is **public**. To make it public: on github.com open this repository, go to **Settings**, scroll to **Danger Zone**, choose **Change visibility**, then **Make public**.

You can also open `index.html` on your own computer, but multiplayer needs the website.

### Playing together online

Everyone opens the website, types the **same world seed** (for example `413`), and presses **Play this seed**. The game connects through three free public servers (broker.emqx.io, broker.hivemq.com and test.mosquitto.org), so nobody needs an account. The corner badge says "1 friend in your world" when it works. Anyone who knows your seed can join, so pick an unusual one if you only want your friends.

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

### PS4 controller (works on iPad, phones and computers)

Pair the controller by Bluetooth, open the game, and press any button. The layout matches Minecraft on PlayStation:

| Button | Action |
| --- | --- |
| Left stick / right stick | Move / look |
| R2 | Mine / attack |
| L2 | Place / use / eat |
| Cross (X) | Jump (double-tap in Creative to fly) |
| Circle | Drop item |
| Triangle or Square | Inventory and crafting |
| L1 / R1 (or D-pad left/right) | Hotbar |
| L3 (press left stick) | Sprint |
| R3 (press right stick) or D-pad down | Sneak (fly down while flying) |
| D-pad up | Change camera |
| OPTIONS | Pause |

In menus, the left stick moves a pointer. Cross clicks, Square quick-moves a stack, Circle goes back, and the right stick scrolls.

### Touch controls (phones and tablets)

Left stick moves, drag on the screen to look around, **tap** to place or use, **hold** to dig. Buttons for jump, sneak/fly down, items, drop and menu.

## What's in it

- **Infinite world** with biomes: plains, forests, birch forests, taiga, snowy tundra, deserts, beaches, oceans and mountains. Caves, lava lakes deep down, and ore veins.
- **76 blocks**, including every ore: coal, iron, **gold**, diamond, redstone, lapis and emerald (emerald in mountains). Also gold, iron, diamond, emerald, lapis, coal, redstone and quartz blocks, TNT, glass, bricks, obsidian, glowstone, wool in 8 colours, flowers, mushrooms, cactus, pumpkins, melons and more.
- **Desert pyramids** with gold-capped tops and a treasure room of gold blocks and a diamond block. Watch out for the TNT hidden underneath.
- **Crafting** at a Crafting Table and **smelting** in a Furnace: planks, sticks, pickaxes, axes, shovels and swords from wood to diamond (gold tools are the fastest; axes chop wood fast and hit hard, shovels dig dirt, sand and gravel fast), bow and arrows, flint and steel, TNT, golden apples, storage blocks, dyed wool and more.
- **Mobs**:
  - Friendly: pigs, cows, sheep, chickens
  - Hostile: zombies and skeletons (they burn in daylight), creepers (they explode), spiders, endermen (they teleport)
  - Hostile mobs come out at night and in dark caves.
- **The Nether**: every new world has an empty obsidian portal frame near spawn. Light it with Flint and Steel (iron ingot + flint), stand inside, and you're in the Nether: lava seas, floating netherrack islands, glowstone, soul sand, quartz and gold ore, and nether-brick fortress bridges. You can also build your own frame: 4 wide by 5 tall, with a 2 by 3 empty middle. One block in the Nether equals 8 in the Overworld.
- **Nether mobs**: Zombified Piglins (they only fight back if you hit one), Wither Skeletons, Blazes that shoot fireballs, and giant floating Ghasts.
- **Dragons live in the Nether**: the **Ender Dragon** shows up soon after your first visit. It circles under the Nether roof, shoots fireballs and swoops at you. Hit it with a sword when it swoops, or shoot it with a bow. Beat it to get a Dragon Egg, diamonds, emeralds and a lot of gold. Later a **Fire Dragon** or **Ice Dragon** turns up. You can only summon dragons in the Nether, from the pause menu or by right-clicking a Dragon Egg.
- **Multiplayer**: when the game is opened from its claude.ai link, everyone who has it open and picks the **same world seed** plays in the same world. Each friend must be signed in to claude.ai and invited to the game (Share, then add their email). The title screen shows who is online and which seed each person is on, plus a button to turn multiplayer on if claude.ai asks for permission. You see each other with name tags, see each other's building and digging, and can punch or sword-fight each other in Survival. A badge in the top corner shows whether multiplayer is connected. Each player has their own mobs and dragons, and only the last 60 block changes per player are shared with someone who joins later. Opened as a plain file or on GitHub Pages, the game is single-player.
- **Survival**: health, hunger, drowning, lava, fall damage, XP levels. When you die your items drop where you fell.
- **Armor**: helmets, chestplates, leggings and boots in leather, gold, iron and diamond (crafting table: 5, 8, 7 and 4 of the material). Right-click a piece to wear it, or drop it in the armor slots in your inventory. Full diamond blocks 80% of mob and explosion damage.
- **Beds**: 3 wool + 3 planks. Right-click a bed to set your respawn point there, and at night to sleep until morning. Don't sleep in the Nether.
- **Flint**: break gravel (35% chance). Gravel lies in grey patches on grassy land, on beaches and riverbeds, and in caves. Flint and Steel = 1 iron ingot + 1 flint.
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
| `js/net.js` | Multiplayer: other players, shared block changes and PvP, over public MQTT servers (website) or the claude.ai room |
| `js/gamepad.js` | PS4 / game controller support |
| `js/main.js` | Rendering, sky, sounds, spawning, explosions, saving and the game loop |
| `lib/three.min.js` | [three.js](https://threejs.org) r128 3D library (MIT licence) |
| `lib/mqtt.min.js` | [MQTT.js](https://github.com/mqttjs/MQTT.js) 5.10.1 for online multiplayer (MIT licence) |

BlockRealm is a fan-made game inspired by Minecraft. It is not affiliated with Mojang or Microsoft.
