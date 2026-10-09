// Fast-forwards matches in headless Chromium and screenshots many game states.
const { chromium, devices } = require(process.env.PW || 'playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:8080/index.html';
  const out = process.argv[3] || '/tmp/shots';
  const only = process.argv[4];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + ' ' + e.stack));
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.tap('.title-screen');
  const ff = (sec, botPlayer) => page.evaluate(([sec, botPlayer]) => {
    const g = CUR.game;
    if (botPlayer && !g.player.bot) { g.player.bot = new Bot(g.player, 'allstar'); g.bots.push(g.player.bot); }
    for (let t = 0; t < sec; t += PHYS.TICK) { g.update(PHYS.TICK); if (g.state === 'replay' && botPlayer !== 'replay') g.finishReplay(); }
    processEvents(g);
    return { state: g.state, score: g.score, clock: g.clock };
  }, [sec, botPlayer]);
  const shots = [
    ['stadium', { kind: 'match', mode: 'soccar', teamSize: 3, level: 'allstar', map: 'stadium' }, 14],
    ['park', { kind: 'match', mode: 'soccar', teamSize: 2, level: 'pro', map: 'park' }, 9],
    ['neon', { kind: 'match', mode: 'soccar', teamSize: 3, level: 'pro', map: 'neon' }, 12],
    ['coliseum-snowday', { kind: 'match', mode: 'snowday', teamSize: 3, level: 'pro', map: 'coliseum' }, 10],
    ['shores-rumble', { kind: 'match', mode: 'rumble', teamSize: 3, level: 'pro', map: 'shores' }, 25],
    ['storm-heat', { kind: 'match', mode: 'heatseeker', teamSize: 2, level: 'pro', map: 'storm' }, 12],
    ['temple-hoops', { kind: 'match', mode: 'hoops', teamSize: 2, level: 'pro', map: 'temple' }, 10],
    ['aqua-dropshot', { kind: 'match', mode: 'dropshot', teamSize: 3, level: 'pro', map: 'aqua' }, 30],
  ];
  for (const [name, cfg, sec] of shots) {
    if (only && !name.includes(only)) continue;
    await page.evaluate((cfg) => startMatch(cfg), cfg);
    await page.waitForTimeout(300);
    const st = await ff(sec, true);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/m-${name}.png` });
    console.log(name, JSON.stringify(st));
  }
  if (!only) {
    // goal + replay + end screen
    await page.evaluate(() => startMatch({ kind: 'match', mode: 'soccar', teamSize: 1, level: 'rookie', map: 'stadium', mutators: { matchLength: 0 } }));
    await page.evaluate(() => { const g = CUR.game; g.state = 'play'; g.ball.reset(0, 300, ARENA.L - 400); g.ball.vel.set(0, 0, 2500); g.ball.lastTouch = { car: g.player, t: 0 }; g.ball.touches.push({ car: g.player, t: g.time }); g.player.loadout.explosion = 'classic'; });
    for (let i = 0; i < 6; i++) { await ff(0.05, false); await page.waitForTimeout(150); }
    await page.screenshot({ path: `${out}/g-goal.png` });
    await ff(2.7, 'replay'); await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/g-replay.png` });
    await page.evaluate(() => { const g = CUR.game; g.finishReplay(); g.score = [3, 1]; g.endMatch(); CUR.endT = 5; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/g-post.png` });
    await page.evaluate(() => quitToMenu()); await page.waitForTimeout(500);
    await page.tap('text=GARAGE'); await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/u-garage.png` });
    await page.evaluate(() => { Garage.close(); UI.show('settings'); }); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/u-settings.png` });
  }
  console.log(errors.slice(0, 20).join('\n') || 'no errors');
  await browser.close();
})();
