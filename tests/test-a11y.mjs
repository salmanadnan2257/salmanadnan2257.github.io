/* Accessibility verification of the 3D viz interaction, in real headless Chrome.
   Read-only: this never touches the site files.

   Per file, with the scene PAUSED so only viewer input can move a pixel:
     A   paused baseline
     for each of ArrowLeft/Right/Up/Down/+/- :
         press it 6x -> screenshot must DIFFER from A
         press "r"   -> screenshot must return to A (diff ~0)
     Space on the canvas must still toggle #btnPlay between Pause and Play
     Tab from the top of the document must land on the canvas, with a focus ring
     aria-label must mention the interaction
   Then a second page load with prefers-reduced-motion: reduce, where dragging
   must still work and Reset view must still restore the framing.
*/
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const VIZ = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/viz';
const FILES = (process.argv[2] || 'raft-kv,urdu-slm,space-race-analysis,vector-db,breakout-game,sqlmill,cpp-ray-tracer,voice-agent')
  .split(',').map((s) => s.trim()).filter(Boolean);

const CROP = { x: 140, y: 100, w: 720, h: 440 };
function crop(buf) {
  const src = PNG.sync.read(Buffer.from(buf));
  const out = new PNG({ width: CROP.w, height: CROP.h });
  PNG.bitblt(src, out, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0);
  return out;
}
function ratio(a, b) {
  const A = crop(a), B = crop(b);
  const n = pixelmatch(A.data, B.data, null, A.width, A.height, { threshold: 0.12 });
  return n / (A.width * A.height);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A baseline is only trustworthy once the paused scene has presented the same
   frame twice: under SwiftShader the first composite after load can lag, and a
   stale first frame makes every later comparison a lie. */
async function stableShot(page, label) {
  let prev = await page.screenshot();
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    const next = await page.screenshot();
    const d = ratio(prev, next);
    if (d < 0.0005) return next;
    prev = next;
  }
  console.log('       !! baseline never stabilized (' + label + ')');
  return prev;
}

const CHANGED = 0.004;   // same thresholds the pointer test uses
const SAME = 0.004;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--window-size=1000,700'],
});

async function openPage(f, reduced) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url().slice(0, 70)));
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto('file://' + VIZ + '/' + f + '.html', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForSelector('#c', { timeout: 10000 });
  await sleep(2500);
  return { page, errs };
}

const results = [];

