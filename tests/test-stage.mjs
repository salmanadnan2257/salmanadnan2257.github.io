/* The new homepage "Start here" 3D stage, on its own terms.
   S1  exactly one WebGL context is ever live, including under rapid rail switching
   S2  a VERTICAL touch swipe starting on the stage still scrolls the page (no trap)
   S3  a HORIZONTAL drag engages the view (the thing really is draggable)
   S4  prefers-reduced-motion: no iframe, no WebGL, the still and the rail still work
   S5  the context is handed back when the stage is scrolled well away, and taken again
   S6  no layout shift when the 3D replaces the still (the box is reserved)
   S7  the rail is real keyboard-operable buttons, and the CTA always points at the
       project whose system is loaded
*/
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const OUT = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/tests/out';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const fp = path.join(SITE, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { s.writeHead(404); return s.end('nf'); }
  s.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(s);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bad = [];
const say = (s) => console.log(s);

async function touchSwipe(cdp, x, y, dx, dy, steps = 16, stepMs = 16) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  await sleep(stepMs);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/* Counts truly LIVE WebGL contexts across every frame, from inside those frames.
   The earlier version counted getContext('webgl') CALLS and never decremented, so it
   double-counted the homepage's webglOK() capability probe: that probe makes a canvas,
   calls getContext to test support, and throws the canvas away without ever adding it
   to the DOM. Here we keep a reference to each canvas that received a webgl context and,
   at measurement time, count only those still connected to the document and not
   context-lost. The probe canvas (never connected) and any torn-down iframe's canvas
   (disconnected on removal) drop out, leaving the count of contexts actually holding
   GPU resources. */
const PROBE = () => {
  window.__glCanvases = [];
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = gc.call(this, type, ...rest);
    if (c && /webgl/i.test(type)) window.__glCanvases.push({ cv: this, ctx: c });
    return c;
  };
};
const liveCtx = async (page) => {
  let n = 0;
  for (const f of page.frames()) {
    try {
      n += await f.evaluate(() => (window.__glCanvases || []).filter(
        (e) => e.cv.isConnected && !(e.ctx.isContextLost && e.ctx.isContextLost())).length);
    } catch (e) {}
  }
  return n;
};

async function makeBrowser(reduced) {
  return puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      ...(reduced ? ['--force-prefers-reduced-motion'] : [])],
  });
}

