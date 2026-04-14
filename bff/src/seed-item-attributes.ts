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

// BFF self-hosted images — served from /images/{itemId}.jpg
// Update BFF_URL if deploying to a different host
const BFF_URL = process.env.BFF_PUBLIC_URL ?? 'https://voyixmobile.onrender.com';
const CDN = `${BFF_URL}/images`;

const ITEM_IMAGES: { id: string; imageUrl: string }[] = [
  // ── Demo short codes ───────────────────────────────────────────────────────
  { id: '1',    imageUrl: `${CDN}/1.jpg`    },  // Wireless Earbuds
  { id: '2',    imageUrl: `${CDN}/2.jpg`    },  // Crew Tee
  { id: '3',    imageUrl: `${CDN}/3.jpg`    },  // Coffee Mugs
  { id: '4',    imageUrl: `${CDN}/4.jpg`    },  // Easter Egg
  { id: '5',    imageUrl: `${CDN}/5.jpg`    },  // Kids PJ
  { id: '6',    imageUrl: `${CDN}/6.jpg`    },  // Frypan
  // ── Womens ─────────────────────────────────────────────────────────────────
  { id: 'w001', imageUrl: `${CDN}/w001.jpg` },
  { id: 'w002', imageUrl: `${CDN}/w002.jpg` },
  { id: 'w003', imageUrl: `${CDN}/w003.jpg` },
  { id: 'w004', imageUrl: `${CDN}/w004.jpg` },
  { id: 'w005', imageUrl: `${CDN}/w005.jpg` },
  { id: 'w006', imageUrl: `${CDN}/w006.jpg` },
  // ── Mens ───────────────────────────────────────────────────────────────────
  { id: 'm001', imageUrl: `${CDN}/m001.jpg` },
  { id: 'm002', imageUrl: `${CDN}/m002.jpg` },
  { id: 'm003', imageUrl: `${CDN}/m003.jpg` },
  { id: 'm004', imageUrl: `${CDN}/m004.jpg` },
  // ── Kids & Baby ────────────────────────────────────────────────────────────
  { id: 'k001', imageUrl: `${CDN}/k001.jpg` },
  { id: 'k002', imageUrl: `${CDN}/k002.jpg` },
  { id: 'k003', imageUrl: `${CDN}/k003.jpg` },
  { id: 'k004', imageUrl: `${CDN}/k004.jpg` },
  // ── Home & Living ──────────────────────────────────────────────────────────
  { id: 'h001', imageUrl: `${CDN}/h001.jpg` },
  { id: 'h002', imageUrl: `${CDN}/h002.jpg` },
  { id: 'h003', imageUrl: `${CDN}/h003.jpg` },
  { id: 'h004', imageUrl: `${CDN}/h004.jpg` },
  { id: 'h005', imageUrl: `${CDN}/h005.jpg` },
  // ── Tech & Gaming ──────────────────────────────────────────────────────────
  { id: 't001', imageUrl: `${CDN}/t001.jpg` },
  { id: 't002', imageUrl: `${CDN}/t002.jpg` },
  { id: 't003', imageUrl: `${CDN}/t003.jpg` },
  { id: 't004', imageUrl: `${CDN}/t004.jpg` },
  // ── Toys ───────────────────────────────────────────────────────────────────
  { id: 'y001', imageUrl: `${CDN}/y001.jpg` },
  { id: 'y002', imageUrl: `${CDN}/y002.jpg` },
  { id: 'y003', imageUrl: `${CDN}/y003.jpg` },
  { id: 'y004', imageUrl: `${CDN}/y004.jpg` },
  // ── Easter ─────────────────────────────────────────────────────────────────
  { id: 'e001', imageUrl: `${CDN}/e001.jpg` },
  { id: 'e002', imageUrl: `${CDN}/e002.jpg` },
  { id: 'e003', imageUrl: `${CDN}/e003.jpg` },
  { id: 'e004', imageUrl: `${CDN}/e004.jpg` },
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