for (const f of FILES) {
  const r = { file: f, keys: {}, errs: [], redErrs: [] };
  try {
    /* ---------- pass 1: normal motion ---------- */
    const { page, errs } = await openPage(f, false);
    r.errs = errs;

    r.reducedMotionMatchedNormal = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // 4. ARIA
    r.aria = await page.$eval('#c', (el) => el.getAttribute('aria-label'));
    r.tabindex = await page.$eval('#c', (el) => el.getAttribute('tabindex'));

    // 3. FOCUS: Tab from the very top of the document
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.keyboard.press('Tab');
    const focus1 = await page.evaluate(() => {
      const a = document.activeElement;
      return { tag: a && a.tagName, id: a && a.id };
    });
    r.tabStops = [focus1];
    r.firstTabIsCanvas = focus1.id === 'c';
    // how many Tabs to reach it, if not the first
    if (!r.firstTabIsCanvas) {
      for (let i = 0; i < 8 && !r.firstTabIsCanvas; i++) {
        await page.keyboard.press('Tab');
        const fx = await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id }));
        r.tabStops.push(fx);
        if (fx.id === 'c') { r.firstTabIsCanvas = false; r.tabIndexReached = i + 2; break; }
      }
    } else { r.tabIndexReached = 1; }

    r.focusVisible = await page.$eval('#c', (el) => {
      let matched = false;
      try { matched = el.matches(':focus-visible'); } catch (e) { matched = null; }
      return { matched, boxShadow: getComputedStyle(el).boxShadow, outline: getComputedStyle(el).outline };
    });
    // does a :focus-visible rule for the canvas exist in the stylesheet at all
    r.focusVisibleRule = await page.evaluate(() => {
      for (const ss of document.styleSheets) {
        let rules; try { rules = ss.cssRules; } catch (e) { continue; }
        for (const rule of rules) {
          if (rule.selectorText && /canvas:focus-visible/.test(rule.selectorText)) return rule.cssText;
        }
      }
      return null;
    });

    // pause the scene, park the cursor off the HUD
    await page.click('#btnPlay');
    r.playTextAfterPauseClick = await page.$eval('#btnPlay', (el) => el.textContent.trim());
    await page.mouse.move(500, 350);
    await sleep(800);
    await page.focus('#c');
    r.activeAfterFocus = await page.evaluate(() => document.activeElement?.id);
    const A = await stableShot(page, 'normal baseline');

    // 1. KEYBOARD ORBIT
    const presses = [
      ['ArrowLeft', 'ArrowLeft', 6],
      ['ArrowRight', 'ArrowRight', 6],
      ['ArrowUp', 'ArrowUp', 6],
      ['ArrowDown', 'ArrowDown', 6],
      ['+', '+', 6],
      ['-', '-', 6],
    ];
    for (const [label, key, n] of presses) {
      for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(40); }
      await sleep(1400);                       // easing settles
      const S = await page.screenshot();
      const changed = ratio(A, S);
      await page.keyboard.press('r');          // reset back to the baseline framing
      await sleep(2000);
      const Z = await page.screenshot();
      const back = ratio(A, Z);
      r.keys[label] = { changed, back };
    }

    r.resetBtnShown = await page.$eval('#btnReset', (el) => !el.hidden);
    r.hintGone = await page.$eval('#hint', (el) => el.classList.contains('is-gone'));

    // 2. SPACE still toggles play/pause
    const beforeSpace = await page.$eval('#btnPlay', (el) => el.textContent.trim());
    await page.focus('#c');
    await page.keyboard.press('Space');
    await sleep(300);
    const afterSpace1 = await page.$eval('#btnPlay', (el) => el.textContent.trim());
    await page.keyboard.press('Space');
    await sleep(300);
    const afterSpace2 = await page.$eval('#btnPlay', (el) => el.textContent.trim());
    r.space = { beforeSpace, afterSpace1, afterSpace2 };

    // 6. no WebGL error overlay
    r.errOverlay = await page.$eval('#err', (el) => getComputedStyle(el).display !== 'none');
    await page.close();

    /* ---------- pass 2: prefers-reduced-motion: reduce ---------- */
    const { page: rp, errs: rerrs } = await openPage(f, true);
    r.redErrs = rerrs;
    r.reducedMotionMatched = await rp.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    r.redErrOverlay = await rp.$eval('#err', (el) => getComputedStyle(el).display !== 'none');

    await rp.click('#btnPlay');
    await rp.mouse.move(500, 350);
    await sleep(800);
    const RA = await stableShot(rp, 'reduced baseline');

    await rp.mouse.move(500, 350);
    await rp.mouse.down();
    for (let i = 1; i <= 12; i++) { await rp.mouse.move(500 + i * 18, 350 + i * 6); await sleep(16); }
    await rp.mouse.up();
    await sleep(1600);
    const RB = await rp.screenshot();
    r.redDrag = ratio(RA, RB);

    r.redResetBtnShown = await rp.$eval('#btnReset', (el) => !el.hidden);
    await rp.click('#btnReset');
    await sleep(1800);
    await rp.mouse.move(500, 350);
    await sleep(300);
    const RC = await rp.screenshot();
    r.redReset = ratio(RA, RC);

    // keyboard under reduced motion too
    await rp.focus('#c');
    for (let i = 0; i < 6; i++) { await rp.keyboard.press('ArrowLeft'); await sleep(40); }
    await sleep(1400);
    const RD = await rp.screenshot();
    r.redKey = ratio(RA, RD);
    await rp.keyboard.press('r');
    await sleep(2000);
    const RE = await rp.screenshot();
    r.redKeyBack = ratio(RA, RE);

    await rp.close();
  } catch (e) {
    r.fatal = e.message;
  }
  results.push(r);

  // ---- verdicts ----
  const bad = [];
  if (r.fatal) bad.push('FATAL ' + r.fatal);
  if (r.errs.length) bad.push('normal-pass JS errors: ' + r.errs.length);
  if (r.redErrs.length) bad.push('reduced-motion JS errors: ' + r.redErrs.length);
  if (r.errOverlay) bad.push('webgl error overlay (normal)');
  if (r.redErrOverlay) bad.push('webgl error overlay (reduced)');
  if (!r.firstTabIsCanvas) bad.push('canvas not the first Tab stop (reached at Tab #' + r.tabIndexReached + ')');
  if (!r.focusVisibleRule) bad.push('no canvas:focus-visible CSS rule');
  if (r.activeAfterFocus !== 'c') bad.push('canvas did not become activeElement');
  if (!/arrow key/i.test(r.aria || '')) bad.push('aria-label does not mention arrow keys');
  if (!/drag/i.test(r.aria || '')) bad.push('aria-label does not mention drag');
  if (!/zoom/i.test(r.aria || '')) bad.push('aria-label does not mention zoom');
  if (!/reset/i.test(r.aria || '')) bad.push('aria-label does not mention reset');
  for (const [k, v] of Object.entries(r.keys)) {
    if (!(v.changed > CHANGED)) bad.push(`key ${k} changed nothing (${v.changed.toFixed(4)})`);
    if (!(v.back < SAME)) bad.push(`"r" after ${k} did not restore baseline (${v.back.toFixed(4)})`);
  }
  if (Object.keys(r.keys).length < 6 && !r.fatal) bad.push('not all keys exercised');
  if (!(r.space && r.space.beforeSpace !== r.space.afterSpace1 && r.space.afterSpace1 !== r.space.afterSpace2))
    bad.push('Space did not toggle play/pause: ' + JSON.stringify(r.space));
  if (!(r.redDrag > CHANGED)) bad.push(`reduced-motion drag changed nothing (${(r.redDrag ?? 0).toFixed(4)})`);
  if (!(r.redReset < SAME)) bad.push(`reduced-motion Reset view did not restore (${(r.redReset ?? 1).toFixed(4)})`);
  if (!(r.redKey > CHANGED)) bad.push(`reduced-motion keyboard changed nothing (${(r.redKey ?? 0).toFixed(4)})`);
  if (!(r.redKeyBack < SAME)) bad.push(`reduced-motion "r" did not restore (${(r.redKeyBack ?? 1).toFixed(4)})`);
  r.bad = bad;

  const kfmt = Object.entries(r.keys)
    .map(([k, v]) => `${k}:${v.changed.toFixed(3)}/r=${v.back.toFixed(3)}`).join(' ');
  console.log((bad.length ? 'FAIL ' : 'ok   ') + f.padEnd(24) + kfmt);
  console.log('       space=' + JSON.stringify(r.space) +
    ' tab1=' + JSON.stringify(r.tabStops?.[0]) +
    ' focusVisible=' + JSON.stringify(r.focusVisible));
  console.log('       reduced: matched=' + r.reducedMotionMatched + ' drag=' + (r.redDrag ?? 0).toFixed(3) +
    ' reset=' + (r.redReset ?? 1).toFixed(3) + ' key=' + (r.redKey ?? 0).toFixed(3) +
    ' keyBack=' + (r.redKeyBack ?? 1).toFixed(3) + ' errs=' + r.redErrs.length);
  console.log('       aria="' + r.aria + '"');
  if (r.errs.length) r.errs.slice(0, 3).forEach((e) => console.log('       ERR ' + e.slice(0, 150)));
  if (r.redErrs.length) r.redErrs.slice(0, 3).forEach((e) => console.log('       RM-ERR ' + e.slice(0, 150)));
  if (bad.length) bad.forEach((b) => console.log('       <- ' + b));
  console.log('');
}

await browser.close();
const failed = results.filter((r) => r.bad?.length).length;
console.log('=== ' + (results.length - failed) + '/' + results.length + ' files passed all checks ===');
process.exit(failed ? 1 : 0);
