/**
 * Generate the ai.digitalise.agency social-share cards.
 *
 * The personal site's 39 cards are baked pixels: assets/og.png is "Salman Adnan"
 * in 100px type next to his photograph, and every assets/og/<slug>.png carries an
 * SA badge and a "Salman Adnan" byline. No text transform can touch them, so the
 * agency build renders its own set from the pages it has already transformed.
 *
 * Source of truth is the BUILD, not the repo: each card's title and description
 * are read from that page's own og:title / og:description after transformation,
 * so a card can never disagree with the page it represents.
 *
 * Deliberately no "Featured project" label. The personal cards carry it, but it is
 * only true of a few, and stamping it on all 38 would claim something unverified.
 * The domain goes there instead.
 *
 * Usage: node tools/make-og.mjs <build-dir>
 * Needs puppeteer-core, reused from tests/node_modules via NODE_PATH.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

// Reuse the puppeteer-core already installed under tests/ rather than adding a
// second 200MB copy. NODE_PATH does not apply to ESM imports, hence createRequire.
const HERE = dirname(fileURLToPath(import.meta.url));
const puppeteer = createRequire(join(HERE, '../tests/'))('puppeteer-core');

const BUILD = process.argv[2];
if (!BUILD) { console.error('usage: make-og.mjs <build-dir>'); process.exit(1); }

const FONT = readFileSync(join(BUILD, 'assets/fonts/space-grotesk.woff2')).toString('base64');
const LOGO = readFileSync(join(BUILD, 'assets/agency-logo.svg')).toString('base64');

const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&#39;/g, "'")
                 .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
};
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SHELL = body => `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family:'Space Grotesk'; src:url(data:font/woff2;base64,${FONT}) format('woff2'); font-weight:300 700; }
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;font-family:'Space Grotesk',sans-serif;background:#FFFDF5;
       display:flex;align-items:center;justify-content:center;-webkit-font-smoothing:antialiased}
  .badge{width:56px;height:56px;border:3px solid #000;border-radius:12px;background:#16130E;
         display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;letter-spacing:-1px}
</style>${body}`;

// Project card: mirrors the personal card's structure so the two sites feel like
// one system, with the SA badge and personal byline replaced.
const projectCard = (slug, title, desc) => SHELL(`
<div style="width:1128px;height:558px;border:4px solid #000;border-radius:28px;background:#FFFDF5;
            box-shadow:10px 10px 0 #C4B5FD;overflow:hidden;display:flex;flex-direction:column">
  <div style="height:116px;background:#C4B5FD;border-bottom:4px solid #000;display:flex;
              align-items:center;gap:20px;padding:0 34px">
    <div class="badge"><span style="color:#FFD93D">D</span><span style="color:#FFFDF5">A</span></div>
    <div style="font-size:30px;font-weight:600">${esc(slug)}</div>
    <div style="margin-left:auto;font-size:22px;font-weight:500;opacity:.72">digitalise.agency</div>
  </div>
  <div style="flex:1;padding:44px 40px 34px;display:flex;flex-direction:column">
    <div style="font-size:${title.length > 26 ? 52 : 64}px;font-weight:700;letter-spacing:-2px;line-height:1.06">${esc(title)}</div>
    <div style="font-size:27px;line-height:1.42;color:#4b463d;margin-top:20px;
                display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(desc)}</div>
    <div style="margin-top:auto;display:flex;align-items:center;gap:12px">
      <div style="width:14px;height:14px;border-radius:50%;background:#C4B5FD;border:2.5px solid #000"></div>
      <span style="font-size:25px;font-weight:600">Digitalise Agency</span>
    </div>
  </div>
</div>`);

// Homepage card: the logo takes the portrait's place, same as the hero.
const homeCard = (desc) => SHELL(`
<div style="display:flex;align-items:center;gap:52px;padding:0 74px;width:100%">
  <div style="flex:1">
    <div style="font-size:82px;font-weight:700;letter-spacing:-3.5px;line-height:1">Digitalise Agency</div>
    <div style="display:inline-block;background:#FFD93D;border:3px solid #000;border-radius:999px;
                padding:9px 26px;font-size:28px;font-weight:700;margin-top:20px">AI &amp; Full-Stack Engineering</div>
    <div style="font-size:27px;line-height:1.42;margin-top:26px;font-weight:500;
                display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(desc)}</div>
    <div style="display:flex;gap:14px;margin-top:28px">
      ${['38 projects', '703 tests', '2 in production'].map(t =>
        `<div style="border:2.5px solid #000;border-radius:999px;padding:7px 20px;font-size:21px;font-weight:600;background:#FBF6E6">${t}</div>`
      ).join('')}
    </div>
  </div>
  <div style="width:352px;height:352px;border:4px solid #000;border-radius:20px;background:#FFFDF5;
              box-shadow:10px 10px 0 #F03E3E;transform:rotate(1.5deg);padding:30px;
              display:flex;align-items:center;justify-content:center;flex:none">
    <img src="data:image/svg+xml;base64,${LOGO}" style="width:100%;height:100%;object-fit:contain">
  </div>
</div>`);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

const shoot = async (html, out) => {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
};

// Homepage
const idx = readFileSync(join(BUILD, 'index.html'), 'utf8');
await shoot(homeCard(meta(idx, 'og:description')), join(BUILD, 'assets/og.png'));
console.log('og.png');

// One card per project page, driven by that page's own transformed metadata.
mkdirSync(join(BUILD, 'assets/og'), { recursive: true });
let n = 0;
for (const f of readdirSync(join(BUILD, 'projects')).filter(f => f.endsWith('.html'))) {
  const html = readFileSync(join(BUILD, 'projects', f), 'utf8');
  const slug = basename(f, '.html');
  const title = meta(html, 'og:title').split(' · ')[0];
  await shoot(projectCard(slug, title, meta(html, 'og:description')), join(BUILD, `assets/og/${slug}.png`));
  n++;
}
console.log(`${n} project cards`);
await browser.close();
