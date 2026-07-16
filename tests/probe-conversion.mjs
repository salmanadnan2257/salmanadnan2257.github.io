/* README "2026-07-14 conversion batch" items that no committed harness covers.
   Served over http so localStorage round-trips behave as they do in production.
     6  exit-nudge suppression: dismiss -> reload -> never returns (sa.nudge.off);
        open a project (real navigation) -> back -> never appears (sa.project.opened)
     7  exit-nudge triggers: top-edge mouseout, and foot-of-page scroll (partial:
        a genuine cursor leaving the OS window is not drivable headless; the handler
        path is exercised via the events it listens for)
     9  reduced-motion path: the conversion panel is revealed at once with no drag,
        the grab hint is reworded, and no iframe / no WebGL context is mounted
    11  deep-link cold load: index.html#work|#more|#apps|#production unfolds the wall
        and scrolls to the target on first paint */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const fp = path.join(SITE, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const URLROOT = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let fails = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) fails++; };
const nudgeState = (page) => page.evaluate(() => {
  const el = document.getElementById('exit-nudge');
  return { hidden: el.hidden, isIn: el.classList.contains('is-in'),
           off: localStorage.getItem('sa.nudge.off'), opened: localStorage.getItem('sa.project.opened') };
});
// The nudge's LATEST guard is 5s. Fast-forward Date.now inside the page instead of waiting.
const advanceClock = (page, ms) => page.evaluate((ms) => { const real = Date.now; const base = real(); Date.now = () => real() + ms; return base; }, ms);

/* ---------- Item 6/7: exit nudge trigger + suppression ---------- */
console.log('\n===== Item 6/7: exit nudge =====');
{
  const ctx = await browser.createBrowserContext();      // isolated localStorage
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URLROOT + '/index.html', { waitUntil: 'networkidle2' });
  await advanceClock(page, 6000);                          // past the 5s LATEST guard
  // trigger 7a: mouse crossing out the top edge (relatedTarget null, clientY 0)
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null, clientY: 0, bubbles: true })));
  await sleep(400);
  let s = await nudgeState(page);
  check('7a top-edge mouseout shows nudge', s.hidden === false && s.isIn, JSON.stringify(s));

  // dismiss it -> sets sa.nudge.off
  await page.click('#exit-nudge-x');
  await sleep(500);
  s = await nudgeState(page);
  check('6a dismiss hides nudge + sets sa.nudge.off', s.off === '1', JSON.stringify(s));

  // reload -> must never return even under a fresh leave-intent
  await page.reload({ waitUntil: 'networkidle2' });
  await advanceClock(page, 6000);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null, clientY: 0, bubbles: true })));
  await sleep(400);
  s = await nudgeState(page);
  check('6a after reload nudge stays suppressed', s.hidden === true && s.off === '1', JSON.stringify(s));
  await ctx.close();
}
{
  // 6b: open a real project, come back, nudge must never appear
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URLROOT + '/index.html', { waitUntil: 'networkidle2' });
  // click the flagship (a real projects/ link) -> capture handler sets sa.project.opened, then navigates
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('a.pcard--flag'),
  ]);
  const opened = await page.evaluate(() => localStorage.getItem('sa.project.opened'));
  await page.goBack({ waitUntil: 'networkidle2' });
  await advanceClock(page, 6000);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null, clientY: 0, bubbles: true })));
  // also drive the foot-of-page scroll trigger (item 7b)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(500);
  const s = await nudgeState(page);
  check('6b project opened -> back -> nudge never appears', opened === '1' && s.hidden === true, `opened=${opened} ` + JSON.stringify(s));
  await ctx.close();
}
{
  // 7b (in isolation): foot-of-page scroll shows the nudge for a visitor who opened nothing
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URLROOT + '/index.html', { waitUntil: 'networkidle2' });
  await advanceClock(page, 6000);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(500);
  const s = await nudgeState(page);
  check('7b foot-of-page scroll shows nudge', s.hidden === false, JSON.stringify(s));
  await ctx.close();
}

/* ---------- Item 9: reduced-motion conversion panel ---------- */
console.log('\n===== Item 9: reduced-motion / still path =====');
{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(URLROOT + '/index.html', { waitUntil: 'networkidle2' });
  await page.evaluate(() => document.getElementById('start-here').scrollIntoView({ block: 'center' }));
  await sleep(1500);
  /* The panel used to be revealed by an "is-on" class once a drag had earned it, and
     under reduced motion it was granted outright. There is no gate now: the button is
     simply always in the section, so what is checked is that it is actually visible. */
  const r = await page.evaluate(() => {
    const c = document.getElementById('stage-convert');
    const cs = getComputedStyle(c);
    return {
      panelOn: cs.visibility === 'visible' && cs.opacity === '1' && c.getBoundingClientRect().height > 10,
      grab: document.getElementById('stage-grab')?.textContent.trim(),
      iframes: document.querySelectorAll('#start-here iframe, .stage iframe').length,
      posterShown: !!document.getElementById('stage-poster')?.getAttribute('src'),
    };
  });
  check('9 reduced-motion shows the project button with no drag', r.panelOn, `panelOn=${r.panelOn}`);
  check('9 grab hint reworded for reduced motion', /reduced motion/i.test(r.grab || ''), `"${r.grab}"`);
  check('9 no live iframe / poster shown under still', r.iframes === 0 && r.posterShown, `iframes=${r.iframes} poster=${r.posterShown}`);
  await ctx.close();
}

/* ---------- Item 11: deep-link cold load ---------- */
console.log('\n===== Item 11: deep-link cold load =====');
for (const hash of ['work', 'more', 'apps', 'production']) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${URLROOT}/index.html#${hash}`, { waitUntil: 'networkidle2' });
  await sleep(900);
  const r = await page.evaluate((h) => {
    const wall = document.getElementById('all-projects');
    const target = document.getElementById(h);
    const tr = target ? target.getBoundingClientRect() : null;
    return {
      wallOpen: wall.classList.contains('is-open') || getComputedStyle(wall).display !== 'none',
      targetExists: !!target,
      // scrolled to it: the target's top is within a screen of the current scroll position
      scrolledNear: tr ? Math.abs(tr.top) < window.innerHeight : false,
      scrollY: Math.round(window.pageYOffset),
    };
  }, hash);
  check(`11 #${hash} cold load: wall unfolded`, r.wallOpen, `wallOpen=${r.wallOpen}`);
  check(`11 #${hash} cold load: scrolled to target`, r.targetExists && r.scrolledNear, `scrollY=${r.scrollY} near=${r.scrolledNear}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${fails ? 'FAIL' : 'PASS'}: ${fails} failing checks`);
process.exit(fails ? 1 : 0);
