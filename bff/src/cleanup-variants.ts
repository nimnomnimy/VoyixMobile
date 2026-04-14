/**
 * One-off script — deactivates all clothing variant items (e.g. w001-S-BLK)
 * that were seeded previously. Run once then delete.
 *
 * Usage (from bff/):
 *   npx tsx src/cleanup-variants.ts
 */
import 'dotenv/config';
import { ncrSiteRequest } from './lib/ncrClient.js';

const WOMENS_SIZES   = ['XS', 'S', 'M', 'L', 'XL'];
const MENS_SIZES     = ['S', 'M', 'L', 'XL', 'XXL'];
const KIDS_SIZES     = ['2', '4', '6', '8', '10'];
const WOMENS_COLOURS = ['BLK', 'WHT', 'NVY'];
const MENS_COLOURS   = ['BLK', 'WHT', 'NVY'];
const KIDS_COLOURS   = ['BLK', 'PNK', 'BLU'];

const VARIANTS: { id: string; departmentId: string; nodeId: string }[] = [];

for (const base of ['w001', 'w002', 'w003', 'w004'])
  for (const size of WOMENS_SIZES)
    for (const clr of WOMENS_COLOURS)
      VARIANTS.push({ id: `${base}-${size}-${clr}`, departmentId: 'Womens', nodeId: 'Womens' });

for (const base of ['m001', 'm002', 'm003'])
  for (const size of MENS_SIZES)
    for (const clr of MENS_COLOURS)
      VARIANTS.push({ id: `${base}-${size}-${clr}`, departmentId: 'Mens', nodeId: 'Mens' });

for (const base of ['k001', 'k002'])
  for (const size of KIDS_SIZES)
    for (const clr of KIDS_COLOURS)
      VARIANTS.push({ id: `${base}-${size}-${clr}`, departmentId: 'Kids & Baby', nodeId: 'Kids-Baby' });

async function main() {
  console.log(`Deactivating ${VARIANTS.length} variant items...\n`);
  let ok = 0, fail = 0;
  for (const v of VARIANTS) {
    const { status } = await ncrSiteRequest(
      `/catalog/v2/items/${encodeURIComponent(v.id)}`,
      {
        method: 'PUT',
        body: {
          shortDescription: { values: [{ locale: 'en-US', value: v.id }] },
          departmentId: v.departmentId,
          merchandiseCategory: { nodeId: v.nodeId },
          status: 'INACTIVE',
          version: 1,
        },
      }
    );
    if (status === 200 || status === 204 || status === 201 || status === 404) {
      ok++;
      process.stdout.write('.');
    } else {
      fail++;
      process.stdout.write('x');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`\n\nDone: ${ok} deactivated, ${fail} failed`);
}

main().catch((err) => { console.error(err); process.exit(1); });
