/**
 * Seed script — stores image URLs in BSP catalog item-attributes.
 *
 * Usage (from bff/):
 *   npx tsx src/seed-item-attributes.ts
 *
 * BSP endpoint: PUT /catalog/v2/item-attributes/{itemCode}
 * Safe to re-run — PUT is idempotent.
 */
import 'dotenv/config';
import { ncrSiteRequest } from './lib/ncrClient.js';

const ITEM_IMAGES: { id: string; imageUrl: string }[] = [
  // Demo short codes — reuse images from their full equivalents
  { id: '1',    imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058607_1.jpg' }, // Earbuds
  { id: '2',    imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058596_1.jpg' }, // Crew Tee
  { id: '3',    imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058635_1.jpg' }, // Mug Set
  { id: '4',    imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069464_1.jpg' }, // Bluey Egg
  { id: '5',    imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058622_1.jpg' }, // Kids PJ
  { id: '6',    imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058631_1.jpg' }, // Frypan
  // Womens
  { id: 'w001', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069423_1.jpg' },
  { id: 'w002', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069424_1.jpg' },
  { id: 'w003', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069425_1.jpg' },
  { id: 'w004', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069426_1.jpg' },
  { id: 'w005', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069427_1.jpg' },
  { id: 'w006', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069428_1.jpg' },
  // Mens
  { id: 'm001', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058596_1.jpg' },
  { id: 'm002', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058597_1.jpg' },
  { id: 'm003', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058598_1.jpg' },
  { id: 'm004', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058599_1.jpg' },
  // Kids & Baby
  { id: 'k001', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058620_1.jpg' },
  { id: 'k002', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058622_1.jpg' },
  { id: 'k003', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058623_1.jpg' },
  { id: 'k004', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058624_1.jpg' },
  // Home & Living
  { id: 'h001', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058626_1.jpg' },
  { id: 'h002', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058627_1.jpg' },
  { id: 'h003', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058628_1.jpg' },
  { id: 'h004', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058635_1.jpg' },
  { id: 'h005', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058631_1.jpg' },
  // Tech & Gaming
  { id: 't001', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058607_1.jpg' },
  { id: 't002', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058608_1.jpg' },
  { id: 't003', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058609_1.jpg' },
  { id: 't004', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42058610_1.jpg' },
  // Toys
  { id: 'y001', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069460_1.jpg' },
  { id: 'y002', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069461_1.jpg' },
  { id: 'y003', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069462_1.jpg' },
  { id: 'y004', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069463_1.jpg' },
  // Easter
  { id: 'e001', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069464_1.jpg' },
  { id: 'e002', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069465_1.jpg' },
  { id: 'e003', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069466_1.jpg' },
  { id: 'e004', imageUrl: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069467_1.jpg' },
];

function log(icon: string, msg: string) {
  console.log(`${icon}  ${msg}`);
}

async function seedAttributes(item: { id: string; imageUrl: string }): Promise<boolean> {
  const { status, data } = await ncrSiteRequest(
    `/catalog/v2/item-attributes/${encodeURIComponent(item.id)}`,
    {
      method: 'PUT',
      body: {
        version: 1,
        status: 'ACTIVE',
        imageUrls: [item.imageUrl],
      },
    }
  );

  if (status >= 400) {
    console.error(`   item-attributes PUT ${item.id} → ${status}`, JSON.stringify(data ?? '').slice(0, 200));
  }

  return status === 200 || status === 201 || status === 204;
}

async function main() {
  log('🖼 ', `Seeding image URLs for ${ITEM_IMAGES.length} items into BSP item-attributes…\n`);

  let ok = 0, fail = 0;

  for (const item of ITEM_IMAGES) {
    const success = await seedAttributes(item);
    if (success) {
      ok++;
      log('✅', `${item.id.padEnd(5)}  ${item.imageUrl.split('/').pop()}`);
    } else {
      fail++;
      log('❌', `${item.id.padEnd(5)}  ${item.imageUrl.split('/').pop()}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log('\n──────────────────────────────────────');
  log('🖼 ', `Images: ${ok} seeded, ${fail} failed`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
