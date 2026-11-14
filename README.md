# BlockRealm

A Minecraft-style voxel sandbox that runs in your web browser. Dig for gold, build anything, fight mobs, and take down dragons.

## How to play

**Website (works for everyone, no account needed):**
https://raw.githack.com/khaldounalhakeem/My-game/blockrealm-game/index.html

This link only works while this repository is **public**. To make it public: on github.com open this repository, go to **Settings**, scroll to **Danger Zone**, choose **Change visibility**, then **Make public**.

You can also open `index.html` on your own computer, but multiplayer needs the website.

### Playing together online

Everyone opens the website, types the **same world seed** (for example `413`), and presses **Play this seed**. The game connects through three free public servers (broker.emqx.io, broker.hivemq.com and test.mosquitto.org), so nobody needs an account. The corner badge says "1 friend in your world" when it works. Everyone sees the same mobs, dragons and dropped items, and the same time of day. All players need the newest version of the game (reload the page). Anyone who knows your seed can join, so pick an unusual one if you only want your friends.

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

Just like Minecraft on a phone: **tap a block** to place a block there (or use it, like a crafting table or bed), **hold your finger on a block** to mine it (the camera keeps turning as your finger moves), **tap a mob** to hit it, and **drag** to look around. The left stick moves. Buttons for jump, sneak/fly down, items, drop and menu.

## Main menu

