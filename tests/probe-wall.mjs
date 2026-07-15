/* Verifies the folded project wall (README items 10 & 12), which the pre-wall
   harnesses (home/hooks/mobile/cta-tap) never open, so they measure the 38
   hidden cards as 0x0 and fail. This proves the intended behaviour directly:
   folded at load, flagship visible; open it and all 38 cards render with a real,
   whole-card-tappable CTA; 38 distinct hrefs + 1 flagship duplicate = 39 anchors;
   no horizontal scroll and no JS errors in either state. */
import puppeteer from 'puppeteer-core';
const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });

let failures = 0;
for (const dev of [{ w: 1280, h: 800, label: 'desktop' }, { w: 390, h: 844, label: 'phone', mobile: true }]) {
  const page = await browser.newPage();
  await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: dev.mobile ? 3 : 1, isMobile: !!dev.mobile, hasTouch: !!dev.mobile });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' }).catch(() => {});
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + SITE + '/index.html', { waitUntil: 'networkidle2' });
  await sleep(800);

  const bad = [];
  const say = (s) => console.log('  ' + s);
  console.log(`\n===== ${dev.label} ${dev.w}x${dev.h} =====`);

  // --- FOLDED state ---
  const folded = await page.evaluate(() => {
    const wall = document.querySelector('.allproj, #all-projects');
    const toggle = document.querySelector('#all-toggle');
    const flag = document.querySelector('.pcard--flag');
    const jsClass = document.documentElement.classList.contains('js');
    const wallDisplay = wall ? getComputedStyle(wall).display : 'MISSING';
    const flagVisible = flag ? flag.getBoundingClientRect().height > 40 : false;
    // tab-stops inside the folded wall (item 10: nothing focusable while folded)
    const focusables = wall ? [...wall.querySelectorAll('a,button,[tabindex]')].filter((e) => {
      const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    }).length : -1;
    return { jsClass, wallDisplay, flagVisible, aria: toggle?.getAttribute('aria-expanded'),
             toggleText: toggle?.textContent.trim(), hasToggle: !!toggle };
  });
  say(`folded: js=${folded.jsClass} wallDisplay=${folded.wallDisplay} flagVisible=${folded.flagVisible} toggle="${folded.toggleText}" aria-expanded=${folded.aria}`);
  if (folded.wallDisplay !== 'none') bad.push('wall not folded at load (display ' + folded.wallDisplay + ')');
  if (!folded.flagVisible) bad.push('flagship not visible at load');
  if (folded.aria !== 'false') bad.push('toggle aria-expanded != false at load');

  const noHScrollFolded = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!noHScrollFolded) bad.push('horizontal scroll while folded');

  // --- OPEN it via the real toggle ---
  await page.click('#all-toggle');
  await sleep(700);

  const open = await page.evaluate(() => {
    const wall = document.querySelector('.allproj, #all-projects');
    const toggle = document.querySelector('#all-toggle');
    const cards = [...document.querySelectorAll('.pcard, .mini')];
    let goOk = 0, goZero = 0, tapWholeCard = 0;
    const zeros = [];
    for (const c of cards) {
      const go = c.querySelector('.pcard__go, .mini__go');
      const r = go ? go.getBoundingClientRect() : { width: 0, height: 0 };
      if (r.height >= 40 && r.width >= 40) goOk++; else { goZero++; if (go) zeros.push(c.getAttribute('href')); }
      // whole-card tap: scroll the card to viewport centre first (elementFromPoint
      // only sees on-screen points), then hit-test its centre.
      c.scrollIntoView({ block: 'center', behavior: 'instant' });
      const cr = c.getBoundingClientRect();
      const href = c.getAttribute('href');
      const el = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
      const a = el && el.closest('a');
      if (a && a.getAttribute('href') === href) tapWholeCard++;
    }
    const hrefs = cards.map((c) => c.getAttribute('href'));
    const distinct = new Set(hrefs);
    const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
    return { wallDisplay: getComputedStyle(wall).display, aria: toggle?.getAttribute('aria-expanded'),
             toggleText: toggle?.textContent.trim(), count: cards.length, goOk, goZero, zeros: zeros.slice(0, 6),
             tapWholeCard, distinct: distinct.size, dupes: [...new Set(dupes)] };
  });
  say(`open:   wallDisplay=${open.wallDisplay} aria-expanded=${open.aria} toggle="${open.toggleText}"`);
  say(`open:   anchors=${open.count} distinctHrefs=${open.distinct} dupes=${JSON.stringify(open.dupes)}`);
  say(`open:   CTA rendered(>=40px)=${open.goOk} zero=${open.goZero}${open.zeros.length ? ' e.g. ' + open.zeros.join(',') : ''}`);
  say(`open:   whole-card tap resolves to its own link: ${open.tapWholeCard}/${open.count}`);
  if (open.aria !== 'true') bad.push('toggle aria-expanded != true after open');
  if (open.wallDisplay === 'none') bad.push('wall still display:none after open');
  if (open.count !== 39) bad.push('anchors ' + open.count + ' != 39 (38 wall + 1 flagship)');
  if (open.distinct !== 38) bad.push('distinct project hrefs ' + open.distinct + ' != 38');
  if (open.goZero > 0) bad.push(open.goZero + ' CTAs still 0x0 after open');
  if (open.tapWholeCard !== open.count) bad.push('whole-card tap failed on ' + (open.count - open.tapWholeCard) + ' cards');

  const noHScrollOpen = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!noHScrollOpen) bad.push('horizontal scroll after opening wall');
  say(`no horizontal scroll: folded=${noHScrollFolded} open=${noHScrollOpen} | JS errors: ${errs.length}`);
  if (errs.length) { bad.push(errs.length + ' JS errors'); errs.slice(0, 3).forEach((e) => say('   ' + e.slice(0, 120))); }

  console.log(`  ${dev.label}: ${bad.length ? 'FAIL -> ' + bad.join('; ') : 'PASS'}`);
  if (bad.length) failures++;
  await page.close();
}
await browser.close();
console.log(`\n${failures ? 'FAIL' : 'PASS'}: ${2 - failures}/2 viewports`);
process.exit(failures ? 1 : 0);
