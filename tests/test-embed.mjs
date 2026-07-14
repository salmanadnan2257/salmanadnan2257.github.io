/* The embedded contract, tested on real project pages.
   1. Before the visitor grabs the piece, a wheel over it must still scroll the
      HOST page. A viz that eats the scroll wheel is a trap on a portfolio page.
   2. Touch: vertical swipe must still scroll the host page (touch-action pan-y).
   3. A drag inside the iframe must engage the view (Reset appears, hint fades).
   4. Once engaged, the wheel belongs to the piece and the page stays put. */
import puppeteer from 'puppeteer-core';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const PAGES = ['raft-kv', 'space-race-analysis', 'trade-intelligence-copilot', 'urdu-slm'];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader'],
});

let failures = 0;

for (const name of PAGES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const bad = [];
  try {
    await page.goto(`file://${SITE}/projects/${name}.html`, { waitUntil: 'networkidle2' });

    // bring the lazy iframe into view and let the scene start
    await page.$eval('.proj-viz iframe', (el) => el.scrollIntoView({ block: 'center' }));
    await new Promise((r) => setTimeout(r, 3000));

    const frame = page.frames().find((f) => f.url().includes(`/viz/${name}.html`));
    if (!frame) throw new Error('viz iframe never loaded');
    await frame.waitForSelector('#c', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1500));

    // where the iframe sits on the host page
    const box = await (await page.$('.proj-viz iframe')).boundingBox();
    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);

    // 2. touch behaviour while embedded
    const touchAction = await frame.$eval('#c', (el) => getComputedStyle(el).touchAction);
    if (touchAction !== 'pan-y') bad.push(`touch-action is ${touchAction}, expected pan-y`);

    // 1. wheel over the piece, before engaging, must scroll the host page
    await page.mouse.move(cx, cy);
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel({ deltaY: 300 });
    await new Promise((r) => setTimeout(r, 500));
    const y1 = await page.evaluate(() => window.scrollY);
    if (!(y1 > y0 + 50)) bad.push(`wheel hijacked before engaging (scrollY ${y0} -> ${y1})`);

    // re-centre the piece after that scroll
    await page.$eval('.proj-viz iframe', (el) => el.scrollIntoView({ block: 'center' }));
    await new Promise((r) => setTimeout(r, 600));
    const box2 = await (await page.$('.proj-viz iframe')).boundingBox();
    const dx = Math.round(box2.x + box2.width / 2);
    const dy = Math.round(box2.y + box2.height / 2);

    const resetBefore = await frame.$eval('#btnReset', (el) => el.hidden);
    if (resetBefore !== true) bad.push('reset button showing before any interaction');

    // 3. drag inside the iframe
    await page.mouse.move(dx, dy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(dx + i * 16, dy + i * 4);
      await new Promise((r) => setTimeout(r, 16));
    }
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 800));

    const engaged = await frame.$eval('#btnReset', (el) => !el.hidden);
    const hintGone = await frame.$eval('#hint', (el) => el.classList.contains('is-gone'));
    if (!engaged) bad.push('drag inside the iframe did not engage the view');
    if (!hintGone) bad.push('hint did not fade after the drag');

    // 4. now the wheel belongs to the piece
    const y2 = await page.evaluate(() => window.scrollY);
    await page.mouse.move(dx, dy);
    await page.mouse.wheel({ deltaY: 300 });
    await new Promise((r) => setTimeout(r, 500));
    const y3 = await page.evaluate(() => window.scrollY);
    if (Math.abs(y3 - y2) > 8) bad.push(`page still scrolled after engaging (${y2} -> ${y3})`);
  } catch (e) {
    bad.push('FATAL ' + e.message);
  }

  if (errs.length) bad.push(errs.length + ' js errors: ' + errs[0].slice(0, 90));
  await page.close();
  if (bad.length) failures++;
  console.log((bad.length ? 'FAIL ' : 'ok   ') + name.padEnd(30) + (bad.length ? bad.join('; ') : 'scroll safe, drag engages, wheel then owned'));
}

await browser.close();
console.log('\n' + (PAGES.length - failures) + '/' + PAGES.length + ' embedded pages passed');
process.exit(failures ? 1 : 0);
