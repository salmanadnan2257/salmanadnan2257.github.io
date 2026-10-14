// The ZaraiLink demo served under /demo/zarailink/: it loads with no console errors
// or failed requests, shows only its own fabricated data, and every view opens.
// Usage: node check-demo-zarailink.mjs [baseUrl] [--shot out.png]
// baseUrl defaults to a local static server on :8765 serving portfolio-website/.
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const base = (args.find(a => a.startsWith('http')) || 'http://127.0.0.1:8765').replace(/\/$/, '');
const shotIdx = args.indexOf('--shot');
const shot = shotIdx >= 0 ? args[shotIdx + 1] : null;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const failures = [];
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 857 });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') failures.push(`console ${m.type()}: ${m.text()}`); });
page.on('pageerror', e => failures.push(`page error: ${e.message}`));
page.on('requestfailed', r => failures.push(`request failed: ${r.url()}`));
page.on('response', r => { if (r.status() >= 400) failures.push(`HTTP ${r.status()}: ${r.url()}`); });

const res = await page.goto(`${base}/demo/zarailink/`, { waitUntil: 'networkidle0' });
if (!res || res.status() !== 200) failures.push(`demo returned ${res && res.status()}`);

const stats = await page.$$eval('#stat-records, #stat-companies, #stat-products', els => els.map(e => e.textContent));
if (stats.join('|') !== '125|4|3') failures.push(`stats strip shows ${stats.join('|')}, expected 125|4|3`);

for (const view of ['subscription', 'watchlist', 'dashboard']) {
  await page.click(`nav [data-view="${view}"], header [data-view="${view}"]`);
  const active = await page.$eval(`#view-${view}`, el => el.classList.contains('is-active'));
  if (!active) failures.push(`view ${view} did not open`);
}

// Trade Directory, the view the project page shows, from a clean load so no earlier
// click leaves focus styling on a nav link in the screenshot.
await page.goto(`${base}/demo/zarailink/`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.querySelector('[data-view="directory"][data-role="Supplier"]').click());
const cards = await page.$$eval('#view-directory .company-card, #view-directory [class*="card"]', els => els.length);
if (!cards) failures.push('directory rendered no company cards');
const text = await page.$eval('#view-directory', el => el.innerText);
for (const name of ['Meridian AgroTrade', 'Cascade Commodities', 'Sable Harvest']) {
  if (!text.includes(name)) failures.push(`directory missing fabricated company ${name}`);
}
const staleActive = await page.$$eval('.zl-navbar__links > a.is-active', els => els.map(e => e.textContent.trim()));
if (staleActive.length) failures.push(`nav still marks ${staleActive.join(', ')} active in the directory view`);
// Let the nav's 0.15s background transition finish before capturing.
if (shot) { await new Promise(r => setTimeout(r, 400)); await page.screenshot({ path: shot }); }

await browser.close();
if (failures.length) {
  console.log('FAIL\n' + failures.map(f => '  ' + f).join('\n'));
  process.exit(1);
}
console.log(`PASS ${base}/demo/zarailink/: 200, no console errors or failed requests, stats 125|4|3, all views open, ${cards} directory cards`);
