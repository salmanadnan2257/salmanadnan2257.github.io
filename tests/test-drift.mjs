/* Does a drag on a PLAYING piece stay put, or does it run away?
   Four scenes ease the camera from wherever it currently is instead of placing it
   outright. If the orbit layer feeds its own output back to them, the two loops
   drive each other and the framing collapses into the pivot or flies past the far
   plane, within a second or two. A paused-only test cannot see this, because the
   scene never steps.

   What a runaway actually looks like, measured on the re-broken files (see the
   "buggy" numbers below): the frame saturates or craters, and the view never
   settles, so consecutive frames keep differing enormously. What it does NOT look
   like is a modest coverage swing: sparse pieces (morse-code-converter above all)
   pulse hard on their own, its idle coverage wanders between 1.1% and 9.2% with
   nobody touching it, so an absolute before/after coverage ratio flags a healthy
   scene as often as a broken one.

   So every scene is run TWICE, identically timed:
     control  no interaction at all      -> the scene's own natural coverage band
     drag     a drag while it is PLAYING -> must stay inside that band's neighbourhood
   and coverage is sampled 8 times across the 4s after the drag, not once, so the
   pulse averages out. Three failure signatures, each catastrophic by design:

     churn      max frame-to-frame diff over the window.  fixed <= 0.14, buggy >= 0.39
     saturated  drag max coverage vs the control's max.   fixed <= +4pp, buggy >= +31pp
     collapsed  drag median coverage vs the control's.    fixed >= 0.99x, buggy 0.003x
   Plus: the piece must still be animating and not frozen.  */
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const VIZ = process.env.VIZ_DIR || '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/viz';
const names = (process.argv[2] || 'dino-game-bot,morse-code-converter,tic-tac-toe-gui,typing-master-gui')
  .split(',').map((s) => s.trim()).filter(Boolean);

const SAMPLES = 8;          // coverage samples across the post-drag window
const GAP = 380;            // ms between them; a screenshot itself costs ~150ms
const CHURN_MAX = 0.25;     // a settled camera cannot keep repainting a quarter of the frame
const SATURATE_PP = 0.20;   // 20 points of coverage above the scene's own densest idle frame
const COLLAPSE_X = 0.3;     // losing two thirds of the scene's ink is not "a new angle"
const FROZEN = 0.0005;      // below this nothing is moving at all

const CROP = { x: 140, y: 100, w: 720, h: 440 };
function readCrop(buf) {
  const src = PNG.sync.read(Buffer.from(buf));
  const out = new PNG({ width: CROP.w, height: CROP.h });
  PNG.bitblt(src, out, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0);
  return out;
}
/* share of pixels far enough from the scene's background colour to be "scene" */
function coverage(png) {
  const d = png.data;
  const br = d[0], bg = d[1], bb = d[2];      // top-left pixel is background
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 24) n++;
  }
  return n / (png.width * png.height);
}
function diff(a, b) {
  return pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.12 }) / (a.width * a.height);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (v) => (v * 100).toFixed(1) + '%';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* One pass over a scene. dragging=false is the control: same page, same timings,
   same sampling, no input whatsoever. */
async function pass(file, dragging) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto('file://' + VIZ + '/' + file, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#c');
  await sleep(3000);                       // let the piece settle into its loop

  if (dragging) {                          // a modest drag, while the piece is PLAYING
    await page.mouse.move(500, 350);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(500 + i * 12, 350 + i * 3);
      await sleep(16);
    }
    await page.mouse.up();
  }

  /* A runaway needs only a second to wreck the framing, so watch the whole window
     rather than glancing at it once. */
  const cov = [];
  let prev = null, churn = 0, moved = 0;
  for (let i = 0; i < SAMPLES; i++) {
    await sleep(GAP);
    const shot = readCrop(await page.screenshot());
    cov.push(coverage(shot));
    if (prev) {
      const d = diff(prev, shot);
      churn = Math.max(churn, d);          // worst frame-to-frame jump: a runaway never settles
      moved = Math.max(moved, d);
    }
    prev = shot;
  }
  await page.close();
  return { med: median(cov), max: Math.max(...cov), churn, moved, errs };
}

let failures = 0;
for (const n of names) {
  const file = n + '.html';
  const bad = [];
  let c = null, d = null;
  try {
    c = await pass(file, false);           // control: the scene's own natural band
    d = await pass(file, true);            // the same scene, dragged while playing
    const errs = c.errs.concat(d.errs);

    if (d.churn > CHURN_MAX) {
      bad.push(`camera never settles: frame-to-frame churn ${d.churn.toFixed(3)} (control ${c.churn.toFixed(3)})`);
    }
    if (d.max > c.max + SATURATE_PP) {
      bad.push(`frame saturated: coverage peaks at ${pct(d.max)} against a natural peak of ${pct(c.max)}`);
    }
    if (d.med < c.med * COLLAPSE_X) {
      bad.push(`scene collapsed: coverage ${pct(d.med)} against a natural ${pct(c.med)}`);
    }
    if (d.moved < FROZEN) {
      bad.push(`piece stopped animating after the drag (frame-to-frame diff ${d.moved.toFixed(5)})`);
    }
    if (errs.length) bad.push(errs.length + ' js errors: ' + errs[0].slice(0, 80));
  } catch (e) {
    bad.push('FATAL ' + e.message);
  }

  if (bad.length) failures++;
  console.log(
    (bad.length ? 'FAIL ' : 'ok   ') + file.padEnd(32) +
    ' coverage ' + pct(c ? c.med : 0) + ' idle -> ' + pct(d ? d.med : 0) + ' dragged' +
    '  peak ' + pct(c ? c.max : 0) + ' -> ' + pct(d ? d.max : 0) +
    '  churn ' + (d ? d.churn : 0).toFixed(3) +
    (bad.length ? '  <- ' + bad.join('; ') : '')
  );
}

await browser.close();
console.log('\n' + (names.length - failures) + '/' + names.length + ' held their framing after a drag while playing');
process.exit(failures ? 1 : 0);
