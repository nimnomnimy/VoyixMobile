/**
 * Cleanup script — deletes old base clothing item codes from BSP catalog.
 * Run this BEFORE or AFTER seed-catalog.ts to remove the old generic entries
 * (w001–w006, m001–m004, k001–k004) that showed "Select size & colour" in the app.
 *
 * Usage (from bff/):
 *   npx tsx src/cleanup-clothing.ts
 */
import 'dotenv/config';
import { ncrSiteRequest } from './lib/ncrClient.js';

// Old base clothing codes → their original category (needed for the PUT body)
const OLD_CODES: { id: string; category: string }[] = [
  { id: 'w001', category: 'Womens' },
  { id: 'w002', category: 'Womens' },
  { id: 'w003', category: 'Womens' },
  { id: 'w004', category: 'Womens' },
  { id: 'w005', category: 'Womens' },
  { id: 'w006', category: 'Womens' },
  { id: 'm001', category: 'Mens' },
  { id: 'm002', category: 'Mens' },
  { id: 'm003', category: 'Mens' },
  { id: 'm004', category: 'Mens' },
  { id: 'k001', category: 'Kids-Baby' },
  { id: 'k002', category: 'Kids-Baby' },
  { id: 'k003', category: 'Kids-Baby' },
  { id: 'k004', category: 'Kids-Baby' },
];

function log(icon: string, msg: string) {
  console.log(`${icon}  ${msg}`);
}

async function deleteItem(item: { id: string; category: string }): Promise<boolean> {
  const body = {
    shortDescription: { values: [{ locale: 'en-US', value: item.id }] },
    departmentId: item.category,
    merchandiseCategory: { nodeId: item.category },
    status: 'INACTIVE',
    version: 1,
  };
  const { status } = await ncrSiteRequest(
    `/catalog/v2/items/${encodeURIComponent(item.id)}`,
    { method: 'PUT', body }
  );
  return status === 200 || status === 204 || status === 201 || status === 404;
}

async function main() {
  log('🧹', `Deactivating ${OLD_CODES.length} old base clothing codes in BSP…\n`);

  let ok = 0, fail = 0;

  for (const item of OLD_CODES) {
    const success = await deleteItem(item);
    if (success) {
      ok++;
      log('✅', `[inactive] ${item.id}`);
    } else {
      fail++;
      log('❌', `[failed]   ${item.id}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log('\n──────────────────────────────────────');
  log('🗑 ', `Deactivated: ${ok}, Failed: ${fail}`);
  if (fail > 0) {
    console.log('\nFailed items may need to be deactivated manually in the BSP dashboard.');
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