/* ============================ normal motion, desktop + phone ============================ */
for (const dev of [{ t: 'desktop 1280x800', w: 1280, h: 800, m: false }, { t: 'phone 390x844', w: 390, h: 844, m: true }]) {
  const browser = await makeBrowser(false);
  const page = await browser.newPage();
  await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: 1, isMobile: dev.m, hasTouch: dev.m });
  await page.evaluateOnNewDocument(PROBE);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  say('\n===== STAGE ' + dev.t + ' =====');
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.evaluate(() => document.getElementById('start-here').scrollIntoView({ block: 'center' }));
  await sleep(9000);

  // S1: exactly one live context
  const frames1 = await page.$$eval('#stage-frame iframe', (e) => e.length);
  const ctx1 = await liveCtx(page);
  const ok1 = frames1 === 1 && ctx1 === 1;
  say(`S1 at rest: iframes=${frames1}, live WebGL contexts=${ctx1} -> ${ok1 ? 'PASS' : 'FAIL'}`);
  if (!ok1) bad.push(`${dev.t} S1`);

  // S1b: hammer the rail. Six switches back to back must never stack contexts.
  for (let i = 0; i < 6; i++) {
    await page.evaluate((k) => document.querySelectorAll('.stage__pick')[k % 6].click(), i);
    await sleep(700);
  }
  await sleep(6000);
  const framesH = await page.$$eval('#stage-frame iframe', (e) => e.length);
  const ctxH = await liveCtx(page);
  let totalMade = 0;
  for (const f of page.frames()) { try { totalMade += await f.evaluate(() => (window.__glCanvases || []).length); } catch (e) {} }
  const okH = framesH === 1 && ctxH === 1;
  say(`S1b after 6 rapid rail switches: iframes=${framesH}, live contexts=${ctxH} (${totalMade} created in total, so the old ones were torn down) -> ${okH ? 'PASS' : 'FAIL'}`);
  if (!okH) bad.push(`${dev.t} S1b`);

  // S7: the CTA follows the loaded system. Whatever system the rail's 2nd slot holds,
  // picking it must re-point the CTA, the caption and the iframe at THAT project.
  await page.evaluate(() => document.querySelectorAll('.stage__pick')[1].click());
  await sleep(4000);
  const want = await page.$eval('.stage__pick:nth-of-type(2)', (b) => b.getAttribute('data-viz'));
  const wired = await page.evaluate(() => ({
    cta: document.getElementById('stage-cta').getAttribute('href'),
    /* the "open the 3D full screen" button was removed on purpose: the stage's only
       exit is the CTA into the project page. Assert it stays gone. */
    full: document.getElementById('stage-full') ? 'STILL PRESENT' : 'gone',
    src: (document.querySelector('#stage-frame iframe') || {}).src || '',
    pressed: [...document.querySelectorAll('.stage__pick')].map((b) => b.getAttribute('aria-pressed')).join(','),
    tag: [...document.querySelectorAll('.stage__pick')].every((b) => b.tagName === 'BUTTON'),
    cap: document.getElementById('stage-caption').textContent.trim().slice(0, 28),
  }));
  const ok7 = wired.cta === `projects/${want}.html` && wired.full === 'gone'
    && wired.src.includes(`/viz/${want}.html`) && wired.pressed === 'false,true,false,false,false,false' && wired.tag;
  say(`S7 rail -> stage wiring: cta=${wired.cta} full-screen-button=${wired.full} loaded=${wired.src.split('/').pop()} aria-pressed=[${wired.pressed}] caption="${wired.cap}..." -> ${ok7 ? 'PASS' : 'FAIL'}`);
  if (!ok7) bad.push(`${dev.t} S7`);

  // S5: scroll well away -> the context is handed back; come back -> it is taken again
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(3000);
  const away = await page.$$eval('#stage-frame iframe', (e) => e.length);
  await page.evaluate(() => document.getElementById('start-here').scrollIntoView({ block: 'center' }));
  await sleep(6000);
  const backAgain = await page.$$eval('#stage-frame iframe', (e) => e.length);
  const ok5 = away === 0 && backAgain === 1;
  say(`S5 scrolled far away: iframes=${away} (context returned) | scrolled back: iframes=${backAgain} -> ${ok5 ? 'PASS' : 'FAIL'}`);
  if (!ok5) bad.push(`${dev.t} S5`);

  /* S6 no layout shift. The real question is not whether the still matches the frame's
     border box (it never can: the frame has a 4px border and the still sits inside it).
     It is whether ANYTHING on the page moves when the 3D lands on top of the still.
     So: tear the iframe out, record the geometry, put it back, and compare. The still
     and the iframe must also occupy exactly the same box as each other. */
  const s6 = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = document.getElementById('stage-frame');
    const poster = document.getElementById('stage-poster');
    const caption = document.querySelector('.stage__caption');
    const rail = document.querySelector('.stage__rail');
    const snap = () => {
      const f = frame.getBoundingClientRect();
      const c = caption.getBoundingClientRect();
      const r = rail.getBoundingClientRect();
      return [f.width, f.height, c.top, r.top].map((n) => Math.round(n * 10) / 10);
    };
    const withIframe = snap();
    const ifr = frame.querySelector('iframe');
    const pr = poster.getBoundingClientRect();
    const ir = ifr.getBoundingClientRect();
    const sameBox = Math.abs(pr.width - ir.width) < 1 && Math.abs(pr.height - ir.height) < 1
      && Math.abs(pr.top - ir.top) < 1 && Math.abs(pr.left - ir.left) < 1;
    // now remove it: this is the page exactly as it looked before the 3D arrived
    ifr.remove();
    await wait(120);
    const withoutIframe = snap();
    const moved = withIframe.some((v, i) => Math.abs(v - withoutIframe[i]) > 0.5);
    return { withIframe, withoutIframe, moved, sameBox, posterBox: [Math.round(pr.width), Math.round(pr.height)] };
  });
  const ok6 = !s6.moved && s6.sameBox;
  say(`S6 layout with 3D [${s6.withIframe}] vs with only the still [${s6.withoutIframe}] -> anything moved: ${s6.moved}`);
  say(`   still and canvas occupy the identical ${s6.posterBox[0]}x${s6.posterBox[1]} box: ${s6.sameBox} -> ${ok6 ? 'PASS (no layout shift)' : 'FAIL'}`);
  if (!ok6) bad.push(`${dev.t} S6`);
  /* S6 pulled the iframe out from under the module. Scroll right away and back so it
     runs its own teardown and rebuild, and the touch checks below get a real frame. */
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(2500);
  await page.evaluate(() => document.getElementById('start-here').scrollIntoView({ block: 'center' }));
  await sleep(7000);
  const rebuilt = await page.$$eval('#stage-frame iframe', (e) => e.length);
  if (rebuilt !== 1) { say(`   (module did not rebuild after the probe: ${rebuilt} iframes)`); bad.push(`${dev.t} S6 rebuild`); }

  // S2 / S3: touch only
  if (dev.m) {
    const cdp = await page.target().createCDPSession();
    await page.evaluate(() => document.getElementById('stage-frame').scrollIntoView({ block: 'center' }));
    await sleep(5000);
    const box = await (await page.$('#stage-frame')).boundingBox();
    const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2);

    const y0 = await page.evaluate(() => window.scrollY);
    await touchSwipe(cdp, cx, cy, 0, -260);
    await sleep(1200);
    const y1 = await page.evaluate(() => window.scrollY);
    const ok2 = y1 - y0 > 60;
    say(`S2 VERTICAL swipe starting on the stage: scrollY ${y0} -> ${y1} (delta ${y1 - y0}) -> ${ok2 ? 'PASS (page still scrolls, no trap)' : 'FAIL (SCROLL TRAPPED)'}`);
    if (!ok2) bad.push(`${dev.t} S2 SCROLL TRAP`);

    await page.evaluate(() => document.getElementById('stage-frame').scrollIntoView({ block: 'center' }));
    await sleep(3500);
    const box2 = await (await page.$('#stage-frame')).boundingBox();
    await touchSwipe(cdp, Math.round(box2.x + box2.width / 2), Math.round(box2.y + box2.height / 2), 130, 0, 14, 20);
    await sleep(1500);
    const vf = page.frames().find((f) => /\/viz\//.test(f.url()));
    let engaged = null;
    try { engaged = await vf.$eval('#btnReset', (el) => !el.hidden); } catch (e) { engaged = 'no frame'; }
    const ok3 = engaged === true;
    say(`S3 HORIZONTAL drag on the stage: viz reports view engaged = ${engaged} -> ${ok3 ? 'PASS (really draggable)' : 'FAIL'}`);
    if (!ok3) bad.push(`${dev.t} S3`);

    await page.screenshot({ path: OUT + '/stage-touch-m390.png' });
  }

  if (errs.length) { say('JS ERRORS: ' + errs.slice(0, 4).join(' || ')); bad.push(`${dev.t} js errors`); }
  else say('JS errors: none');
  await browser.close();
}

