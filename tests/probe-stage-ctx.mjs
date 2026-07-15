/* Locate the 2nd WebGL context the stage test counts. The stage test's counter
   increments on every getContext('webgl*') and NEVER decrements on context loss,
   so it counts cumulative creations per frame, not live contexts. This probe
   distinguishes the two: it tracks creations AND webglcontextlost per frame, and
   prints per-frame URL + created + lost + net, so we can see whether 2 means two
   live contexts (a real leak) or one live + one already-released (a counter quirk). */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const fp = path.join(SITE, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const PROBE = () => {
  window.__created = 0; window.__lost = 0;
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = gc.call(this, type, ...rest);
    if (c && /webgl/i.test(type)) {
      window.__created++;
      this.addEventListener('webglcontextlost', () => { window.__lost++; }, { once: true });
    }
    return c;
  };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const dev of [{ t: 'desktop 1280x800', w: 1280, h: 800, m: false }, { t: 'phone 390x844', w: 390, h: 844, m: true }]) {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: 1, isMobile: dev.m, hasTouch: dev.m });
  await page.evaluateOnNewDocument(PROBE);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.evaluate(() => document.getElementById('start-here')?.scrollIntoView({ block: 'center' }));
  await sleep(9000);

  console.log(`\n===== ${dev.t} =====`);
  let created = 0, lost = 0, net = 0;
  for (const f of page.frames()) {
    const r = await f.evaluate(() => ({ c: window.__created || 0, l: window.__lost || 0 })).catch(() => ({ c: 0, l: 0 }));
    if (r.c || f === page.mainFrame()) {
      const url = f.url().replace(`http://127.0.0.1:${PORT}`, '') || '(top)';
      console.log(`  frame ${url.slice(0, 60).padEnd(60)} created=${r.c} lost=${r.l} net=${r.c - r.l}`);
    }
    created += r.c; lost += r.l; net += r.c - r.l;
  }
  // also actually query each canvas for a live (non-lost) webgl context
  const liveNow = await page.evaluate(() => {
    let n = 0;
    for (const cv of document.querySelectorAll('canvas')) {
      const g = cv.getContext('webgl2') || cv.getContext('webgl');
      if (g && !g.isContextLost()) n++;
    }
    return n;
  }).catch(() => -1);
  console.log(`  TOTAL created=${created} lost=${lost} net-live=${net}  | top-frame live canvases (direct isContextLost check)=${liveNow}`);
  await browser.close();
}
server.close();
