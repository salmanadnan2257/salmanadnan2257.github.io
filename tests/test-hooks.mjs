/* Lever 1 + 2 verification: at 1280x800, 390x844 and 360x740, every one of the 38
   cards renders with its hook CTA and its number badge fully inside the card, no page
   overflows sideways, and the console is clean. Screenshots for a human look. */
import puppeteer from 'puppeteer-core';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const OUT = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/tests/out';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWS = [
  { tag: 'd1280', w: 1280, h: 800, mobile: false },
  { tag: 'm390', w: 390, h: 844, mobile: true },
  { tag: 'm360', w: 360, h: 740, mobile: true },
];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'],
});

let failed = 0;
for (const v of VIEWS) {
  const page = await browser.newPage();
  await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.mobile });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file://' + SITE + '/index.html', { waitUntil: 'networkidle2' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await sleep(1200);

  const bad = [];
  const n = await page.$$eval('.pcard, .mini', (e) => e.length);
  if (n !== 38) bad.push(`${n} cards, expected 38`);

  /* measure each card with it scrolled into view (getBoundingClientRect is fine either
     way, but reveal animations are not, so force everything visible first) */
  await page.evaluate(() => document.querySelectorAll('[class*=reveal]').forEach((e) => e.classList.add('is-visible', 'in')));
  await sleep(300);

  const cards = await page.$$eval('.pcard, .mini', (els) => els.map((el) => {
    const cr = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const pad = { l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight), b: parseFloat(cs.paddingBottom) };
    const bw = parseFloat(cs.borderLeftWidth);
    const box = { l: cr.left + bw + pad.l, r: cr.right - bw - pad.r, b: cr.bottom - bw - pad.b };
    const out = { href: el.getAttribute('href'), aria: el.getAttribute('aria-label'), spills: [] };
    for (const sel of ['.pcard__go, .mini__go', '.pcard__metric, .mini__metric']) {
      const q = el.querySelector(sel);
      if (!q) { out.spills.push(sel + ' MISSING'); continue; }
      const r = q.getBoundingClientRect();
      const name = sel.split('_').pop();
      if (r.right > box.r + 0.6) out.spills.push(`${name} right +${(r.right - box.r).toFixed(1)}`);
      if (r.left < box.l - 0.6) out.spills.push(`${name} left -${(box.l - r.left).toFixed(1)}`);
      if (r.bottom > box.b + 0.6) out.spills.push(`${name} bottom +${(r.bottom - box.b).toFixed(1)}`);
      if (r.width < 1 || r.height < 1) out.spills.push(`${name} not rendered`);
      if (sel.includes('go')) { out.goW = +r.width.toFixed(0); out.goH = +r.height.toFixed(0); out.go = q.textContent.trim().replace(/\s+/g, ' '); }
      else { out.metric = q.textContent.trim(); out.mW = +r.width.toFixed(0); }
    }
    return out;
  }));

  const spilling = cards.filter((c) => c.spills.length);
  if (spilling.length) bad.push(`${spilling.length} cards with a spilling CTA/number: ` + spilling.slice(0, 4).map((c) => `${c.href} [${c.spills.join('; ')}]`).join(' | '));
  const noAria = cards.filter((c) => !c.aria || c.aria.length < 8);
  if (noAria.length) bad.push(`${noAria.length} cards without an aria-label`);

  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (ov.sw > ov.iw) bad.push(`horizontal overflow: scrollWidth ${ov.sw} > innerWidth ${ov.iw}`);
  if (errs.length) bad.push(`${errs.length} JS errors: ${errs[0].slice(0, 90)}`);

  console.log(`\n===== ${v.w}x${v.h} =====`);
  console.log(`cards ${cards.length} | CTA h ${Math.min(...cards.map((c) => c.goH))}-${Math.max(...cards.map((c) => c.goH))}px, w ${Math.min(...cards.map((c) => c.goW))}-${Math.max(...cards.map((c) => c.goW))}px | number badges ${cards.filter((c) => c.metric).length}`);
  console.log(`scrollWidth ${ov.sw} vs innerWidth ${ov.iw} | JS errors ${errs.length}`);
  console.log(bad.length ? 'FAIL\n  ' + bad.join('\n  ') : 'PASS: 38 cards, nothing clipped, no sideways scroll, clean console');
  if (bad.length) failed++;

  for (const [name, sel] of [['prod', '#production'], ['core', '#work'], ['apps', '#apps'], ['minis', '.minis']]) {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start', behavior: 'instant' }), sel);
    await sleep(500);
    await page.screenshot({ path: `${OUT}/hook-${v.tag}-${name}.png` });
  }
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
