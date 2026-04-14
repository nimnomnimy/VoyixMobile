/**
 * Seed script — populates the BSP test-drive account with all catalog items + prices.
 *
 * Usage (from bff/):
 *   npx tsx src/seed-catalog.ts
 *
 * It is safe to run multiple times (PUT is idempotent on BSP catalog).
 */
import 'dotenv/config';
import { ncrSiteRequest } from './lib/ncrClient.js';

// ── Catalog definition ──────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  name: string;
  price: number;
  category: string;
  barcode?: string;
}

const CATALOG: CatalogItem[] = [
  // Demo items — short codes for quick entry during demos
  { id: '1', name: 'Anko Wireless Earbuds',       price: 29.00, category: 'Tech & Gaming' },
  { id: '2', name: "Men's Regular Fit Crew Tee",  price: 10.00, category: 'Mens'          },
  { id: '3', name: 'Ceramic Mug Set of 4',        price: 14.00, category: 'Home & Living' },
  { id: '4', name: 'Bluey Hollow Easter Egg 40g', price:  3.00, category: 'Easter'        },
  { id: '5', name: "Kids' Stripe PJ Set",         price: 14.00, category: 'Kids & Baby'   },
  { id: '6', name: 'Non-Stick Frypan 28cm',       price: 28.00, category: 'Home & Living' },
  // Womens
  { id: 'w001', name: 'Sleeveless Satin Midi Dress',    price: 28.00, category: 'Womens', barcode: '9300601000001' },
  { id: 'w002', name: 'Long Sleeve Collared Mini Dress', price: 28.00, category: 'Womens', barcode: '9300601000002' },
  { id: 'w003', name: 'Long Sleeve Maxi Dress',          price: 30.00, category: 'Womens', barcode: '9300601000003' },
  { id: 'w004', name: "Women's V-Neck Linen Blend Tee",  price: 14.00, category: 'Womens', barcode: '9300601000004' },
  // Mens
  { id: 'm001', name: "Men's Regular Fit Crew Tee",  price: 10.00, category: 'Mens', barcode: '9300601000011' },
  { id: 'm002', name: "Men's Slim Fit Chino Pants",  price: 25.00, category: 'Mens', barcode: '9300601000012' },
  { id: 'm003', name: "Men's Fleece Zip Hoodie",     price: 30.00, category: 'Mens', barcode: '9300601000013' },
  // Kids & Baby
  { id: 'k001', name: "Kids' Long Sleeve Pyjama Set", price: 16.00, category: 'Kids & Baby', barcode: '9300601000021' },
  { id: 'k002', name: "Kids' Stripe PJ Set",           price: 14.00, category: 'Kids & Baby', barcode: '9300601000022' },
  // Home & Living
  { id: 'h001', name: 'Anko Queen Microfibre Sheet Set', price: 35.00, category: 'Home & Living', barcode: '9300601000031' },
  { id: 'h002', name: 'Anko Standard Pillow 2-Pack',     price: 18.00, category: 'Home & Living', barcode: '9300601000032' },
  { id: 'h003', name: 'Anko Cotton Bath Towel 2-Pack',   price: 22.00, category: 'Home & Living', barcode: '9300601000033' },
  { id: 'h004', name: 'Ceramic Mug Set of 4',            price: 14.00, category: 'Home & Living', barcode: '9300601000034' },
  { id: 'h005', name: 'Non-Stick Frypan 28cm',           price: 28.00, category: 'Home & Living', barcode: '9300601000035' },
  // Tech & Gaming
  { id: 't001', name: 'Anko Wireless Earbuds',   price: 29.00, category: 'Tech & Gaming', barcode: '9300601000041' },
  { id: 't002', name: 'Anko Bluetooth Speaker',  price: 35.00, category: 'Tech & Gaming', barcode: '9300601000042' },
  { id: 't003', name: 'USB-C Charging Cable 2m', price:  9.00, category: 'Tech & Gaming', barcode: '9300601000043' },
  { id: 't004', name: 'Anko 20W Fast Charger',   price: 19.00, category: 'Tech & Gaming', barcode: '9300601000044' },
  // Toys
  { id: 'y001', name: 'Bluey Easter Hunt Pack 125g',     price:  9.00, category: 'Toys', barcode: '9300601000051' },
  { id: 'y002', name: 'Vtech Winnie the Pooh Storybook', price: 22.00, category: 'Toys', barcode: '9300601000052' },
  { id: 'y003', name: 'Kids Art & Craft Set',            price: 15.00, category: 'Toys', barcode: '9300601000053' },
  { id: 'y004', name: 'Foam Dart Blaster',               price: 18.00, category: 'Toys', barcode: '9300601000054' },
  // Easter
  { id: 'e001', name: 'Golden Gaytime Egg 150g',        price: 8.00, category: 'Easter', barcode: '9300601000061' },
  { id: 'e002', name: 'Bluey Milk Chocolate Eggs 100g', price: 5.50, category: 'Easter', barcode: '9300601000062' },
  { id: 'e003', name: 'Nestle Milkybar Egg 72g',        price: 6.00, category: 'Easter', barcode: '9300601000063' },
  { id: 'e004', name: 'Bluey Hollow Easter Egg 40g',    price: 3.00, category: 'Easter', barcode: '9300601000064' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(icon: string, msg: string) {
  console.log(`${icon}  ${msg}`);
}

function toNodeId(category: string): string {
  return category
    .split(/[\s&]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

async function seedItem(item: CatalogItem): Promise<boolean> {
  const body = {
    shortDescription: {
      values: [{ locale: 'en-US', value: item.name }],
    },
    departmentId: item.category,
    merchandiseCategory: { nodeId: toNodeId(item.category) },
    status: 'ACTIVE',
    version: 1,
    ...(item.barcode
      ? { packageIdentifiers: [{ value: item.barcode, type: 'UPC-A' }] }
      : {}),
  };

  const { status } = await ncrSiteRequest(
    `/catalog/v2/items/${encodeURIComponent(item.id)}`,
    { method: 'PUT', body }
  );

  return status === 200 || status === 204 || status === 201;
}

async function seedPrice(item: CatalogItem): Promise<boolean> {
  const body = {
    price:         item.price,
    itemPriceType: 'FULL_SERVICE_CASH',
    status:        'ACTIVE',
    currency:      'AUD',
    effectiveDate: new Date().toISOString().slice(0, 10),
    version:       1,
  };

  const { status, data } = await ncrSiteRequest(
    `/catalog/v2/item-prices/${encodeURIComponent(item.id)}/prices`,
    { method: 'PUT', body }
  );

  if (status >= 400) {
    console.error(`   Price PUT ${item.id} → ${status}`, JSON.stringify(data ?? '').slice(0, 200));
  }

  return status === 200 || status === 204 || status === 201;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('🌱', `Seeding ${CATALOG.length} items into BSP catalog…\n`);

  let itemOk = 0, itemFail = 0;
  let priceOk = 0, priceFail = 0;

  for (const item of CATALOG) {
    const ok = await seedItem(item);
    if (ok) {
      itemOk++;
      log('✅', `[item]  ${item.id}  ${item.name}`);
    } else {
      itemFail++;
      log('❌', `[item]  ${item.id}  ${item.name}`);
    }

    const priceOk_ = await seedPrice(item);
    if (priceOk_) {
      priceOk++;
      log('💰', `[price] ${item.id}  $${item.price.toFixed(2)}`);
    } else {
      priceFail++;
      log('⚠️ ', `[price] ${item.id}  $${item.price.toFixed(2)}  (failed — item will show $0)`);
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n──────────────────────────────────────`);
  log('📦', `Items:  ${itemOk} seeded, ${itemFail} failed`);
  log('💵', `Prices: ${priceOk} seeded, ${priceFail} failed`);

  if (priceFail > 0) {
    console.log(`\nNote: items with failed prices will show $0 in the app.`);
    console.log(`Prices can also be set in the BSP dashboard manually.`);
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
