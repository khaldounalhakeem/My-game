// Drives the game in headless Chromium at iPad resolution and saves screenshots.
const { chromium, devices } = require(process.env.PW || 'playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:8080/index.html';
  const out = process.argv[3] || '/tmp/shots';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '/1-title.png' });
  await page.tap('.title-screen');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '/2-main.png' });
  await page.tap('text=PLAY');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out + '/3-play.png' });
  await page.tap('text=START MATCH');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out + '/4-countdown.png' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: out + '/5-game.png' });
  // hold boost via keyboard for a while
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/6-boost.png' });
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log('fps (swiftshader):', fps);
  console.log(errors.slice(0, 30).join('\n') || 'no console errors');
  await browser.close();
})();
