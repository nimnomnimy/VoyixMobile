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

// Base CDN for all Kmart product images
const CDN = 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products';

const ITEM_IMAGES: { id: string; imageUrl: string }[] = [
  // ── Demo short codes (map to same image as their full-catalog equivalent) ──
  { id: '1',    imageUrl: `${CDN}/43499670_1.jpg` },  // Anko True Wireless Earbuds
  { id: '2',    imageUrl: `${CDN}/S140827_1.jpg`  },  // Plain Crew Neck T-shirt
  { id: '3',    imageUrl: `${CDN}/42838869_1.jpg` },  // 4 Pack Coffee Mugs
  { id: '4',    imageUrl: `${CDN}/43518081_1.jpg` },  // Bluey Hollow Easter Egg 40g
  { id: '5',    imageUrl: `${CDN}/S163549_1.jpg`  },  // Kids Pyjama Set
  { id: '6',    imageUrl: `${CDN}/42282990_1.jpg` },  // 28cm Aluminium Non-Stick Frypan
  // ── Womens ─────────────────────────────────────────────────────────────────
  { id: 'w001', imageUrl: `${CDN}/S42069423_1.jpg` }, // Sleeveless Satin Lace Midi Dress (existing)
  { id: 'w002', imageUrl: `${CDN}/S42069424_1.jpg` }, // Long Sleeve Collared Mini Dress (existing)
  { id: 'w003', imageUrl: `${CDN}/S42069425_1.jpg` }, // Long Sleeve Waist Tie Maxi Dress (existing)
  { id: 'w004', imageUrl: `${CDN}/S160090_1.jpg`  },  // Linen Blend Short Sleeve V-Neck T-shirt
  { id: 'w005', imageUrl: `${CDN}/S169940_1.jpg`  },  // Linen Blend Wide Leg Pants
  { id: 'w006', imageUrl: `${CDN}/S148575_1.jpg`  },  // Ribbed Tank
  // ── Mens ───────────────────────────────────────────────────────────────────
  { id: 'm001', imageUrl: `${CDN}/S140827_1.jpg`  },  // Plain Crew Neck T-shirt
  { id: 'm002', imageUrl: `${CDN}/S164518_1.jpg`  },  // Slim Stretch Chino Pants
  { id: 'm003', imageUrl: `${CDN}/S168666_1.jpg`  },  // Active Mens Polar Fleece Full Zip Hoodie
  { id: 'm004', imageUrl: `${CDN}/S165867_1.jpg`  },  // Denim Shorts
  // ── Kids & Baby ────────────────────────────────────────────────────────────
  { id: 'k001', imageUrl: `${CDN}/S167503_1.jpg`  },  // Long Sleeve Jersey Pyjama Set
  { id: 'k002', imageUrl: `${CDN}/S163549_1.jpg`  },  // Kids Pyjama Set (stripe)
  { id: 'k003', imageUrl: `${CDN}/S154468_1.jpg`  },  // 5 Pack Cotton Bodysuits
  { id: 'k004', imageUrl: `${CDN}/S159894_1.jpg`  },  // Everlast Kids Zip Through Polar Fleece Jacket
  // ── Home & Living ──────────────────────────────────────────────────────────
  { id: 'h001', imageUrl: `${CDN}/43354221_1.jpg` },  // 250 Thread Count Cotton Rich Sheet Set Queen
  { id: 'h002', imageUrl: `${CDN}/42126744_1.jpg` },  // 2 Pack Cotton Rich Cover Pillows
  { id: 'h003', imageUrl: `${CDN}/43555246_1.jpg` },  // Australian Cotton Bath Towel
  { id: 'h004', imageUrl: `${CDN}/42838869_1.jpg` },  // 4 Pack Coffee Mugs
  { id: 'h005', imageUrl: `${CDN}/42282990_1.jpg` },  // 28cm Non-Stick Frypan
  // ── Tech & Gaming ──────────────────────────────────────────────────────────
  { id: 't001', imageUrl: `${CDN}/43499670_1.jpg` },  // True Wireless ANC Earbuds
  { id: 't002', imageUrl: `${CDN}/43351329_1.jpg` },  // Portable Bluetooth Speaker
  { id: 't003', imageUrl: `${CDN}/43157266_1.jpg` },  // USB-A to USB-C Universal Cable 2m
  { id: 't004', imageUrl: `${CDN}/43105021_1.jpg` },  // 20W Wall Charger USB & USB-C
  // ── Toys ───────────────────────────────────────────────────────────────────
  { id: 'y001', imageUrl: `${CDN}/43518135_1.jpg` },  // Bluey Easter Hunt Pack 125g
  { id: 'y002', imageUrl: `${CDN}/43055081_1.jpg` },  // Disney Winnie the Pooh Storybook Collection
  { id: 'y003', imageUrl: `${CDN}/43144655_1.jpg` },  // 208 Piece Artist Case
  { id: 'y004', imageUrl: `${CDN}/42900719_1.jpg` },  // Zuru X-Shot Omega Foam Dart Blaster
  // ── Easter ─────────────────────────────────────────────────────────────────
  { id: 'e001', imageUrl: `${CDN}/43518685_1.jpg` },  // Golden Gaytime Egg 150g
  { id: 'e002', imageUrl: `${CDN}/43518111_1.jpg` },  // Bluey Milk Chocolate Eggs 100g
  { id: 'e003', imageUrl: `${CDN}/43662883_1.jpg` },  // Nestle Milkybar Egg 72g
  { id: 'e004', imageUrl: `${CDN}/43518081_1.jpg` },  // Bluey Milk Chocolate Hollow Easter Egg 40g
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
