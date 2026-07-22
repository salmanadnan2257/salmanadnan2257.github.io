/* Proves the new interaction actually works in a real browser, per viz file.
   Protocol per file, with the scene PAUSED so nothing but the viewer's input
   can change a pixel:
     A  paused baseline
     B  after a click-drag        -> must differ from A  (orbit works)
     C  after Reset view          -> must match A        (reset works)
     D  after a wheel zoom        -> must differ from C  (zoom works)
   Plus: zero console/page errors, and the Reset button appears only once the
   viewer has taken control. */
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readdirSync } from 'node:fs';

const VIZ = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/viz';
/* Filter: a substring, or a comma-separated list of names, so the 38 files can
   be sharded across several runners at once. */
const only = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
const files = readdirSync(VIZ).filter((f) => f.endsWith('.html')).sort()
  .filter((f) => !only.length || only.some((o) => f.includes(o)));

/* Crop in Node rather than asking Chrome for a clipped screenshot: a clipped
   capture goes through a different compositor path that does not reliably
   include the WebGL layer, which reads as "nothing changed" when plenty did. */
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

/* How much of the crop the scene actually draws on: the fraction of pixels that
   are not the page background. Needed because the thresholds below are absolute
   fractions of the whole crop, and that only means something for a scene that
   fills it. disappearing-text-app lights 0.4% of its frame, one dim line of
   serif text on near-black, so even rearranging every lit pixel it owns cannot
   move 0.4% of the crop, and a working drag scored 0.001 against a 0.004 floor.
   Measured against the top-left pixel, which every one of these scenes leaves
   as its own background. */
function ink(buf) {
  const A = crop(buf);
  const [r0, g0, b0] = [A.data[0], A.data[1], A.data[2]];
  let lit = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    if (Math.abs(A.data[i] - r0) + Math.abs(A.data[i + 1] - g0) +
        Math.abs(A.data[i + 2] - b0) > 24) lit++;
  }
  return lit / (A.width * A.height);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--window-size=1000,700'],
});

const rows = [];
let failures = 0;

for (const f of files) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url().slice(0, 60)));

  const res = { file: f, errs };
  try {
    await page.goto('file://' + VIZ + '/' + f, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('#c', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 2500));   // let the scene warm up

    // the error overlay must never be showing
    res.errOverlay = await page.$eval('#err', (el) => getComputedStyle(el).display !== 'none');

    // Reset button is hidden until the viewer takes control
    res.resetHiddenBefore = await page.$eval('#btnReset', (el) => el.hidden);
    res.touchAction = await page.$eval('#c', (el) => getComputedStyle(el).touchAction);
    res.cursor = await page.$eval('#c', (el) => getComputedStyle(el).cursor);

    // Compare the 3D content only. The HUD corner, the title card, the legend
    // and the hint pill all change for reasons that are not the camera (the HUD
    // lights up under the cursor, the Reset button appears once engaged), so
    // including them would measure the chrome instead of the piece.
    const shot = () => page.screenshot();   // full frame; cropped in Node above

    // pause, so only viewer input can move a pixel, and park the cursor off the HUD
    await page.click('#btnPlay');
    await page.mouse.move(500, 350);
    await new Promise((r) => setTimeout(r, 700));
    const A = await shot();

    // click-drag to the right and down
    await page.mouse.move(500, 350);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(500 + i * 18, 350 + i * 6);
      await new Promise((r) => setTimeout(r, 16));
    }
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 1600));   // momentum + easing settle
    const B = await shot();

    res.grabbingCleared = await page.$eval('#c', (el) => !el.classList.contains('is-grabbing'));
    res.resetShownAfter = await page.$eval('#btnReset', (el) => !el.hidden);
    res.hintGone = await page.$eval('#hint', (el) => el.classList.contains('is-gone'));

    // reset the view
    await page.click('#btnReset');
    await new Promise((r) => setTimeout(r, 1800));
    const C = await shot();

    // wheel zoom
    await page.mouse.move(500, 350);
    await page.mouse.wheel({ deltaY: -420 });
    await new Promise((r) => setTimeout(r, 1500));
    const D = await shot();

    res.drag = ratio(A, B);
    res.reset = ratio(A, C);
    res.zoom = ratio(C, D);
    res.ink = ink(A);
  } catch (e) {
    res.fatal = e.message;
  }
  await page.close();

  const bad = [];
  if (res.fatal) bad.push('FATAL ' + res.fatal);
  if (res.errs.length) bad.push(res.errs.length + ' js errors');
  if (res.errOverlay) bad.push('webgl error overlay shown');
  if (res.resetHiddenBefore === false) bad.push('reset button visible too early');
  if (res.resetShownAfter === false) bad.push('reset button never appeared');
  if (res.hintGone === false) bad.push('hint never faded');
  if (res.grabbingCleared === false) bad.push('grab cursor stuck');
  if (res.touchAction !== 'none') bad.push('touch-action ' + res.touchAction);
  if (res.cursor !== 'grab') bad.push('cursor ' + res.cursor);
  /* The floor a gesture has to clear. Normally 0.004 of the crop. For a scene
     that lights less than 5% of the crop, that floor is unreachable however well
     the orbit works, so the same demand is made of the pixels the scene has:
     the gesture must move at least 8% of them. That is a STRICTER test for every
     dense scene (at 30% ink it asks for 2.4%, six times the absolute floor), so
     it is only allowed to lower the bar where the absolute one is meaningless.
     Both floors are reported, and which one applied, so a pass is never silent
     about which rule it passed under. */
  const inkFrac = res.ink ?? 1;
  const floor = inkFrac < 0.05 ? Math.max(0.08 * inkFrac, 0.0002) : 0.004;
  res.floor = floor;
  if (!(res.drag > floor)) bad.push('drag changed nothing (' + (res.drag ?? 0).toFixed(4) + ' vs floor ' + floor.toFixed(4) + ')');
  if (!(res.reset < 0.004)) bad.push('reset did not restore (' + (res.reset ?? 1).toFixed(4) + ')');
  if (!(res.zoom > floor)) bad.push('zoom changed nothing (' + (res.zoom ?? 0).toFixed(4) + ' vs floor ' + floor.toFixed(4) + ')');

  if (bad.length) failures++;
  rows.push({ f, bad, res });
  console.log(
    (bad.length ? 'FAIL ' : 'ok   ') + f.padEnd(36) +
    ' drag=' + (res.drag ?? 0).toFixed(3) +
    ' reset=' + (res.reset ?? 1).toFixed(3) +
    ' zoom=' + (res.zoom ?? 0).toFixed(3) +
    ' ink=' + ((res.ink ?? 0) * 100).toFixed(1) + '%' +
    ' floor=' + (res.floor ?? 0.004).toFixed(4) +
    (bad.length ? '  <- ' + bad.join('; ') : '')
  );
  if (res.errs.length) res.errs.slice(0, 3).forEach((e) => console.log('        ' + e.slice(0, 140)));
}

await browser.close();
console.log('\n' + (files.length - failures) + '/' + files.length + ' passed');
process.exit(failures ? 1 : 0);
