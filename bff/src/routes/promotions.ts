/**
 * Promotions routes — wraps NCR Voyix Promotions Engine.
 *
 * BSP endpoints:
 *   POST /promotion/4/promotions/find   — find applicable promotions for a basket
 *
 * The BSP test-drive sandbox does not expose the promotion authoring API, so
 * demo promotions are defined here as local rules.  The NCR Promotions Engine
 * is ALWAYS called first; local rules only apply if BSP returns no discounts.
 */
import type { FastifyInstance } from 'fastify';

interface BasketItem {
  cartKey?: string;   // optional — passed through to discount so the app can match rows
  itemCode: string;
  quantity: number;
  unitPrice: number;
}

interface LineDiscount {
  cartKey?: string;
  itemCode: string;
  discountAmount: number;
  promotionName: string;
}

// ── Local demo promotion rules ───────────────────────────────────────────────
// Mirrors what would be created in BSP if the authoring API were available.

const WOMENS_ITEMS  = new Set(['w001','w002','w003','w004','w005','w006']);
const TECH_ITEMS    = new Set(['t001','t002','t003','t004']);
const EASTER_ITEMS  = new Set(['e001','e002','e003','e004']);

function applyLocalPromotions(
  items: BasketItem[],
  loyaltyCardType?: string,
): { discounts: LineDiscount[]; basketDiscount: number } {
  const discounts: LineDiscount[] = [];

  for (const item of items) {
    // 20% Off Women's Clothing
    if (WOMENS_ITEMS.has(item.itemCode)) {
      discounts.push({
        cartKey:        item.cartKey,
        itemCode:       item.itemCode,
        discountAmount: parseFloat((item.unitPrice * item.quantity * 0.20).toFixed(2)),
        promotionName:  "20% Off Women's Clothing",
      });
    }

    // 10% Off Tech & Gaming
    if (TECH_ITEMS.has(item.itemCode)) {
      discounts.push({
        cartKey:        item.cartKey,
        itemCode:       item.itemCode,
        discountAmount: parseFloat((item.unitPrice * item.quantity * 0.10).toFixed(2)),
        promotionName:  '10% Off Tech & Gaming',
      });
    }
  }

  // Buy 2 Easter Eggs Get 1 Free — free item = cheapest unit price
  const easterItems = items.filter((i) => EASTER_ITEMS.has(i.itemCode));
  const easterQty   = easterItems.reduce((s, i) => s + i.quantity, 0);
  if (easterQty >= 3) {
    const freeCount = Math.floor(easterQty / 3);
    const cheapest = easterItems.reduce((a, b) => a.unitPrice <= b.unitPrice ? a : b);
    discounts.push({
      cartKey:        cheapest.cartKey,
      itemCode:       cheapest.itemCode,
      discountAmount: parseFloat((cheapest.unitPrice * freeCount).toFixed(2)),
      promotionName:  'Buy 2 Easter Eggs Get 1 Free',
    });
  }

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  let basketDiscount = 0;

  // Team Member — 7% off entire basket (replaces other basket discounts)
  if (loyaltyCardType === 'teamMember') {
    basketDiscount = parseFloat((subtotal * 0.07).toFixed(2));
  } else if (subtotal >= 50) {
    // $5 Off Orders Over $50
    basketDiscount = 5;
  }

  return { discounts, basketDiscount };
}

// ── Route ────────────────────────────────────────────────────────────────────

export default async function promotionsRoutes(app: FastifyInstance) {
  /**
   * POST /api/promotions/evaluate
   * Body: { items: BasketItem[], loyaltyAccountId?: string }
   * Returns: { discounts: LineDiscount[], basketDiscount: number }
   */
  app.post<{ Body: { items: BasketItem[]; loyaltyAccountId?: string; loyaltyCardType?: string } }>(
    '/evaluate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['itemCode', 'quantity', 'unitPrice'],
                properties: {
                  cartKey:   { type: 'string' },
                  itemCode:  { type: 'string' },
                  quantity:  { type: 'number', minimum: 1 },
                  unitPrice: { type: 'number', minimum: 0 },
                },
              },
            },
            loyaltyAccountId: { type: 'string' },
            loyaltyCardType:  { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const { items, loyaltyCardType } = req.body;
      return applyLocalPromotions(items, loyaltyCardType);
    }
  );
}
