/* Proves the shared interaction runtime is byte-identical across all 38 viz files.
   The block runs from the "direct manipulation" banner to the end of the file.
   The only legitimate per-file difference inside it is the PNG download filename,
   which is normalised before hashing; the count of normalised lines is reported so
   a file that quietly lost the line cannot hide. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DIR = '/home/rolex/Salman Adnan/Programming/Portfolio/portfolio-website/viz';
const MARK = '/* ================= direct manipulation =================';

const files = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
const byHash = new Map();

for (const f of files) {
  const src = readFileSync(join(DIR, f), 'utf8');
  const i = src.indexOf(MARK);
  if (i === -1) { console.log('NO RUNTIME BLOCK: ' + f); process.exit(1); }
  const block = src.slice(i);
  const pngLines = (block.match(/a\.download = '[^']*-3d\.png';/g) || []).length;
  const norm = block.replace(/a\.download = '[^']*-3d\.png';/g, "a.download = '<NAME>-3d.png';");
  const h = createHash('sha256').update(norm).digest('hex');
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(`${f} (${block.length}B, ${pngLines} png line)`);
}

console.log(`files: ${files.length}`);
console.log(`distinct runtime-block hashes: ${byHash.size}`);
for (const [h, fs] of byHash) {
  console.log(`\n  ${h}\n    ${fs.length} files: ${fs.map((x) => x.split(' ')[0]).join(', ')}`);
  console.log(`    sizes/png-lines: ${[...new Set(fs.map((x) => x.slice(x.indexOf('('))))].join(' | ')}`);
}
process.exit(byHash.size === 1 ? 0 : 1);
