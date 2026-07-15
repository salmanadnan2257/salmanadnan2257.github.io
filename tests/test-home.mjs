/* Homepage: every card must carry a real, visible, clickable CTA button that
   lands on that project's page, the stat blocks must be trimmed, and the page
   must be clean of JS errors. Screenshots for a human look at the design. */
import puppeteer from 'puppeteer-core';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const OUT = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/tests/out';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('file://' + SITE + '/index.html', { waitUntil: 'networkidle2' });
/* the page sets scroll-behavior: smooth. Puppeteer computes a click point and then
   clicks it, so a button still gliding into place gets missed and the click lands on
   whatever is now under the cursor. Make scrolling instant for the harness. */
await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
await new Promise((r) => setTimeout(r, 1200));

/* The 38 non-flagship cards ship inside the folded project wall (display:none for
   scripted visitors); open it via the real toggle before measuring, or every card
   inside it reads as a 0x0, unclickable element. Once open there are 39 anchors:
   the 38 wall cards plus the flagship, which is a deliberate second link to sqlmill. */
await page.evaluate(() => document.getElementById('all-toggle')?.click());
await new Promise((r) => setTimeout(r, 500));

const bad = [];

/* every card CTA: visible, has a solid background, a hard border, and its card
   points at a real project page */
const cards = await page.$$eval('.pcard, .mini', (els) => els.map((el) => {
  const go = el.querySelector('.pcard__go, .mini__go');
  if (!go) return { href: el.getAttribute('href'), missing: true };
  const cs = getComputedStyle(go);
  const r = go.getBoundingClientRect();
  return {
    href: el.getAttribute('href'),
    isFlag: el.classList.contains('pcard--flag'),
    text: go.textContent.trim().replace(/\s+/g, ' '),
    bg: cs.backgroundColor,
    border: cs.borderTopWidth,
    shadow: cs.boxShadow !== 'none',
    w: Math.round(r.width),
    h: Math.round(r.height),
    upper: cs.textTransform,
  };
}));

/* 39 anchors: 38 wall cards + the flagship (a deliberate second link to sqlmill,
   so exactly one duplicate href and one duplicate hook are expected). */
if (cards.length !== 39) bad.push(`expected 39 card anchors, found ${cards.length}`);
const distinctHrefs = new Set(cards.map((c) => c.href)).size;
if (distinctHrefs !== 38) bad.push(`expected 38 distinct project links, found ${distinctHrefs}`);
const hooks = new Map();   // hook -> href it first appeared on
for (const c of cards) {
  if (c.missing) { bad.push(`card ${c.href} has no CTA`); continue; }
  if (!c.href || !c.href.startsWith('projects/')) bad.push(`CTA does not lead to a project page: ${c.href}`);
  if (c.bg === 'rgba(0, 0, 0, 0)') bad.push(`${c.href}: CTA has no fill`);
  if (parseFloat(c.border) < 3) bad.push(`${c.href}: CTA border ${c.border}`);
  if (!c.shadow) bad.push(`${c.href}: CTA has no shadow`);
  if (c.h < 30 || c.w < 90) bad.push(`${c.href}: CTA too small (${c.w}x${c.h})`);
  /* the CTA must now be a SPECIFIC hook, not the old generic label. Short enough to
     sit in a button, distinct from every other card, and never "view project". */
  const hook = c.text.replace(/\s*→\s*$/, '').trim();
  const words = hook.split(/\s+/).length;
  if (/view project/i.test(hook)) bad.push(`${c.href}: CTA is still the generic label`);
  if (words < 3 || words > 6) bad.push(`${c.href}: CTA is ${words} words ("${hook}")`);
  /* A repeated hook is only wrong when it lands on a DIFFERENT project. The flagship
     and its wall card both point at sqlmill, so their shared hook is intended. */
  const key = hook.toLowerCase();
  if (hooks.has(key) && hooks.get(key) !== c.href) bad.push(`${c.href}: CTA duplicates another card ("${hook}")`);
  if (!hooks.has(key)) hooks.set(key, c.href);
}

/* every card carries exactly one hard number, and it must be visible */
const metrics = await page.$$eval('.pcard, .mini', (els) => els.map((el) => {
  const m = el.querySelectorAll('.pcard__metric, .mini__metric');
  return { href: el.getAttribute('href'), n: m.length, text: m[0] ? m[0].textContent.trim() : null };
}));
for (const m of metrics) {
  if (m.n !== 1) bad.push(`${m.href}: ${m.n} number badges (expected 1)`);
  if (m.n === 1 && !m.text) bad.push(`${m.href}: number badge is empty`);
}

/* the CTA is inside the card link, so clicking it must navigate */
const before = page.url();
await page.$eval('.pcard .pcard__go', (el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
await new Promise((r) => setTimeout(r, 400));
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
  page.click('.pcard .pcard__go'),
]);
await new Promise((r) => setTimeout(r, 600));
const after = page.url();
if (after === before || !after.includes('/projects/')) bad.push(`clicking the CTA did not open a project page (${after})`);
/* back to the homepage for the remaining checks. goBack can race with the project
   page's own loading and leave us stranded there, so make the return deterministic. */
await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('#production'))) {
  await page.goto('file://' + SITE + '/index.html', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));
}

/* stats trimmed */
const heroStats = await page.$$eval('.stats__row .stat', (e) => e.length);
const achievements = await page.$$eval('.achievement', (e) => e.length);
if (heroStats > 3) bad.push(`hero strip still has ${heroStats} stats`);
if (achievements > 3) bad.push(`achievements grid still has ${achievements} stats`);

/* no number is claimed twice across the two blocks */
const nums = await page.$$eval('.stat__num, .achievement-stat', (e) => e.map((x) => x.textContent.trim()));
const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
if (dupes.length) bad.push('duplicate stat numbers across blocks: ' + dupes.join(', '));

/* screenshots for the eye */
await page.$eval('#production', (el) => el.scrollIntoView({ block: 'start' }));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: OUT + '/home-featured-cards.png' });
await page.$eval('.minis', (el) => el.scrollIntoView({ block: 'start' }));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: OUT + '/home-mini-cards.png' });
await page.$eval('#achievements', (el) => el.scrollIntoView({ block: 'center' }));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: OUT + '/home-achievements.png' });

if (errs.length) bad.push(errs.length + ' js errors: ' + errs[0].slice(0, 100));

console.log('cards checked:', cards.length, '| hero stats:', heroStats, '| achievements:', achievements);
console.log('distinct CTA hooks:', hooks.size, '| number badges:', metrics.filter((m) => m.n === 1).length);
console.log('stat numbers on the page:', nums.join(' , '));
if (bad.length) { console.log('\nFAIL'); bad.slice(0, 12).forEach((b) => console.log('  ' + b)); }
else console.log('\nPASS: 39 card anchors (38 distinct projects + flagship duplicate of sqlmill), each a distinct specific hook + one number, all pointing at project pages, click navigates, stats trimmed, no JS errors');

await browser.close();
process.exit(bad.length ? 1 : 0);
