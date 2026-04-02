/**
 * Inventory routes.
 *
 * BSP Inventory API requires real warehouse data unavailable on test-drive accounts.
 * Routes return unknown stock (-1) so the ScanScreen shows no stock indicators.
 */
import type { FastifyInstance } from 'fastify';

interface StockLevel {
  itemCode: string;
  quantityOnHand: number;
  quantityAvailable: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

async function fetchStock(itemCode: string): Promise<StockLevel> {
  // BSP Inventory API requires real warehouse data that is not available on test-drive
  // accounts. Return unknown stock so the ScanScreen shows no stock indicators.
  return { itemCode, quantityOnHand: -1, quantityAvailable: -1, isLowStock: false, isOutOfStock: false };
}

export default async function inventoryRoutes(app: FastifyInstance) {
  /** GET /api/inventory/:itemCode — single item stock level */
  app.get<{ Params: { itemCode: string } }>('/:itemCode', async (req) => {
    return fetchStock(req.params.itemCode);
  });

  /**
   * POST /api/inventory/batch
   * Body: { itemCodes: string[] }
   * Returns: { [itemCode]: StockLevel }
   */
  app.post<{ Body: { itemCodes: string[] } }>(
    '/batch',
    {
      schema: {
        body: {
          type: 'object',
          required: ['itemCodes'],
          properties: { itemCodes: { type: 'array', items: { type: 'string' } } },
        },
      },
    },
    async (req) => {
      const { itemCodes } = req.body;
      const results = await Promise.all(itemCodes.map((code) => fetchStock(code)));
      return Object.fromEntries(results.map((r) => [r.itemCode, r]));
    }
  );
}
