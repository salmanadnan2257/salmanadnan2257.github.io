/* Post-domain-swap check: index + 3 project pages must render with zero JS
   errors and zero failed LOCAL requests, and their canonical/og tags must all
   carry the real domain. External hosts (cdn, cal.com) are reported separately
   because this sandbox has no network and their failure is not a site defect. */
import puppeteer from 'puppeteer-core';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const BASE = 'https://salmanadnan.com';
const PAGES = [
  'index.html',
  'projects/raft-kv.html',
  'projects/n8n-automations.html',
  'projects/webgl-terrain-explorer.html',
];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});

let bad = 0;
for (const rel of PAGES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const jsErrors = [];
  const localFails = [];
  const extFails = [];
  page.on('pageerror', (e) => jsErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') jsErrors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => {
    const u = r.url();
    (u.startsWith('file://') ? localFails : extFails).push(
      `${u.replace('file://' + SITE, '')} (${r.failure()?.errorText})`);
  });

  // 'load' not 'networkidle2': the cal.com and three.js/jsdelivr iframes are
  // external and this sandbox has no network, so idle never arrives.
  await page.goto('file://' + SITE + '/' + rel, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));

  const meta = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel=canonical]')?.href,
    ogUrl: document.querySelector('meta[property="og:url"]')?.content,
    ogImg: document.querySelector('meta[property="og:image"]')?.content,
    twImg: document.querySelector('meta[name="twitter:image"]')?.content,
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => s.textContent).join(' '),
    title: document.title,
  }));

  const expect = rel === 'index.html' ? `${BASE}/` : `${BASE}/${rel}`;
  const probs = [];
  if (meta.canonical !== expect) probs.push(`canonical ${meta.canonical} != ${expect}`);
  if (meta.ogUrl !== expect) probs.push(`og:url ${meta.ogUrl} != canonical`);
  if (!meta.ogImg?.startsWith(BASE)) probs.push(`og:image not on real domain: ${meta.ogImg}`);
  if (meta.twImg !== meta.ogImg) probs.push('twitter:image != og:image');
  if (meta.jsonld.includes('salmanadnan2257.github.io')) probs.push('JSON-LD still has old host');
  if (jsErrors.length) probs.push(...jsErrors);
  if (localFails.length) probs.push(...localFails.map((f) => 'FAILED LOCAL REQUEST: ' + f));

  const ok = probs.length === 0;
  if (!ok) bad++;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${rel}`);
  console.log(`      title      ${meta.title}`);
  console.log(`      canonical  ${meta.canonical}`);
  console.log(`      og:url     ${meta.ogUrl}`);
  console.log(`      og:image   ${meta.ogImg}`);
  console.log(`      js errors  ${jsErrors.length}   local failed reqs ${localFails.length}   external failed reqs ${extFails.length}`);
  if (extFails.length) console.log(`      (external, no network in sandbox) ${[...new Set(extFails.map((e) => e.split('/')[2]))].join(', ')}`);
  for (const p of probs) console.log(`      -> ${p}`);
  await page.close();
}

await browser.close();
console.log(`\n${PAGES.length - bad}/${PAGES.length} pages clean.`);
process.exit(bad ? 1 : 0);
