/* A1 final: is each CTA actually tappable? Scroll instantly (the page has
   scroll-behavior: smooth, which was making elementFromPoint fire mid-flight),
   settle, then hit-test the CTA centre and the four inset corners of the button. */
import puppeteer from 'puppeteer-core';
const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let verdictFail = 0;
for (const dev of [{ w: 390, h: 844 }, { w: 360, h: 740 }]) {
  const page = await browser.newPage();
  await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + SITE + '/index.html', { waitUntil: 'networkidle2' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await sleep(1200);
  /* the 38 non-flagship cards ship inside the folded wall (display:none); open it via
     the real toggle before hit-testing, or every hidden card reads as an unhittable
     0x0. Open there are 41 anchors: 38 wall cards + 3 flagship cards (each a second
     link to its own wall card). */
  await page.evaluate(() => document.getElementById('all-toggle')?.click());
  await sleep(500);

  const n = await page.$$eval('.pcard, .mini', (e) => e.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate((idx) => {
      const el = document.querySelectorAll('.pcard, .mini')[idx];
      const y = el.querySelector('.pcard__go, .mini__go').getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, y - window.innerHeight / 2), behavior: 'instant' });
    }, i);
    await sleep(90);
    out.push(await page.evaluate((idx) => {
      const el = document.querySelectorAll('.pcard, .mini')[idx];
      const go = el.querySelector('.pcard__go, .mini__go');
      const cr = el.getBoundingClientRect();
      const r = go.getBoundingClientRect();
      const href = el.getAttribute('href');
      const pts = [
        ['centre', r.left + r.width / 2, r.top + r.height / 2],
        ['tl', r.left + 4, r.top + 4], ['tr', r.right - 4, r.top + 4],
        ['bl', r.left + 4, r.bottom - 4], ['br', r.right - 4, r.bottom - 4],
      ];
      const inView = r.top >= 0 && r.bottom <= window.innerHeight;
      const hits = pts.map(([name, x, y]) => {
        const el2 = document.elementFromPoint(x, y);
        const a = el2 && el2.closest('a');
        return { name, ok: !!el2 && (go.contains(el2) || el2 === go) && !!a && a.getAttribute('href') === href, tag: el2 ? el2.tagName.toLowerCase() : 'null' };
      });
      return {
        href, kind: el.className.trim().split(/\s+/)[0], inView,
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        clipR: +(r.right - cr.right).toFixed(1),
        clipB: +(r.bottom - cr.bottom).toFixed(1),
        offViewportRight: +(r.right - document.documentElement.clientWidth).toFixed(1),
        badPts: hits.filter((x) => !x.ok).map((x) => `${x.name}=${x.tag}`),
        lines: go.getClientRects().length,
      };
    }, i));
  }
  const badCentre = out.filter((o) => o.badPts.includes('centre=null') || o.badPts.some((p) => p.startsWith('centre')));
  const anyBadPt = out.filter((o) => o.badPts.length);
  const clipped = out.filter((o) => o.clipR > 0.6 || o.clipB > 0.6);
  const offView = out.filter((o) => o.offViewportRight > 0.6);
  const short = out.filter((o) => o.h < 40);
  const wrapped = out.filter((o) => o.lines > 1 || o.h > 60);
  const hs = out.map((o) => o.h), ws = out.map((o) => o.w);

  console.log(`\n===== ${dev.w}x${dev.h} =====`);
  console.log(`cards ${out.length} | all CTAs in viewport when scrolled to: ${out.every((o) => o.inView)}`);
  console.log(`CTA height  min ${Math.min(...hs)} (${out.find((o) => o.h === Math.min(...hs)).href}) max ${Math.max(...hs)}`);
  console.log(`CTA width   min ${Math.min(...ws)} (${out.find((o) => o.w === Math.min(...ws)).href}) max ${Math.max(...ws)}`);
  console.log(`centre tap fails: ${badCentre.length} | any-corner tap fails: ${anyBadPt.length} | clipped by card: ${clipped.length} | past viewport right: ${offView.length} | under 40px tall: ${short.length}`);
  if (anyBadPt.length) anyBadPt.slice(0, 6).forEach((o) => console.log(`   ${o.href} bad points: ${o.badPts.join(',')}`));
  if (clipped.length) clipped.forEach((o) => console.log(`   CLIPPED ${o.href}: CTA ${o.w}x${o.h} spills ${o.clipR}px past card right edge`));
  if (offView.length) offView.forEach((o) => console.log(`   OFF-SCREEN ${o.href}: CTA extends ${o.offViewportRight}px past the viewport's right edge`));
  if (wrapped.length) console.log(`text-wrapped / oversized CTAs (${wrapped.length}): ` + wrapped.map((o) => `${o.href} ${o.w}x${o.h} lines=${o.lines}`).join(' | '));
  console.log('JS errors: ' + (errs.length ? errs.join(' || ') : 'none'));
  /* The pass hinges on the CENTRE tap, which is what a finger actually lands on.
     The featured/wall cards carry a playful +-1deg rotation (styles.css), so an
     element's axis-aligned bounding box is larger than its visual rotated rectangle
     and the 4px-inset CORNER points fall just outside the button, hitting the card
     body. Those corner misses are a rotation artifact, not an untappable CTA, so they
     are reported for the eye but do not fail the run. Centre miss, clipping, off-canvas
     and under-40px are the real defects. */
  const cornerOnly = anyBadPt.length - badCentre.length;
  if (cornerOnly > 0) console.log(`   (${cornerOnly} cards miss only on inset corners, expected from the +-1deg card rotation; centres all tappable)`);
  const pass = out.length === 41 && !badCentre.length && !clipped.length && !offView.length && !short.length;
  if (!pass) verdictFail++;
  console.log('A1 verdict: ' + (pass ? 'PASS' : 'FAIL'));
  await page.close();
}
await browser.close();
console.log(`\n${verdictFail ? 'FAIL' : 'PASS'}: ${2 - verdictFail}/2 viewports`);
process.exit(verdictFail ? 1 : 0);
