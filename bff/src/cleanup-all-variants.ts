/**
 * Deactivates every BSP item whose code contains a hyphen (variant items)
 * plus any base items not in the desired flat catalog.
 * Run once: npx tsx src/cleanup-all-variants.ts
 */
import 'dotenv/config';
import { ncrSiteRequest } from './lib/ncrClient.js';

// The exact set of base items we want to keep ACTIVE
const KEEP = new Set([
  '1','2','3','4','5','6',
  'e001','e002','e003','e004',
  'h001','h002','h003','h004','h005',
  'k001','k002',
  'm001','m002','m003',
  't001','t002','t003','t004',
  'w001','w002','w003','w004',
  'y001','y002','y003','y004',
]);

// Fetch all active items
const { status, data } = await ncrSiteRequest<any>(
  '/catalog/v2/item-details/search?itemStatus=ACTIVE&pageSize=200&sortField=ITEM_CODE&sortDirection=ASC'
);
if (status !== 200) { console.error('Fetch failed', status); process.exit(1); }

const allItems: any[] = (data?.pageContent ?? []).map((e: any) => e.item ?? e);
const toDeactivate = allItems.filter((i: any) => {
  const code: string = i.itemId?.itemCode ?? i.itemCode ?? '';
  return !KEEP.has(code);
});

console.log(`Active: ${allItems.length} | To deactivate: ${toDeactivate.length}\n`);

let ok = 0, fail = 0;
for (const item of toDeactivate) {
  const code: string = item.itemId?.itemCode ?? item.itemCode ?? '';
  const deptId: string = item.departmentId ?? 'General';
  // nodeId must match \p{Alnum}[\w-]* — replace spaces/& with hyphens
  const nodeId = deptId.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/-$/, '');

  const { status: s } = await ncrSiteRequest(
    `/catalog/v2/items/${encodeURIComponent(code)}`,
    {
      method: 'PUT',
      body: {
        shortDescription: { values: [{ locale: 'en-US', value: code }] },
        departmentId: deptId,
        merchandiseCategory: { nodeId },
        status: 'INACTIVE',
        version: 1,
      },
    }
  );
  if (s === 200 || s === 201 || s === 204 || s === 404) {
    ok++; process.stdout.write('.');
  } else {
    fail++; process.stdout.write(`x(${s})`);
  }
  await new Promise((r) => setTimeout(r, 80));
}

console.log(`\n\nDone: ${ok} deactivated, ${fail} failed`);
