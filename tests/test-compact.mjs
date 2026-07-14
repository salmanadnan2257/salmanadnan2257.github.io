/* Compact mode, at the size it was built for: a project card, 380x260.
   Per file, in a 380x260 viewport with ?compact=1:
     - zero JS errors, no WebGL error overlay
     - the four panels are out of the layout entirely (title, legend, HUD, hint)
     - the canvas fills the frame (380x260 CSS pixels, no letterbox)
     - the scene is actually drawn: ink coverage, and ink spread over a 4x3 grid
       of cells, measured against the frame's own background colour
     - a drag still changes the render (the piece is still interactive)
   A control pass with the parameter absent proves the panels are still there
   without it, so compact mode is additive and nothing else moved.
   Every frame is written out as a PNG so the result can be looked at, not just
   asserted about. */
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readdirSync, writeFileSync } from 'node:fs';

const VIZ = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/viz';
const OUT = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/tests/out/compact';
const W = 380, H = 260;

const only = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
const files = readdirSync(VIZ).filter((f) => f.endsWith('.html')).sort()
  .filter((f) => !only.length || only.some((o) => f.includes(o)));

/* How much of the frame the piece actually paints, and how widely it is spread.
   The background is whatever colour the corners agree on (every scene sets a flat
   background), so ink is any pixel far enough from it. */
function inkStats(buf) {
  const p = PNG.sync.read(Buffer.from(buf));
  const at = (x, y) => {
    const i = (p.width * y + x) << 2;
    return [p.data[i], p.data[i + 1], p.data[i + 2]];
  };
  const bg = at(1, 1);
  const CX = 4, CY = 3;
  const cells = new Array(CX * CY).fill(0);
  let ink = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const [r, g, b] = at(x, y);
      const d = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
      if (d > 24) {
        ink++;
        cells[Math.min(CY - 1, (y * CY / p.height) | 0) * CX + Math.min(CX - 1, (x * CX / p.width) | 0)]++;
      }
    }
  }
  const px = p.width * p.height;
  const cellPx = px / (CX * CY);
  return {
    ink: ink / px,
    /* cells carrying at least 1% of their own area in ink: the scene is somewhere
       in the middle of the frame, not a dot in one corner */
    live: cells.filter((c) => c / cellPx > 0.01).length,
    cells: CX * CY,
  };
}
function diff(a, b) {
  const A = PNG.sync.read(Buffer.from(a)), B = PNG.sync.read(Buffer.from(b));
  const n = pixelmatch(A.data, B.data, null, A.width, A.height, { threshold: 0.12 });
  return n / (A.width * A.height);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', `--window-size=${W},${H}`],
});

const panels = (frame) => frame.evaluate(() => {
  const shown = (id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    return el.offsetParent !== null || getComputedStyle(el).display !== 'none';
  };
  return { lbl: shown('lbl'), legend: shown('legend'), hud: shown('hud'), hint: shown('hint') };
});

