/* CPU-leak / frame-rate probe for the 3D viz pages.

   The pieces are meant to stop asking for frames whenever nothing can change:
   when the viewer pauses and the orbit has settled, and when the tab is hidden.
   A loop that keeps calling requestAnimationFrame in those states burns a core
   forever, so this counts rAF requests rather than trusting the code to be right.

   Per file:
     D  ticks/sec while playing normally (software GL: a floor, not real FPS)
     C  hidden tab, still "playing"      -> counter must stop climbing
     A  paused + dragged, then settled   -> counter must be flat
     B  same as A but prefers-reduced-motion: reduce  (the recently fixed path)

   The counter is installed with evaluateOnNewDocument so it wraps
   requestAnimationFrame before any page script can grab a reference to it. */
import puppeteer from 'puppeteer-core';

const VIZ = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/viz';
const FILES = ['raft-kv', 'urdu-slm', 'sqlmill', 'breakout-game',
               'webgl-terrain-explorer', 'dino-game-bot'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COUNTER = () => {
  window.__rafCount = 0;
  const _raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    window.__rafCount++;
    return _raf.call(window, cb);
  };
  /* document.hidden is a getter on Document.prototype; shadow it with one we
     control so a dispatched visibilitychange looks real to the page's handler. */
  window.__hidden = false;
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => window.__hidden,
  });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (window.__hidden ? 'hidden' : 'visible'),
  });
};

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--window-size=1000,700'],
});

const raf = (p) => p.evaluate(() => window.__rafCount);

/* Pause, drag the canvas ~150px, let the orbit settle, then take two samples
   3s apart with no input at all. Flat counter = no leak. */
async function pausedIdle(page) {
  await page.click('#btnPlay');
  await sleep(300);
  await page.mouse.move(500, 350);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(500 + i * 15, 350 + i * 5); await sleep(16); }
  await page.mouse.up();
  await page.mouse.move(500, 620);        // park the cursor off the canvas/HUD
  await sleep(3000);                       // let easing + momentum settle
  const before = await raf(page);
  await sleep(3000);                       // dead time, zero input
  const after = await raf(page);
  return { before, after, delta: after - before };
}

async function open(file, reduced) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });
  await page.evaluateOnNewDocument(COUNTER);
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + VIZ + '/' + file + '.html', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForSelector('#c', { timeout: 10000 });
  await sleep(3000);                       // warm-up
  return { page, errs };
}

const rows = [];

for (const file of FILES) {
  const row = { file };

  /* --- normal page: D (fps), C (hidden), A (paused idle) --- */
  const { page, errs } = await open(file, false);
  try {
    // D: ticks/sec while playing, over 5s
    const d0 = await raf(page); const t0 = Date.now();
    await sleep(5000);
    const d1 = await raf(page); const t1 = Date.now();
    row.tps = (d1 - d0) / ((t1 - t0) / 1000);

    // C: hidden tab, still playing. Flip our document.hidden shim, fire the event.
    await page.evaluate(() => {
      window.__hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(600);                      // let any already-queued frame land
    const h0 = await raf(page);
    await sleep(3000);
    const h1 = await raf(page);
    row.hidden = { before: h0, after: h1, delta: h1 - h0 };
    // back to visible so the piece is genuinely playing again before we pause it
    await page.evaluate(() => {
      window.__hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(1200);
    row.resumed = (await raf(page)) - h1;   // sanity: it must start ticking again

    // A: paused idle
    row.A = await pausedIdle(page);
  } catch (e) { row.fatal = e.message; }
  row.errs = errs.slice(0, 2);
  await page.close();

  /* --- reduced-motion page: B --- */
  const r = await open(file, true);
  try {
    row.reduceMotionSeen = await r.page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    row.B = await pausedIdle(r.page);
  } catch (e) { row.fatalB = e.message; }
  row.errsB = r.errs.slice(0, 2);
  await r.page.close();

  rows.push(row);
  console.log(JSON.stringify(row));
}

await browser.close();

/* ---- report ---- */
const f = (x) => (x == null ? '?' : String(x));
console.log('\n' + 'file'.padEnd(24) + 'tps  | A idle before/after (d) | B rm before/after (d) | hidden before/after (d) | resumed');
let leaks = 0;
for (const r of rows) {
  const bad = [];
  if (!r.A || r.A.delta > 3) { bad.push('A'); leaks++; }
  if (!r.B || r.B.delta > 3) { bad.push('B'); leaks++; }
  if (!r.hidden || r.hidden.delta > 3) { bad.push('C'); leaks++; }
  console.log(
    (bad.length ? 'LEAK ' : 'ok   ') + r.file.padEnd(24) +
    (r.tps ? r.tps.toFixed(1) : '?').padStart(5) + ' | ' +
    (r.A ? `${f(r.A.before)}/${f(r.A.after)} (${f(r.A.delta)})` : 'FAIL').padEnd(23) + ' | ' +
    (r.B ? `${f(r.B.before)}/${f(r.B.after)} (${f(r.B.delta)})` : 'FAIL').padEnd(21) + ' | ' +
    (r.hidden ? `${f(r.hidden.before)}/${f(r.hidden.after)} (${f(r.hidden.delta)})` : 'FAIL').padEnd(23) + ' | ' +
    f(r.resumed) + (bad.length ? '   <- ' + bad.join(',') : '') +
    (r.errs?.length || r.errsB?.length ? '  ERRS: ' + [...r.errs, ...r.errsB].join('; ').slice(0, 80) : '')
  );
}
console.log('\nreduce-motion media actually applied: ' + rows.map((r) => r.file + '=' + r.reduceMotionSeen).join(' '));
console.log(leaks ? '\n' + leaks + ' LEAK(S)' : '\nno CPU leaks: every idle/hidden counter flat');
