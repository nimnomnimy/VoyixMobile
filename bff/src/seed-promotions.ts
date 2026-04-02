/**
 * Seed script — creates demo promotions in the BSP Promotions Engine v4.
 *
 * Usage (from bff/):
 *   npx tsx src/seed-promotions.ts
 *
 * BSP endpoint:
 *   POST /promotion/4/promotions   — create promotion
 *   GET  /promotion/4/promotions   — list existing (run first to inspect format)
 */
import 'dotenv/config';
import { ncrSiteRequest, ncrRequest } from './lib/ncrClient.js';

// ── Promotion definitions ────────────────────────────────────────────────────

const PROMOTIONS = [
  {
    name: "20% Off Women's Clothing",
    description: "Save 20% on all Women's clothing items",
    status: 'ACTIVE',
    priority: 10,
    startDate: '2024-01-01',
    endDate:   '2030-12-31',
    promotionComponents: [
      {
        triggerGroup: {
          triggerType: 'ITEM',
          minimumQuantity: 1,
          items: [
            { itemCode: 'w001' },
            { itemCode: 'w002' },
            { itemCode: 'w003' },
            { itemCode: 'w004' },
            { itemCode: 'w005' },
            { itemCode: 'w006' },
          ],
        },
        rewardGroup: {
          rewardType: 'PERCENT_OFF',
          discountPercent: 20,
        },
      },
    ],
  },
  {
    name: '$5 Off When You Spend $50+',
    description: 'Spend $50 or more and save $5 on your order',
    status: 'ACTIVE',
    priority: 5,
    startDate: '2024-01-01',
    endDate:   '2030-12-31',
    promotionComponents: [
      {
        triggerGroup: {
          triggerType: 'BASKET',
          minimumAmount: 50,
        },
        rewardGroup: {
          rewardType: 'BASKET_AMOUNT_OFF',
          discountAmount: 5,
        },
      },
    ],
  },
  {
    name: 'Buy 2 Easter Eggs Get 1 Free',
    description: 'Add any 3 Easter egg products — the cheapest is free',
    status: 'ACTIVE',
    priority: 15,
    startDate: '2024-01-01',
    endDate:   '2030-12-31',
    promotionComponents: [
      {
        triggerGroup: {
          triggerType: 'ITEM',
          minimumQuantity: 3,
          items: [
            { itemCode: 'e001' },
            { itemCode: 'e002' },
            { itemCode: 'e003' },
            { itemCode: 'e004' },
          ],
        },
        rewardGroup: {
          rewardType: 'FREE_ITEM',
          freeQuantity: 1,
          applyToLeastExpensive: true,
        },
      },
    ],
  },
  {
    name: '10% Off Tech & Gaming',
    description: '10% off all Anko tech and gaming accessories',
    status: 'ACTIVE',
    priority: 8,
    startDate: '2024-01-01',
    endDate:   '2030-12-31',
    promotionComponents: [
      {
        triggerGroup: {
          triggerType: 'ITEM',
          minimumQuantity: 1,
          items: [
            { itemCode: 't001' },
            { itemCode: 't002' },
            { itemCode: 't003' },
            { itemCode: 't004' },
          ],
        },
        rewardGroup: {
          rewardType: 'PERCENT_OFF',
          discountPercent: 10,
        },
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(icon: string, msg: string) {
  console.log(`${icon}  ${msg}`);
}

// Candidate paths to probe — management API may be org-level (no enterprise unit)
// or use a different versioned path than the evaluation endpoint.
const CANDIDATE_PATHS = [
  '/promotion/4/promotions',
  '/promotion/4/promotion-definitions',
  '/promotion/3/promotions',
  '/promotion/2/promotions',
];

async function probePaths(): Promise<string | null> {
  log('🔍', 'Probing Promotions Engine management paths…\n');

  // Try org-level (no enterprise unit) first, then site-level
  for (const path of CANDIDATE_PATHS) {
    for (const [label, fn] of [
      ['org-level', (p: string) => ncrRequest<any>(`${p}?pageSize=3`)],
      ['site-level', (p: string) => ncrSiteRequest<any>(`${p}?pageSize=3`)],
    ] as const) {
      const { status, data } = await fn(path);
      console.log(`  ${status === 200 ? '✅' : '  '} ${status}  ${label}  ${path}`);
      if (status === 200) {
        const items = (data as any)?.pageContent ?? (Array.isArray(data) ? data : []);
        if (items.length > 0) {
          log('📋', `Found ${items.length} existing promotion(s). Sample:`);
          console.log(JSON.stringify(items[0], null, 2).slice(0, 1000));
        }
        return `${label}:${path}`;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return null;
}

async function createPromotion(
  promo: (typeof PROMOTIONS)[number],
  path: string,
  useOrg: boolean,
): Promise<boolean> {
  const req = useOrg ? ncrRequest : ncrSiteRequest;
  const { status, data } = await req<any>(path, { method: 'POST', body: promo });

  if (status >= 400) {
    console.error(
      `   ❌ POST "${promo.name}" → ${status}`,
      '\n  ', JSON.stringify(data ?? '').slice(0, 500),
    );
    return false;
  }

  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const found = await probePaths();
  console.log('');

  if (!found) {
    log('🚫', 'No working Promotions Engine management path found.');
    log('   ', 'The test-drive org may not have the promotions management API enabled.');
    log('   ', 'Evaluation (/promotion/4/promotions/find) may still work for existing promotions.');
    process.exit(1);
  }

  const [scopeLabel, path] = found.split(':');
  const useOrg = scopeLabel === 'org-level';
  log('✅', `Using: ${found}`);
  console.log('');
  log('🌱', `Seeding ${PROMOTIONS.length} promotions into BSP Promotions Engine…\n`);

  let ok = 0;
  let fail = 0;

  for (const promo of PROMOTIONS) {
    const success = await createPromotion(promo, path, useOrg);
    if (success) {
      ok++;
      log('✅', promo.name);
    } else {
      fail++;
      log('❌', promo.name);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('\n──────────────────────────────────────');
  log('🎯', `Promotions: ${ok} seeded, ${fail} failed`);

  if (fail > 0) {
    console.log('\nBSP error messages above show the exact field names expected.');
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