let failures = 0;
for (const f of files) {
  const name = f.replace('.html', '');

  /* control: same size, no parameter. The panels must all still be there. */
  const ctl = await browser.newPage();
  await ctl.setViewport({ width: W, height: H });
  await ctl.goto('file://' + VIZ + '/' + f, { waitUntil: 'networkidle2', timeout: 45000 });
  await ctl.waitForSelector('#c', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 2000));
  const ctlPanels = await panels(ctl);
  writeFileSync(`${OUT}/${name}-normal.png`, await ctl.screenshot());
  await ctl.close();

  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url().slice(0, 60)));

  const bad = [];
  let st = { ink: 0, live: 0, cells: 12 }, moved = 0, gate = false, cp = null, box = null;
  try {
    await page.goto('file://' + VIZ + '/' + f + '?compact=1', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('#c', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 3000));   // let the scene get going

    if (await page.$eval('#err', (el) => getComputedStyle(el).display !== 'none')) {
      bad.push('webgl error overlay shown');
    }
    cp = await panels(page);
    for (const k of ['lbl', 'legend', 'hud', 'hint']) if (cp[k]) bad.push(`#${k} still showing`);

    box = await page.$eval('#c', (el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), ta: getComputedStyle(el).touchAction };
    });
    if (box.w !== W || box.h !== H) bad.push(`canvas ${box.w}x${box.h}, expected ${W}x${H}`);

    const A = await page.screenshot();
    writeFileSync(`${OUT}/${name}-compact.png`, A);
    /* A functional bar, not an aesthetic one: the scene is drawn, and it is drawn
       across the frame rather than parked in a corner. Whether a given piece is
       legible at this size is a judgement made by looking at the PNGs, not by a
       threshold: several of these scenes are line art on black and carry very
       little ink while reading perfectly. */
    st = inkStats(A);
    if (!(st.ink > 0.008)) bad.push(`frame essentially empty (ink ${(st.ink * 100).toFixed(1)}%)`);
    if (!(st.live >= 3)) bad.push(`scene parked in a corner (${st.live}/${st.cells} live cells)`);

    /* still interactive: pause so only the drag can move a pixel, then orbit.
       Two independent proofs, because one of them lies on a nearly black scene.
       The pixels say the render changed. The reset gate says the VIEW changed: the
       runtime un-hides #btnReset only once yaw, pitch or zoom sits off the scene's
       own framing, and it does that whether or not the frame had any lit pixels to
       show for it. A phrase dissolving on black can move the camera without moving
       enough pixels to measure, so the gate is the check that must hold everywhere
       and the pixel diff is only asked of frames with enough ink to measure. */
    const gateBefore = await page.$eval('#btnReset', (el) => el.hidden);
    if (gateBefore !== true) bad.push('reset gate open before any interaction');
    await page.$eval('#btnPlay', (el) => el.click());   // the HUD is display:none, so click it directly
    await page.mouse.move(190, 130);
    await new Promise((r) => setTimeout(r, 700));
    const P = await page.screenshot();
    await page.mouse.move(190, 130);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(190 + i * 9, 130 + i * 3);
      await new Promise((r) => setTimeout(r, 16));
    }
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 1600));
    const Q = await page.screenshot();
    writeFileSync(`${OUT}/${name}-compact-drag.png`, Q);
    moved = diff(P, Q);
    gate = await page.$eval('#btnReset', (el) => !el.hidden);
    if (!gate) bad.push('drag did not move the view');
    if (st.ink > 0.02 && !(moved > 0.004)) bad.push(`drag changed nothing (${moved.toFixed(4)})`);
  } catch (e) {
    bad.push('FATAL ' + e.message);
  }
  if (errs.length) bad.push(errs.length + ' js errors: ' + errs[0].slice(0, 80));

  /* the control must be untouched */
  for (const k of ['lbl', 'legend', 'hud', 'hint']) {
    if (!ctlPanels[k]) bad.push(`no-parameter control lost #${k}`);
  }
  await page.close();

  if (bad.length) failures++;
  console.log(
    (bad.length ? 'FAIL ' : 'ok   ') + name.padEnd(30) +
    ' ink=' + (st.ink * 100).toFixed(1).padStart(5) + '%' +
    ' cells=' + st.live + '/' + st.cells +
    ' drag=' + moved.toFixed(3) + ' viewmoved=' + (gate ? 'yes' : 'NO ') +
    ' panels=' + (cp ? Object.entries(cp).filter(([, v]) => v).map(([k]) => k).join(',') || 'none' : '?') +
    ' ctl=' + Object.entries(ctlPanels).filter(([, v]) => v).map(([k]) => k).join(',') +
    (bad.length ? '  <- ' + bad.join('; ') : '')
  );
}

await browser.close();
console.log('\n' + (files.length - failures) + '/' + files.length + ' compact');
process.exit(failures ? 1 : 0);
