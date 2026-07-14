/* Mobile viewport verification with real headless Chrome + real touch events.
   A) homepage: CTA buttons visible/unclipped/touch-sized, no horizontal overflow,
      stat blocks sane.
   B) raft-kv project page: a VERTICAL touch swipe that starts on the 3D viz iframe
      must still scroll the host page. A horizontal drag must engage the view. */
import puppeteer from 'puppeteer-core';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const OUT = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/tests/out';

const DEVICES = [
  { label: 'iPhone-ish 390x844', width: 390, height: 844, dpr: 3 },
  { label: 'Android-ish 360x740', width: 360, height: 740, dpr: 3 },
];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* raw CDP touch swipe: touchStart, N touchMoves, touchEnd. Chrome's browser-side
   gesture recognizer turns this into a real scroll gesture, honouring touch-action. */
async function touchSwipe(cdp, x, y, dx, dy, steps = 14, stepMs = 16) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await sleep(stepMs);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
    });
    await sleep(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const report = [];
const say = (s) => { report.push(s); console.log(s); };

/* ---------------------------------------------------------------- A) HOMEPAGE */
for (const dev of DEVICES) {
  const page = await browser.newPage();
  await page.setViewport({
    width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr,
    isMobile: true, hasTouch: true,
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file://' + SITE + '/index.html', { waitUntil: 'networkidle2' });
  // the page uses scroll-behavior: smooth; make scrolls instant so hit-tests never
  // fire mid-flight
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await sleep(1500);
  // reveal-on-scroll sections: force everything visible so we measure real layout
  await page.evaluate(() => {
    document.querySelectorAll('.reveal, [class*=reveal]').forEach((e) => e.classList.add('is-visible', 'in'));
  });
  await sleep(400);

  say('\n===== HOMEPAGE ' + dev.label + ' =====');

  /* document.elementFromPoint only sees the CURRENT viewport: it returns null for any
     point above or below the fold. The 38 CTAs sit 5,000 to 26,000px down the page, so
     hit-testing them from scrollY=0 reports every one of them as "covered" when nothing
     covers them at all. Scroll each CTA to the middle of the viewport, then hit-test. */
  const cardCount = await page.$$eval('.pcard, .mini', (els) => els.length);
  const cards = [];
  for (let i = 0; i < cardCount; i++) {
    await page.evaluate((idx) => {
      const el = document.querySelectorAll('.pcard, .mini')[idx];
      const go = el.querySelector('.pcard__go, .mini__go');
      if (!go) return;
      const y = go.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, y - window.innerHeight / 2), behavior: 'instant' });
    }, i);
    await sleep(90);
    cards.push(await page.evaluate((i) => {
      const el = document.querySelectorAll('.pcard, .mini')[i];
      const go = el.querySelector('.pcard__go, .mini__go');
      const cr = el.getBoundingClientRect();
      if (!go) return { i, href: el.getAttribute('href'), missing: true };
      const gr = go.getBoundingClientRect();
      const cs = getComputedStyle(go);
      const ccs = getComputedStyle(el);
      // is the CTA visually reachable at its own centre?
      const px = gr.left + gr.width / 2;
      const py = gr.top + gr.height / 2;
      const hit = document.elementFromPoint(px, py);
      const covered = !(hit && (go.contains(hit) || hit === go || hit.contains(go)));
      const hitDesc = hit
        ? hit.tagName.toLowerCase() + (typeof hit.className === 'string' && hit.className.trim() ? '.' + hit.className.trim().split(/\s+/).join('.') : '')
        : 'null (point outside the viewport)';
      return {
        i,
        kind: el.className.trim().split(/\s+/)[0],
        href: el.getAttribute('href'),
        w: +gr.width.toFixed(1),
        h: +gr.height.toFixed(1),
        display: cs.display,
        visibility: cs.visibility,
        opacity: +cs.opacity,
        // overflow past the card's padding box (positive = spilling out)
        spillRight: +(gr.right - cr.right).toFixed(1),
        spillBottom: +(gr.bottom - cr.bottom).toFixed(1),
        spillLeft: +(cr.left - gr.left).toFixed(1),
        cardOverflow: ccs.overflow,
        cardW: +cr.width.toFixed(1),
        cardH: +cr.height.toFixed(1),
        offCanvasRight: +(gr.right - document.documentElement.clientWidth).toFixed(1),
        covered,
        hitDesc,
        inViewportX: gr.left >= -0.5 && gr.right <= document.documentElement.clientWidth + 0.5,
      };
    }, i));
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(200);

  const bad = [];
  if (cards.length !== 38) bad.push(`expected 38 cards, found ${cards.length}`);
  const missing = cards.filter((c) => c.missing);
  const invisible = cards.filter((c) => !c.missing && (c.display === 'none' || c.visibility === 'hidden' || c.opacity < 0.99 || c.w < 1 || c.h < 1));
  const clipped = cards.filter((c) => !c.missing && (c.spillRight > 0.6 || c.spillBottom > 0.6 || c.spillLeft > 0.6));
  const offCanvas = cards.filter((c) => !c.missing && !c.inViewportX);
  const coveredC = cards.filter((c) => !c.missing && c.covered);
  const tooShort = cards.filter((c) => !c.missing && c.h < 40);

  const heights = cards.filter((c) => !c.missing).map((c) => c.h);
  const widths = cards.filter((c) => !c.missing).map((c) => c.w);
  const minH = Math.min(...heights), minW = Math.min(...widths);
  const minHCard = cards.find((c) => c.h === minH);
  const minWCard = cards.find((c) => c.w === minW);

  say(`cards found: ${cards.length} (pcard ${cards.filter((c) => c.kind === 'pcard').length}, mini ${cards.filter((c) => c.kind === 'mini').length})`);
  say(`CTA height: min ${minH}px (${minHCard && minHCard.href}), max ${Math.max(...heights)}px`);
  say(`CTA width : min ${minW}px (${minWCard && minWCard.href}), max ${Math.max(...widths)}px`);
  say(`A1 missing CTA: ${missing.length} | invisible: ${invisible.length} | clipped/spilling card: ${clipped.length} | off-canvas: ${offCanvas.length} | covered at centre: ${coveredC.length} | under 40px tall: ${tooShort.length}`);
  if (clipped.length) say('    clipped e.g.: ' + JSON.stringify(clipped.slice(0, 3)));
  if (tooShort.length) say('    short e.g.: ' + tooShort.slice(0, 5).map((c) => `${c.href} ${c.w}x${c.h}`).join(', '));
  if (coveredC.length) say('    covered e.g.: ' + coveredC.slice(0, 3).map((c) => `${c.href} (centre hit: ${c.hitDesc})`).join(', '));
  if (missing.length || invisible.length || clipped.length || offCanvas.length || coveredC.length || tooShort.length) bad.push('A1 CTA problems');
  say(`A1: ${missing.length + invisible.length + clipped.length + offCanvas.length + coveredC.length + tooShort.length === 0 && cards.length === 38 ? 'PASS' : 'FAIL'}`);

  // A2 horizontal overflow
  const ov = await page.evaluate(() => {
    const de = document.documentElement;
    const offenders = [];
    const vw = de.clientWidth;
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      /* An element parked entirely off-canvas to the LEFT (right edge <= 0) cannot cause
         horizontal overflow and is not visible: that is the standard off-screen pattern
         (e.g. .skip-link at left:-9999px, which springs to left:0 on keyboard focus, and
         is asserted separately in A2c). Only flag things that overflow the RIGHT edge or
         that straddle the left edge while partly visible. */
      if (r.right <= 0) return;
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
          left: +r.left.toFixed(1), right: +r.right.toFixed(1),
        });
      }
    });
    return {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 8),
      offenderCount: offenders.length,
    };
  });
  const noOverflow = ov.scrollWidth <= ov.innerWidth;
  say(`A2 scrollWidth ${ov.scrollWidth} vs innerWidth ${ov.innerWidth} (body scrollWidth ${ov.bodyScrollWidth}) -> ${noOverflow ? 'PASS' : 'FAIL'}`);
  if (ov.offenderCount) say(`    ${ov.offenderCount} elements crossing viewport edge: ` + ov.offenders.map((o) => `${o.sel} [${o.left},${o.right}]`).join(' | '));
  if (!noOverflow) bad.push('A2 horizontal overflow');

  // does it actually swipe sideways?
  const cdpHome = await page.target().createCDPSession();
  const sx0 = await page.evaluate(() => window.scrollX);
  await touchSwipe(cdpHome, dev.width - 30, Math.round(dev.height / 2), -(dev.width - 90), 0);
  await sleep(700);
  const sx1 = await page.evaluate(() => window.scrollX);
  say(`A2b horizontal swipe: scrollX ${sx0} -> ${sx1} -> ${sx1 === 0 ? 'PASS (page does not pan sideways)' : 'FAIL (page pans sideways)'}`);
  if (sx1 !== 0) bad.push('A2b page pans sideways');

  // A2c the skip-link is deliberately parked off-canvas; it must come back on focus
  const skip = await page.evaluate(() => {
    const a = document.querySelector('a.skip-link');
    if (!a) return { present: false };
    const before = a.getBoundingClientRect();
    a.focus();
    const after = a.getBoundingClientRect();
    const cs = getComputedStyle(a);
    a.blur();
    return {
      present: true,
      href: a.getAttribute('href'),
      targetExists: !!document.querySelector(a.getAttribute('href')),
      restingLeft: +before.left.toFixed(1),
      hiddenAtRest: before.right <= 0,
      focusedLeft: +after.left.toFixed(1),
      focusedRight: +after.right.toFixed(1),
      visibleOnFocus: after.left >= -0.5 && after.right <= document.documentElement.clientWidth + 0.5
        && after.width > 0 && after.height > 0 && cs.visibility !== 'hidden' && +cs.opacity > 0.99,
    };
  });
  const a2cok = skip.present && skip.hiddenAtRest && skip.visibleOnFocus && skip.targetExists;
  say(`A2c skip-link: off-canvas at rest (left ${skip.restingLeft}) -> on focus left ${skip.focusedLeft}, right ${skip.focusedRight}, jumps to "${skip.href}" (target exists: ${skip.targetExists}) -> ${a2cok ? 'PASS (intended off-screen pattern, not an overflow bug)' : 'FAIL'}`);
  if (!a2cok) bad.push('A2c skip-link does not become visible on focus');

  // A3 stat blocks
  const stats = await page.evaluate(() => {
    const grab = (sel) => [...document.querySelectorAll(sel)].map((e) => {
      const r = e.getBoundingClientRect();
      return { t: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 46), x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    });
    const overlaps = (a, b) => !(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5);
    const pairs = [];
    const all = { stat: grab('.stat'), achievement: grab('.achievement') };
    for (const k of Object.keys(all)) {
      const arr = all[k];
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        if (overlaps(arr[i], arr[j])) pairs.push(`${k}[${i}] x ${k}[${j}]`);
      }
    }
    return { stat: all.stat, achievement: all.achievement, overlaps: pairs };
  });
  const a3ok = stats.stat.length === 3 && stats.achievement.length === 3 && stats.overlaps.length === 0
    && stats.stat.every((s) => s.w > 0 && s.h > 0) && stats.achievement.every((s) => s.w > 0 && s.h > 0);
  say(`A3 .stat x${stats.stat.length}, .achievement x${stats.achievement.length}, overlapping pairs: ${stats.overlaps.length} -> ${a3ok ? 'PASS' : 'FAIL'}`);
  stats.stat.forEach((s, i) => say(`    .stat[${i}] ${s.w}x${s.h} @(${s.x},${s.y}) "${s.t}"`));
  stats.achievement.forEach((s, i) => say(`    .achievement[${i}] ${s.w}x${s.h} @(${s.x},${s.y}) "${s.t}"`));
  if (!a3ok) bad.push('A3 stats');

  // A4 screenshots at 390 only
  if (dev.width === 390) {
    await page.evaluate(() => document.querySelector('#production, .pcards, .cards')?.scrollIntoView({ block: 'start' }));
    await sleep(800);
    await page.screenshot({ path: OUT + '/m390-featured.png' });
    await page.evaluate(() => document.querySelector('.minis')?.scrollIntoView({ block: 'start' }));
    await sleep(800);
    await page.screenshot({ path: OUT + '/m390-minis.png' });
    await page.evaluate(() => document.querySelector('.pcard')?.scrollIntoView({ block: 'center' }));
    await sleep(600);
    const el = await page.$('.pcard');
    await el.screenshot({ path: OUT + '/m390-pcard-closeup.png' });
    const el2 = await page.$('.mini');
    await page.evaluate(() => document.querySelector('.mini')?.scrollIntoView({ block: 'center' }));
    await sleep(500);
    await el2.screenshot({ path: OUT + '/m390-mini-closeup.png' });
    say('A4 screenshots: m390-featured.png, m390-minis.png, m390-pcard-closeup.png, m390-mini-closeup.png');
  }

  if (errs.length) say('JS ERRORS (' + errs.length + '): ' + errs.slice(0, 4).join(' || '));
  else say('JS errors: none');
  say(`HOMEPAGE ${dev.label}: ${bad.length ? 'FAIL -> ' + bad.join(', ') : 'PASS'}`);
  await page.close();
}

