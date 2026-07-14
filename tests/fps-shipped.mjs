/* True pre-change baseline (commit 3a42ccf) vs the CURRENTLY SHIPPED build.
   Three arms round-robin: A = old, B = shipped, C = old again.
   A-vs-C is byte-identical code, so it measures the noise floor under the same
   load as A-vs-B. A regression is only real if |A-B| clears the |A-C| band. */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SITE = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website';
const SP = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/tests/out';
const BASE_REF = '3a42ccf';                    // last commit before the interaction layer
const THREE_JS = fs.readFileSync(path.join(SP, 'three.module.js'), 'utf8');
const FILES = ['raft-kv', 'urdu-slm', 'space-race-analysis', 'sqlmill', 'breakout-game', 'webgl-terrain-explorer'];
const REPS = 3, WIN = 4000;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const baseline = {}, shipped = {};
for (const f of FILES) {
  baseline[f] = execFileSync('git', ['-C', SITE, 'show', `${BASE_REF}:viz/${f}.html`], { maxBuffer: 1 << 28 }).toString();
  shipped[f] = fs.readFileSync(path.join(SITE, 'viz', `${f}.html`), 'utf8');
  if (sha(baseline[f]) === sha(shipped[f])) throw new Error(`${f}: baseline == shipped, nothing to compare`);
  if (!/kickView/.test(shipped[f])) throw new Error(`${f}: shipped file lacks the interaction layer`);
  if (/kickView/.test(baseline[f])) throw new Error(`${f}: baseline already has the interaction layer`);
}
console.log(`baseline=${BASE_REF} (no kickView) vs shipped working tree (has kickView) - verified for all ${FILES.length} files\n`);

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
               '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/viz\/([a-z0-9-]+)\.html$/);
  if (m && baseline[m[1]]) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(u.searchParams.get('arm') === 'B' ? shipped[m[1]] : baseline[m[1]]);
  }
  const fp = path.join(SITE, decodeURIComponent(u.pathname));
  if (!fp.startsWith(SITE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const PROBE = () => { window.__fire = 0; const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((n) => { window.__fire++; return cb(n); }); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errs = [];
async function once(name, arm) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1100, height: 700 });
    await page.evaluateOnNewDocument(PROBE);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (r.url().includes('cdn.jsdelivr.net') && r.url().endsWith('three.module.js'))
        return r.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: THREE_JS });
      r.continue();
    });
    page.on('pageerror', (e) => errs.push(`${name}[${arm}] ${e.message || e}`));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`${name}[${arm}] console: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${PORT}/viz/${name}.html?arm=${arm}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await sleep(2000);
    const a = await page.evaluate(() => window.__fire);
    await sleep(WIN);
    const b = await page.evaluate(() => window.__fire);
    if (b - a === 0) throw new Error('rendered no frames');
    return (b - a) / (WIN / 1000);
  } finally { await page.close().catch(() => {}); }
}
async function run(name, arm) {                 // a crashed page is a harness fault, not data
  for (let i = 0; i < 4; i++) {
    try { return await once(name, arm); }
    catch (e) { console.log(`  retry ${name}[${arm}]: ${String(e.message).slice(0, 50)}`); await sleep(1500); }
  }
  throw new Error(`${name}[${arm}] failed 4x`);
}

const out = [];
for (const name of FILES) {
  const A = [], B = [], C = [];
  for (let i = 0; i < REPS; i++) { A.push(await run(name, 'A')); B.push(await run(name, 'B')); C.push(await run(name, 'C')); }
  const ma = median(A), mb = median(B), mc = median(C);
  out.push({ name, ma, mb, mc, signal: (mb - ma) / ma * 100, noise: (mc - ma) / ma * 100, A, B, C });
  const r = out.at(-1);
  console.log(`${name}: old=${ma.toFixed(1)} new=${mb.toFixed(1)} old#2=${mc.toFixed(1)} | new-vs-old ${r.signal.toFixed(1)}% | noise ${r.noise.toFixed(1)}%`);
}
await browser.close(); server.close();
fs.writeFileSync(path.join(SP, 'fps-shipped.json'), JSON.stringify(out, null, 2));

console.log('\n=== OLD vs SHIPPED (SwiftShader software GL; RELATIVE ONLY, not real-world fps) ===');
console.log('file'.padEnd(24) + 'old'.padStart(7) + 'new'.padStart(7) + 'old#2'.padStart(7) + 'new vs old'.padStart(12) + 'noise (old vs old)'.padStart(20));
for (const r of out)
  console.log(r.name.padEnd(24) + r.ma.toFixed(1).padStart(7) + r.mb.toFixed(1).padStart(7) + r.mc.toFixed(1).padStart(7) +
    ((r.signal >= 0 ? '+' : '') + r.signal.toFixed(1) + '%').padStart(12) +
    ((r.noise >= 0 ? '+' : '') + r.noise.toFixed(1) + '%').padStart(20));
const sig = out.map(r => Math.abs(r.signal)), noi = out.map(r => Math.abs(r.noise));
console.log(`\n|new vs old| : mean ${(sig.reduce((a, b) => a + b) / sig.length).toFixed(1)}%  max ${Math.max(...sig).toFixed(1)}%`);
console.log(`|old vs old| : mean ${(noi.reduce((a, b) => a + b) / noi.length).toFixed(1)}%  max ${Math.max(...noi).toFixed(1)}%   <- identical code = pure noise`);
console.log('\nraw reps (old | new | old#2):');
for (const r of out) console.log('  ' + r.name.padEnd(24) + r.A.map(x => x.toFixed(1)).join('/') + '  |  ' + r.B.map(x => x.toFixed(1)).join('/') + '  |  ' + r.C.map(x => x.toFixed(1)).join('/'));
console.log('\nJS errors: ' + (errs.length ? '\n' + errs.join('\n') : 'none'));