/* ============================ prefers-reduced-motion ============================ */
{
  const browser = await makeBrowser(true);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(PROBE);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  say('\n===== STAGE prefers-reduced-motion =====');
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  const honoured = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.evaluate(() => document.getElementById('start-here').scrollIntoView({ block: 'center' }));
  await sleep(7000);
  const n = await page.$$eval('#stage-frame iframe', (e) => e.length);
  const ctx = await liveCtx(page);
  // the rail must still work: it swaps the still and the links, with no WebGL
  const want3 = await page.$eval('.stage__pick:nth-of-type(3)', (b) => b.getAttribute('data-viz'));
  await page.evaluate(() => document.querySelectorAll('.stage__pick')[2].click());
  await sleep(900);
  const after = await page.evaluate(() => ({
    n: document.querySelectorAll('#stage-frame iframe').length,
    poster: document.getElementById('stage-poster').getAttribute('src'),
    cta: document.getElementById('stage-cta').getAttribute('href'),
    bar: document.getElementById('stage-grab').textContent.trim(),
  }));
  const okR = honoured && n === 0 && ctx === 0 && after.n === 0
    && after.poster.includes(want3) && after.cta === `projects/${want3}.html`;
  say(`media query honoured: ${honoured}`);
  say(`R1 no WebGL under reduced motion: iframes=${n}, contexts=${ctx} -> ${n === 0 && ctx === 0 ? 'PASS' : 'FAIL'}`);
  say(`R2 rail still swaps the still + links with no WebGL: poster=${after.poster.split('/').pop()} cta=${after.cta} iframes=${after.n} -> ${after.n === 0 && after.cta === `projects/${want3}.html` ? 'PASS' : 'FAIL'}`);
  say(`R3 the bar says so instead of promising a drag: "${after.bar}"`);
  await page.screenshot({ path: OUT + '/stage-reduced.png' });
  if (!okR) bad.push('reduced-motion');
  if (errs.length) { say('JS ERRORS: ' + errs.slice(0, 3).join(' || ')); bad.push('reduced js errors'); }
  else say('JS errors: none');
  await browser.close();
}

server.close();
console.log('\n' + (bad.length ? 'FAIL: ' + bad.join(', ') : 'ALL STAGE CHECKS PASS'));
process.exit(bad.length ? 1 : 0);