/* ------------------------------------------------------- B) raft-kv PROJECT PAGE */
for (const dev of DEVICES) {
  const page = await browser.newPage();
  await page.setViewport({
    width: dev.width, height: dev.height, deviceScaleFactor: dev.dpr,
    isMobile: true, hasTouch: true,
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  say('\n===== PROJECT raft-kv.html ' + dev.label + ' =====');
  const bad = [];
  const cdp = await page.target().createCDPSession();

  try {
    await page.goto(`file://${SITE}/projects/raft-kv.html`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.$eval('.proj-viz iframe', (el) => el.scrollIntoView({ block: 'center' }));
    await sleep(4000);

    const frame = page.frames().find((f) => f.url().includes('/viz/raft-kv.html'));
    if (!frame) throw new Error('viz iframe never loaded');
    await frame.waitForSelector('#c', { timeout: 15000 });
    await sleep(2500);

    /* B0: pristine state, sampled at load BEFORE the harness touches anything. The old
       code asked for this only after B1b had already swiped across the viz, so it was
       reporting the harness's own interaction as a bug. */
    const resetAtLoad = await frame.$eval('#btnReset', (el) => el.hidden);
    const hintAtLoad = await frame.$eval('#hint', (el) => el.classList.contains('is-gone'));
    const b0ok = resetAtLoad === true && hintAtLoad === false;
    say(`B0 pristine at load (no interaction yet): #btnReset hidden=${resetAtLoad}, #hint is-gone=${hintAtLoad} -> ${b0ok ? 'PASS' : 'FAIL'}`);
    if (!b0ok) bad.push('B0 viz not in pristine state at load');

    // B1a: touch-action on the canvas inside the frame
    const ta = await frame.$eval('#c', (el) => ({
      touchAction: getComputedStyle(el).touchAction,
      w: el.getBoundingClientRect().width,
      h: el.getBoundingClientRect().height,
    }));
    const taOk = ta.touchAction === 'pan-y';
    say(`B1a canvas #c touch-action = "${ta.touchAction}" (canvas ${Math.round(ta.w)}x${Math.round(ta.h)}) -> ${taOk ? 'PASS (expected pan-y)' : 'FAIL (expected pan-y)'}`);
    if (!taOk) bad.push('B1a touch-action');

    // B1b: THE TRAP. vertical touch swipe starting on the iframe must scroll host page.
    // re-centre the iframe first
    await page.$eval('.proj-viz iframe', (el) => el.scrollIntoView({ block: 'center' }));
    await sleep(800);
    const box = await (await page.$('.proj-viz iframe')).boundingBox();
    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);
    say(`    iframe box on host page: x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}; swipe origin (${cx},${cy})`);

    const y0 = await page.evaluate(() => window.scrollY);
    await touchSwipe(cdp, cx, cy, 0, -260, 16, 16); // finger up = page scrolls down
    await sleep(1200);
    const y1 = await page.evaluate(() => window.scrollY);
    const scrolled = y1 - y0;
    const b1ok = scrolled > 60;
    say(`B1b VERTICAL touch swipe ON THE VIZ (dy=-260): scrollY ${y0} -> ${y1}  (delta ${scrolled}px) -> ${b1ok ? 'PASS' : 'FAIL'}`);
    if (!b1ok) bad.push('B1b VERTICAL SWIPE ON VIZ DOES NOT SCROLL THE PAGE');

    // control: same swipe on plain page body should scroll (sanity check of the harness)
    const c0 = await page.evaluate(() => window.scrollY);
    await touchSwipe(cdp, Math.round(dev.width / 2), Math.round(dev.height - 120), 0, -260, 16, 16);
    await sleep(1200);
    const c1 = await page.evaluate(() => window.scrollY);
    say(`    control swipe on ordinary page area: scrollY ${c0} -> ${c1} (delta ${c1 - c0}px) [harness sanity check]`);

    // B2: horizontal drag on the viz engages the view
    await page.$eval('.proj-viz iframe', (el) => el.scrollIntoView({ block: 'center' }));
    await sleep(800);
    const box2 = await (await page.$('.proj-viz iframe')).boundingBox();
    const dx = Math.round(box2.x + box2.width / 2);
    const dy = Math.round(box2.y + box2.height / 2);

    const resetBefore = await frame.$eval('#btnReset', (el) => el.hidden);
    const hintBefore = await frame.$eval('#hint', (el) => el.classList.contains('is-gone'));
    // informational only: by now the harness has already scroll-swiped over the viz in
    // B1b, and that scroll marks the view as engaged. Pristine state is asserted in B0.
    say(`    state after B1b's scroll-swipe (informational): #btnReset hidden=${resetBefore}, #hint is-gone=${hintBefore}`);

    const preScroll = await page.evaluate(() => window.scrollY);
    await touchSwipe(cdp, dx, dy, 130, 0, 14, 20); // horizontal drag
    await sleep(1200);
    const engaged = await frame.$eval('#btnReset', (el) => !el.hidden);
    const hintGone = await frame.$eval('#hint', (el) => el.classList.contains('is-gone'));
    const postScroll = await page.evaluate(() => window.scrollY);
    const b2ok = engaged && hintGone;
    say(`B2 HORIZONTAL touch drag on the viz: #btnReset visible=${engaged}, #hint is-gone=${hintGone} -> ${b2ok ? 'PASS' : 'FAIL'}`);
    say(`    (host scrollY during horizontal drag: ${preScroll} -> ${postScroll}, delta ${postScroll - preScroll})`);
    if (!b2ok) bad.push('B2 horizontal drag did not engage the view');

    // B1c: after engaging, a vertical swipe must STILL scroll the page (the real trap)
    await page.$eval('.proj-viz iframe', (el) => el.scrollIntoView({ block: 'center' }));
    await sleep(700);
    const box3 = await (await page.$('.proj-viz iframe')).boundingBox();
    const ex = Math.round(box3.x + box3.width / 2);
    const ey = Math.round(box3.y + box3.height / 2);
    const z0 = await page.evaluate(() => window.scrollY);
    await touchSwipe(cdp, ex, ey, 0, -240, 16, 16);
    await sleep(1200);
    const z1 = await page.evaluate(() => window.scrollY);
    const b1cok = z1 - z0 > 60;
    say(`B1c VERTICAL swipe on the viz AFTER it has been engaged: scrollY ${z0} -> ${z1} (delta ${z1 - z0}px) -> ${b1cok ? 'PASS' : 'FAIL'}`);
    if (!b1cok) bad.push('B1c vertical swipe after engaging does not scroll');

    // B3 horizontal overflow on the project page
    const ov = await page.evaluate(() => {
      const de = document.documentElement;
      const vw = de.clientWidth;
      const offenders = [];
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        // parked entirely off-canvas to the left (the .skip-link pattern): not visible,
        // cannot cause horizontal overflow, springs back to left:0 on keyboard focus
        if (r.right <= 0) return;
        if (r.right > vw + 1 || r.left < -1) offenders.push(el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\s+/).join('.') : ''));
      });
      return { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth, offenders: offenders.slice(0, 8), n: offenders.length };
    });
    const b3ok = ov.scrollWidth <= ov.innerWidth;
    say(`B3 scrollWidth ${ov.scrollWidth} vs innerWidth ${ov.innerWidth} -> ${b3ok ? 'PASS' : 'FAIL'}`);
    if (ov.n) say(`    ${ov.n} elements crossing viewport edge: ${ov.offenders.join(' | ')}`);
    if (!b3ok) bad.push('B3 horizontal overflow on project page');

    if (dev.width === 390) {
      await page.$eval('.proj-viz iframe', (el) => el.scrollIntoView({ block: 'center' }));
      await sleep(700);
      await page.screenshot({ path: OUT + '/m390-raftkv-viz.png' });
      say('    screenshot: m390-raftkv-viz.png');
    }
  } catch (e) {
    bad.push('FATAL ' + e.message);
    say('FATAL: ' + e.message);
  }

  if (errs.length) say('JS ERRORS (' + errs.length + '): ' + errs.slice(0, 5).join(' || '));
  else say('JS errors: none');
  say(`PROJECT raft-kv ${dev.label}: ${bad.length ? 'FAIL -> ' + bad.join(', ') : 'PASS'}`);
  await page.close();
}

await browser.close();
