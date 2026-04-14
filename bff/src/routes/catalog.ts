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

/** Base URL where product images are hosted (BFF static files on Render). */
const IMAGE_BASE = process.env.BFF_PUBLIC_URL ?? 'https://voyixmobile.onrender.com';

/**
 * Static map of item code → hosted image URL.
 * BSP item-attributes imageUrls field is not writable via PUT,
 * so we inject images directly in the BFF response.
 */
const ITEM_IMAGE_MAP: Record<string, string> = {
  '1':    `${IMAGE_BASE}/images/1.jpg`,
  '2':    `${IMAGE_BASE}/images/2.jpg`,
  '3':    `${IMAGE_BASE}/images/3.jpg`,
  '4':    `${IMAGE_BASE}/images/4.jpg`,
  '5':    `${IMAGE_BASE}/images/5.jpg`,
  '6':    `${IMAGE_BASE}/images/6.jpg`,
  'e001': `${IMAGE_BASE}/images/e001.jpg`,
  'e002': `${IMAGE_BASE}/images/e002.jpg`,
  'e003': `${IMAGE_BASE}/images/e003.jpg`,
  'e004': `${IMAGE_BASE}/images/e004.jpg`,
  'h001': `${IMAGE_BASE}/images/h001.jpg`,
  'h004': `${IMAGE_BASE}/images/h004.jpg`,
  'h005': `${IMAGE_BASE}/images/h005.jpg`,
  'k002': `${IMAGE_BASE}/images/k002.jpg`,
  'm001': `${IMAGE_BASE}/images/m001.jpg`,
  't001': `${IMAGE_BASE}/images/t001.jpg`,
  'y001': `${IMAGE_BASE}/images/y001.jpg`,
};

function fetchItemImages(itemCodes: string[]): Record<string, string> {
  const imageMap: Record<string, string> = {};
  for (const code of itemCodes) {
    if (ITEM_IMAGE_MAP[code]) imageMap[code] = ITEM_IMAGE_MAP[code];
  }
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

      // BSP's packageIdentifierValue filter doesn't work reliably — fetch all items
      // and filter client-side when a barcode is requested.
      const fetchSize = barcode ? 200 : pageSize;
      let searchPath = `/catalog/v2/item-details/search?itemStatus=ACTIVE&sortField=ITEM_CODE&sortDirection=ASC&pageSize=${fetchSize}`;

      if (q) {
        searchPath += `&shortDescriptionPattern=*${encodeURIComponent(q)}*`;
      }

      const { status, data } = await ncrSiteRequest<any>(searchPath);
      assertOk(status, 'catalog search');

      const body = data as any;
      let pageContent: any[] = body.pageContent ?? [];

      // If barcode lookup: filter server-side to exact packageIdentifier or itemCode match
      if (barcode) {
        pageContent = pageContent.filter((entry: any) => {
          const item = entry.item ?? entry;
          const itemCode = item.itemId?.itemCode ?? item.itemCode ?? '';
          const barcodes: string[] = (item.packageIdentifiers ?? []).map((p: any) => p.value);
          return itemCode === barcode || barcodes.includes(barcode);
        });
      }

      // Filter out clothing/size variant items (e.g. w001-S-BLK, k001-2-PNK).
      // BSP catalog v2 PUT cannot reliably deactivate items, so we exclude
      // variants by code pattern: <base>-<size>-<colour> (two hyphens minimum).
      const VARIANT_RE = /^[a-z]\d{3}-.+-.+$/i;
      const flatItems = pageContent
        .map((entry: any) => entry.item ?? entry)
        .filter((item: any) => {
          const code: string = item.itemId?.itemCode ?? item.itemCode ?? '';
          return !VARIANT_RE.test(code);
        });
      const itemCodes = flatItems.map((item: any) => item.itemId?.itemCode ?? item.itemCode).filter(Boolean);
      const imageMap = itemCodes.length > 0 ? fetchItemImages(itemCodes) : {};

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
        totalCount:  barcode ? itemDetails.length : (body.totalResults ?? 0),
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
