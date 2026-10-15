// Every hosted demo under /demo/<name>/: loads with a 200, no console errors or failed
// requests, and survives a click on every visible button and nav link without an error.
// Usage: node check-demos.mjs [baseUrl] [name,name,...]
// baseUrl defaults to a local static server on :8765 serving portfolio-website/.
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8765').replace(/\/$/, '');
const names = (args.find((a) => !a.startsWith('http')) ||
  'agency-blog-saas,blog-posting-pipeline,reelflow-studio,cropbridge').split(',');

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
let failed = 0;
for (const name of names) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`console ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => errs.push(`request failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('dialog', async (d) => { errs.push(`unexpected dialog: ${d.message()}`); await d.dismiss(); });

  const res = await page.goto(`${base}/demo/${name}/`, { waitUntil: 'networkidle0' });
  if (!res || res.status() !== 200) errs.push(`demo returned ${res && res.status()}`);
  const title = await page.title();
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (scroll > 0) errs.push(`horizontal scroll of ${scroll}px`);

  // click every visible button and in-page nav link once, from a fresh load each time,
  // so one click's state cannot hide another's failure
  const count = await page.$$eval('button, a[href="#"], [data-view]', (els) => els.length);
  let clicked = 0;
  for (let i = 0; i < count; i++) {
    await page.goto(`${base}/demo/${name}/`, { waitUntil: 'networkidle0' });
    const ok = await page.evaluate((idx) => {
      const el = document.querySelectorAll('button, a[href="#"], [data-view]')[idx];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none' || el.disabled) return false;
      el.click();
      return true;
    }, i);
    if (ok) { clicked++; await new Promise((r) => setTimeout(r, 250)); }
  }
  const bad = errs.length > 0;
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'PASS'} ${name.padEnd(24)} "${title}" ${clicked}/${count} controls clicked` +
    (bad ? '\n  ' + [...new Set(errs)].slice(0, 6).join('\n  ') : ', no errors or failed requests'));
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