Your name is in the top left corner: tap it to change it. The menu has **Singleplayer** (a list of every world you have played, each with the name you gave it; tap one to play it, or **Create New World** to name a new one and pick its seed; typing a seed you already played opens that world instead of starting over), **Multiplayer** (type your friend's seed and join; whoever gets there first names the world), **Skins** (50 original skins to choose from, which your friends see too), **How to Play** and **About**.

**Difficulty**: on the Singleplayer and Multiplayer pages pick Peaceful (no monsters, never hungry for long, fast healing), Normal, Hard (more monsters that hit 1.5 times as hard, hunger drains faster) or Extreme (twice the monsters, twice the damage, and starving can kill you). You can change it any time in the pause menu under **Settings**, where there is also a **Keep Inventory** switch: when it is on, you keep your items and XP when you die.

## What's in it

- **Every seed is its own world**: a different starting place, different land height, more or fewer mountains, a hotter or colder climate and more or fewer trees.
- **Infinite world** with biomes: plains, forests, birch forests, taiga, snowy tundra, deserts, beaches, oceans and mountains. Caves, lava lakes deep down, and ore veins.
- **76 blocks**, including every ore: coal, iron, **gold**, diamond, redstone, lapis and emerald (emerald in mountains). Also gold, iron, diamond, emerald, lapis, coal, redstone and quartz blocks, TNT, glass, bricks, obsidian, glowstone, wool in 8 colours, flowers, mushrooms, cactus, pumpkins, melons and more.
- **Desert pyramids** (rare, like villages) with gold-capped tops and a treasure room of gold blocks and a diamond block. Watch out for the TNT hidden underneath.
- **Structures**, spaced out like in Minecraft (desert temples are hundreds of blocks apart, villages a bit closer, so you have to explore to find them), each with **treasure chests**. Tap or right-click a chest to open it and see the loot inside, then take what you want (shift-click or Take all). Chests remember what you leave in them and are shared in multiplayer (one player at a time can have a chest open, so nothing gets copied), and you can craft your own chest from 8 planks at a crafting table to store things. Breaking a chest spills what is inside. Each kind of structure has its own kind of treasure: villages have bread, wheat, apples, iron, emeralds and iron tools; desert temples have bones, gold, emeralds and sometimes diamonds; mineshafts have coal, redstone, lapis and bread; shipwrecks have lots of iron and emeralds; ruined portals have obsidian, flint and gold gear; dungeons and libraries have a mix of food, iron, gold and rare ender pearls and diamonds.
  - **Villages** in plains, forests, deserts, snowy plains and taiga: small houses, big two-floor houses, a blacksmith's forge with a lava pit, a toolsmith, a butcher, a stone temple and a library, plus a well, farms, a street grid, lamp posts and **villagers**. Each building's chest has its own loot like in Minecraft: houses have bread, apples and wheat, the blacksmith has iron, iron gear and sometimes a diamond.
  - **Dungeons** underground with a **monster spawner** that keeps spawning zombies, skeletons and spiders
  - **Mineshafts**: tunnel networks with wooden supports, and a spiral staircase down from the surface
  - **Igloos** in snowy plains, **ruined portals** (with spare obsidian to fix them), **shipwrecks** on the ocean floor, and rare underground **stronghold libraries** full of bookshelves
- **Smelting like Minecraft**: open a Furnace, put what you want to smelt in the top slot and fuel in the bottom slot, and take the result from the right. Each item takes 10 seconds and the furnace keeps working while you do other things. Coal burns long enough for 8 items, logs and planks 1.5, a stick half of one (a block of coal 80, a blaze rod 12). You get XP when you take the result out, and breaking a furnace spills what is inside.
- **Crafting** at a Crafting Table and **smelting** in a Furnace: planks, sticks, pickaxes, axes, shovels and swords from wood to diamond (gold tools are the fastest; axes chop wood fast and hit hard, shovels dig dirt, sand and gravel fast), bow and arrows, flint and steel, TNT, golden apples, storage blocks, dyed wool and more.
- **Mobs**:
  - Friendly: pigs, cows, sheep, chickens. Hold the food they love and they follow you (cows and sheep: wheat, chickens: wheat seeds, pigs: apples). Feed two of the same animal and they make a baby, which grows up after a few minutes (feeding a baby makes it grow faster). Each parent needs a 5-minute rest before having another baby.
  - **Wolves** (forests, taiga) and **horses** (plains) you can tame: give a wolf bones until hearts appear, and it follows you, fights monsters that attack you or that you attack, and sits when you tap it. Feed a horse apples or keep trying to ride it until it is tame, then tap it to ride (sneak to get off). Pets are saved with your world.
  - **Villagers** live in villages, guarded by an **Iron Golem** that fights monsters (and you, if you hit it). Kill one for 3-5 iron ingots. Build your own golem: a T of 4 iron blocks with a pumpkin on top.
  - Hostile: zombies and skeletons (they burn in daylight), creepers (they explode), spiders, endermen (they teleport)
  - Hostile mobs come out at night and in dark caves.
- **The Nether**: every new world has an empty obsidian portal frame near spawn. Light it with Flint and Steel (iron ingot + flint), stand inside, and you're in the Nether: lava seas, floating netherrack islands, glowstone, soul sand, quartz and gold ore, and nether-brick fortress bridges. You can also build your own frame: 4 wide by 5 tall, with a 2 by 3 empty middle. One block in the Nether equals 8 in the Overworld.
- **Nether mobs**: Zombified Piglins (they only fight back if you hit one), giant floating Ghasts, and in nether-brick fortresses Wither Skeletons and Blazes that shoot fireballs. Monsters don't appear right next to you, and you get a few calm seconds after coming through a portal.
- **Fire and Ice Dragons live in the Nether**: one shows up a while after you first visit, and you can summon one there from the pause menu or by right-clicking a Dragon Egg.
- **The End**: kill blazes in Nether fortresses for blaze rods and endermen for ender pearls. Craft blaze powder (1 rod = 2) and Eyes of Ender (blaze powder + ender pearl). Throw an Eye of Ender and it flies toward the nearest stronghold; when you are right above it, it sinks into the ground, so dig down. The stronghold has a portal frame of 12 blocks: put an eye in every one and the End portal opens. The End is an island of end stone over the void with obsidian pillars, guarded by the **Ender Dragon**. Beat it to open a portal home and win the Dragon Egg.
- **Multiplayer**: when the game is opened from its claude.ai link, everyone who has it open and picks the **same world seed** plays in the same world. Each friend must be signed in to claude.ai and invited to the game (Share, then add their email). The title screen shows who is online and which seed each person is on, plus a button to turn multiplayer on if claude.ai asks for permission. You see each other with name tags, see each other's building and digging, and can punch or sword-fight each other in Survival. A badge in the top corner shows whether multiplayer is connected. A yellow arrow above your XP bar points to the closest friend in your world, with their name and how many blocks away they are. Everyone sees **the same mobs, dragons and items**: the player who joined the world first runs every animal, monster and dragon, and the others see exactly the same ones in the same places. Anyone can fight them, and monsters chase whoever is closest. When somebody dies or a mob dies, the dropped items show up on every screen, and when one player picks something up it disappears for everybody. Only the first player in the world can tame wolves and horses. Only the last 60 block changes per player are shared with someone who joins later. The claude.ai version connects through two paths at once, the live room and the artifact's database, so two devices signed in to the same account always find each other. Opened as a plain file, the game is single-player.
- **Farming**: craft a **hoe** (2 planks, cobblestone, iron, gold or diamond + 2 sticks) and use it on grass or dirt to make farmland. Plant **wheat seeds** (from tall grass and ripe wheat) on farmland and they grow into wheat after a few minutes. 3 wheat make Bread, and 9 wheat make a Hay Bale.
- **Doors and trapdoors**: 6 planks make 3 Oak Doors or 2 Oak Trapdoors. Place a door on the floor (it needs two blocks of space and faces you); tap or right-click a door or trapdoor to open and close it.
- **Stairs and fences**: 6 planks, cobblestone or stone bricks make 4 stairs (they go up in the direction you are looking), and you walk up stairs (and other half-block steps) without jumping. 4 planks + 2 sticks make 3 Oak Fences, which join up with each other and with walls, and are too tall to jump over, so they keep animals in.
- **Saplings and ladders**: leaves sometimes drop saplings (oak, birch or spruce); plant one on grass or dirt and it grows into a tree after a few minutes if there is room above. 7 sticks make 3 ladders: put one on the side of a block and climb it by walking into it or holding jump (sneak to hold still).
- **Throwing from the inventory**: pick up items in the inventory and tap outside the inventory box to throw them (right-click throws one).
- **Grass spreads**: dirt next to grass, with nothing on top, turns into grass after about two minutes.
- **Buckets**: 3 iron ingots. Scoop up water or lava and pour it somewhere else, or use a bucket on a cow for milk (drinking milk puts out fire). A lava bucket is a great furnace fuel (100 items) and you get the bucket back.
- **Survival**: health, hunger (like Minecraft, food keeps you full for a while before the bar drops; sprinting, jumping while sprinting, fighting and healing make you hungry, standing and walking barely do), drowning (15 seconds of air, with a warning), lava, fall damage, XP levels. When you die the death screen tells you what happened, and your items drop where you fell. They stay there for 5 minutes of play (time only counts while you are near them), even if you respawn far away, die in the Nether, or close the game. Explosions (creepers, TNT, fireballs) hurt much less the further away you are, and a solid wall between you and the blast protects you.
- **Armor**: helmets, chestplates, leggings and boots in leather, gold, iron and diamond (crafting table: 5, 8, 7 and 4 of the material). Right-click a piece to wear it, or drop it in the armor slots in your inventory. Full diamond blocks 80% of damage from mobs, arrows, explosions, fire and lava (not falling, drowning or starving). You can see the armor you wear: on your arm in first person, on your whole body in the other camera views, and other players see it on you too.
- **Beds**: 3 wool + 3 planks. In multiplayer, night only ends once every player in the world is in bed. A bed is two blocks long and half a block tall, like in Minecraft; it points the way you are facing when you place it. Right-click a bed to set your respawn point there, and at night to sleep until morning. Beds explode in the Nether and the End.
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
| `js/skins.js` | The 50 player skins and how their faces and outfits are drawn |
| `js/entities.js` | Mobs, dragons, arrows/fireballs, dropped items, TNT, particles |
| `js/player.js` | Player movement, mining, building, combat and inventory |
| `js/ui.js` | HUD, inventory, crafting screens, menus and controls |
| `js/net.js` | Multiplayer: other players, shared block changes and PvP, over public MQTT servers (website) or the claude.ai room |
| `js/gamepad.js` | PS4 / game controller support |
| `js/main.js` | Rendering, sky, sounds, spawning, explosions, saving and the game loop |
| `lib/three.min.js` | [three.js](https://threejs.org) r128 3D library (MIT licence) |
| `lib/mqtt.min.js` | [MQTT.js](https://github.com/mqttjs/MQTT.js) 5.10.1 for online multiplayer (MIT licence) |

BlockRealm is a fan-made game inspired by Minecraft. It is not affiliated with Mojang or Microsoft.
