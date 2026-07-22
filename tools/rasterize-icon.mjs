/**
 * Render an SVG icon to PNG at a given square size.
 *
 * This exists because ImageMagick, which build-agency.py used to shell out to,
 * cannot be trusted with these files. Its SVG reader silently drops a
 * `fill="url(#id)"` gradient, so the agency mark, whose whole colour is one
 * blue-to-white gradient, came out as a black shape on a near-black tile: an
 * invisible icon. It also aborts outright on an XML comment containing a double
 * hyphen. Neither failure is loud, and the old call passed check=False, so a
 * broken render left the previous PNG in place and the build reported success.
 *
 * Chrome renders these files the same way the browsers serving them will, which
 * is the only rendering that matters for an icon.
 *
 * Usage: node tools/rasterize-icon.mjs <in.svg> <out.png> <size>
 * Exits non-zero on any failure, so a caller running under `set -e` stops.
 *
 * Needs puppeteer-core, reused from tests/node_modules via createRequire, the
 * same way tools/make-og.mjs does.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const puppeteer = createRequire(join(HERE, '../tests/'))('puppeteer-core');

const [src, out, sizeArg] = process.argv.slice(2);
if (!src || !out || !sizeArg) {
  console.error('usage: node tools/rasterize-icon.mjs <in.svg> <out.png> <size>');
  process.exit(2);
}
const size = Number(sizeArg);
if (!Number.isFinite(size) || size < 1) {
  console.error(`bad size: ${sizeArg}`);
  process.exit(2);
}

const svg = readFileSync(src, 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  /* The width and height attributes on the file itself are whatever the artwork
     was drawn at; the CSS below overrides them so one source renders at any size.
     omitBackground keeps the alpha channel, so an icon that does not fill its own
     square stays transparent rather than picking up white. */
  await page.setContent(
    `<style>*{margin:0;padding:0}` +
    `html,body{width:${size}px;height:${size}px;overflow:hidden}` +
    `svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    { waitUntil: 'load' });
  await page.screenshot({ path: out, omitBackground: true });
  console.log(`  ${out}  ${size}x${size}`);
} finally {
  await browser.close();
}
