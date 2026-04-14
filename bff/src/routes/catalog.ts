/**
 * Catalog routes — wraps NCR Voyix Catalog v2 API.
 *
 * BSP endpoints:
 *   GET  /catalog/v2/item-details/search   — item search / barcode lookup
 *   GET  /catalog/v2/item-details/:code    — single item detail
 *   POST /catalog/v2/item-prices/get-multiple — batch price fetch
 */
import type { FastifyInstance } from 'fastify';
import { ncrRequest, ncrSiteRequest } from '../lib/ncrClient.js';
import { assertOk } from '../lib/errors.js';
import { config } from '../config.js';

/**
 * Fetch imageUrls from item-attributes for a list of item codes.
 * Returns a map of itemCode → first imageUrl (or undefined).
 * Failures are silently ignored — items without attributes just get no image.
 */
async function fetchItemImages(itemCodes: string[]): Promise<Record<string, string>> {
  const results = await Promise.allSettled(
    itemCodes.map((code) =>
      ncrSiteRequest<any>(
        `/catalog/v2/item-attributes/${encodeURIComponent(code)}?enterpriseUnitId=${encodeURIComponent(config.bsp.siteId)}`
      )
    )
  );
  const imageMap: Record<string, string> = {};
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled' && result.value.status === 200) {
      const urls: string[] = result.value.data?.imageUrls ?? [];
      if (urls.length > 0) imageMap[itemCodes[idx]] = urls[0];
    }
  });
  return imageMap;
}

export default async function catalogRoutes(app: FastifyInstance) {
  /** Search items by short description or barcode. */
  app.get<{ Querystring: { q?: string; barcode?: string; pageSize?: string } }>(
    '/items',
    async (req, reply) => {
      const { q, barcode } = req.query;
      // BSP requires pageSize >= 10
      const pageSize = Math.max(10, parseInt(req.query.pageSize ?? '20', 10));

      let searchPath = `/catalog/v2/item-details/search?itemStatus=ACTIVE&sortField=ITEM_CODE&sortDirection=ASC&pageSize=${pageSize}`;

      if (barcode) {
        searchPath += `&packageIdentifierValue=${encodeURIComponent(barcode)}`;
      } else if (q) {
        searchPath += `&shortDescriptionPattern=*${encodeURIComponent(q)}*`;
      }

      const { status, data } = await ncrSiteRequest<any>(searchPath);
      assertOk(status, 'catalog search');

      // Normalise BSP response: flatten pageContent wrapper for mobile client.
      // BSP returns: { item: { itemId: { itemCode }, shortDescription, departmentId, packageIdentifiers }, itemPrices: [] }
      // Mobile expects flat BspItemDetail: { itemCode, shortDescription, departmentId, packageIdentifiers, imageUrls }
      const body = data as any;
      const pageContent: any[] = body.pageContent ?? [];

      // Extract item codes and fetch images from item-attributes in parallel
      const flatItems = pageContent.map((entry: any) => entry.item ?? entry);
      const itemCodes = flatItems.map((item: any) => item.itemId?.itemCode ?? item.itemCode).filter(Boolean);
      const imageMap = itemCodes.length > 0 ? await fetchItemImages(itemCodes) : {};

      const itemDetails = flatItems.map((item: any) => {
        const code = item.itemId?.itemCode ?? item.itemCode;
        return {
          itemCode:           code,
          shortDescription:   item.shortDescription,
          departmentId:       item.departmentId,
          packageIdentifiers: (item.packageIdentifiers ?? []).map((p: any) => ({
            value:                 p.value,
            packageIdentifierType: p.type ?? p.packageIdentifierType,
          })),
          imageUrls: imageMap[code] ? [imageMap[code]] : (item.imageUrls ?? []),
        };
      });
      return {
        totalCount:  body.totalResults ?? 0,
        pageNumber:  body.pageNumber ?? 0,
        lastPage:    body.lastPage ?? true,
        itemDetails,
      };
    }
  );

  /** Get a single item by item code. */
  app.get<{ Params: { code: string } }>(
    '/items/:code',
    async (req, reply) => {
      const { code } = req.params;
      const { status, data } = await ncrSiteRequest(
        `/catalog/v2/item-details/${encodeURIComponent(code)}`
      );
      if (status === 404) return reply.status(404).send({ error: 'Item not found' });
      assertOk(status, 'catalog item');
      return data;
    }
  );

  /** Batch fetch item prices. Body: { itemCodes: string[] } */
  app.post<{ Body: { itemCodes: string[] } }>(
    '/prices',
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
      // BSP PricesItemIdCollectionData uses "itemIds", not "itemCodes"
      const payload = { itemIds: itemCodes.map((c) => ({ itemCode: c })) };
      const { status, data } = await ncrSiteRequest('/catalog/v2/item-prices/get-multiple', {
        method: 'POST',
        body: payload,
      });
      assertOk(status, 'item prices');

      // Normalise BSP response → { itemPrices: [{ itemCode, price }] }
      // BSP returns itemCode inside priceId.itemCode, not at the top level.
      const raw: any[] = (data as any)?.itemPrices ?? [];
      const itemPrices = raw.map((p: any) => ({
        itemCode: p.itemCode ?? p.itemId?.itemCode ?? p.priceId?.itemCode ?? '',
        price:    typeof p.price === 'number' ? p.price : (p.price?.amount ?? p.unitPrice ?? 0),
      }));
      return { itemPrices };
    }
  );

  /** Get item attributes (nutritional info, allergens, etc.) */
  app.post<{ Body: { itemCodes: string[] } }>(
    '/attributes',
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
      const payload = { itemCodes: itemCodes.map((c) => ({ itemCode: c })) };
      const { status, data } = await ncrSiteRequest('/catalog/v2/item-attributes/get-multiple', {
        method: 'POST',
        body: payload,
      });
      assertOk(status, 'item attributes');
      return data;
    }
  );
}
