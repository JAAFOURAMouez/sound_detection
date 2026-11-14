// Mesure le bundle initial (ce que charge index.html, hors modèles et vues chargées à la
// demande), compressé en gzip, et échoue au-delà du budget de la feuille de route.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 300;
const dist = process.argv[2] ?? 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
if (assets.length === 0) throw new Error(`Aucun script ni style trouvé dans ${dist}/index.html`);

let total = 0;
for (const asset of [...new Set(assets)]) {
  const size = gzipSync(readFileSync(join(dist, asset)), { level: 9 }).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} Ko  ${asset}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} Ko  total (budget ${String(BUDGET_KB)} Ko)`);
if (total > BUDGET_KB * 1024) {
  console.error('Bundle initial au-delà du budget');
  process.exit(1);
}
