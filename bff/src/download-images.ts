/**
 * Downloads product images from Unsplash and saves them locally.
 * Run once from bff/:  npx tsx src/download-images.ts
 *
 * Images are saved to bff/public/images/{itemId}.jpg
 * They are then served by the BFF at /images/{itemId}.jpg
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'images');
mkdirSync(OUT_DIR, { recursive: true });

// Unsplash Source: free, no auth, returns a random relevant image at 400x400
// Using fixed photo IDs so the same image always downloads (not random)
const ITEM_IMAGES: { id: string; unsplashId: string; label: string }[] = [
  // Demo short codes
  { id: '1',    unsplashId: 'photo-1505740420928-5e560c06d30e', label: 'Wireless Earbuds' },
  { id: '2',    unsplashId: 'photo-1521572163474-6864f9cf17ab', label: 'Crew Tee' },
  { id: '3',    unsplashId: 'photo-1514228742587-6b1558fcca3d', label: 'Coffee Mugs' },
  { id: '4',    unsplashId: 'photo-1607344645866-009c320b63e0', label: 'Easter Egg' },
  { id: '5',    unsplashId: 'photo-1519689680058-324335c77eba', label: 'Kids PJ' },
  { id: '6',    unsplashId: 'photo-1556909114-f6e7ad7d3136', label: 'Frypan' },
  // Womens
  { id: 'w001', unsplashId: 'photo-1496747611176-843222e1e57c', label: 'Midi Dress' },
  { id: 'w002', unsplashId: 'photo-1595777457583-95e059d581b8', label: 'Mini Dress' },
  { id: 'w003', unsplashId: 'photo-1572804013309-59a88b7e92f1', label: 'Maxi Dress' },
  { id: 'w004', unsplashId: 'photo-1586363104862-3a5e2ab60d99', label: 'V-Neck Tee' },
  { id: 'w005', unsplashId: 'photo-1509551388413-e18d0ac5d495', label: 'Wide Leg Pants' },
  { id: 'w006', unsplashId: 'photo-1434389677669-e08b4cac3105', label: 'Ribbed Tank' },
  // Mens
  { id: 'm001', unsplashId: 'photo-1521572163474-6864f9cf17ab', label: 'Crew Tee' },
  { id: 'm002', unsplashId: 'photo-1473966968600-fa801b869a1a', label: 'Chino Pants' },
  { id: 'm003', unsplashId: 'photo-1556821840-3a63f15732ce', label: 'Zip Hoodie' },
  { id: 'm004', unsplashId: 'photo-1542272604-787c3835535d', label: 'Denim Shorts' },
  // Kids & Baby
  { id: 'k001', unsplashId: 'photo-1519689680058-324335c77eba', label: 'Kids PJ Long' },
  { id: 'k002', unsplashId: 'photo-1471286174890-9c112ffca5b4', label: 'Kids PJ Stripe' },
  { id: 'k003', unsplashId: 'photo-1522771930-78848d9293e8', label: 'Baby Bodysuit' },
  { id: 'k004', unsplashId: 'photo-1604917877934-07d58b7cba58', label: 'Kids Fleece Jacket' },
  // Home & Living
  { id: 'h001', unsplashId: 'photo-1631049307264-da0ec9d70304', label: 'Sheet Set' },
  { id: 'h002', unsplashId: 'photo-1585771724684-38269d6639fd', label: 'Pillow' },
  { id: 'h003', unsplashId: 'photo-1600369671854-5b88b5848638', label: 'Bath Towel' },
  { id: 'h004', unsplashId: 'photo-1514228742587-6b1558fcca3d', label: 'Coffee Mugs' },
  { id: 'h005', unsplashId: 'photo-1556909114-f6e7ad7d3136', label: 'Frypan' },
  // Tech & Gaming
  { id: 't001', unsplashId: 'photo-1505740420928-5e560c06d30e', label: 'Earbuds' },
  { id: 't002', unsplashId: 'photo-1608043152269-423dbba4e7e1', label: 'Bluetooth Speaker' },
  { id: 't003', unsplashId: 'photo-1558618666-fcd25c85cd64', label: 'USB-C Cable' },
  { id: 't004', unsplashId: 'photo-1583863788434-e62294a05543', label: '20W Charger' },
  // Toys
  { id: 'y001', unsplashId: 'photo-1607344645866-009c320b63e0', label: 'Easter Pack' },
  { id: 'y002', unsplashId: 'photo-1535572290543-960a8046f5af', label: 'Storybook' },
  { id: 'y003', unsplashId: 'photo-1513364776144-60967b0f800f', label: 'Art & Craft' },
  { id: 'y004', unsplashId: 'photo-1558618047-3c8c76ca7d13', label: 'Dart Blaster' },
  // Easter
  { id: 'e001', unsplashId: 'photo-1585914641050-fa3eda310b14', label: 'Golden Gaytime Egg' },
  { id: 'e002', unsplashId: 'photo-1607344645866-009c320b63e0', label: 'Bluey Choc Eggs' },
  { id: 'e003', unsplashId: 'photo-1599599810694-b5b37304c041', label: 'Milkybar Egg' },
  { id: 'e004', unsplashId: 'photo-1520209759809-a9bcb6cb3241', label: 'Hollow Easter Egg' },
];

async function download(id: string, unsplashId: string, label: string): Promise<boolean> {
  const dest = path.join(OUT_DIR, `${id}.jpg`);
  // Unsplash direct photo download URL at 400x400 crop
  const url = `https://images.unsplash.com/${unsplashId}?w=400&h=400&fit=crop&auto=format&q=80`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VoyixMobile/1.0 (product image downloader)' },
      redirect: 'follow',
    });
    if (!res.ok || !res.body) {
      console.error(`❌  ${id.padEnd(5)} (${label}) — HTTP ${res.status}`);
      return false;
    }
    const dest_stream = createWriteStream(dest);
    await pipeline(res.body as any, dest_stream);
    console.log(`✅  ${id.padEnd(5)} (${label})`);
    return true;
  } catch (err: any) {
    console.error(`❌  ${id.padEnd(5)} (${label}) — ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`📦  Downloading ${ITEM_IMAGES.length} product images to ${OUT_DIR}\n`);
  let ok = 0, fail = 0;
  for (const item of ITEM_IMAGES) {
    const success = await download(item.id, item.unsplashId, item.label);
    if (success) ok++; else fail++;
    await new Promise(r => setTimeout(r, 100));
  }
  console.log(`\n──────────────────────────`);
  console.log(`✅  ${ok} downloaded, ❌  ${fail} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
