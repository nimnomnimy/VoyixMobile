/**
 * Cart routes — wraps NCR Voyix Order API (orders used as server-side cart).
 *
 * BSP endpoints:
 *   POST  /order/3/orders/1           — create order (new cart)
 *   GET   /order/3/orders/1/:id       — get order
 *   PATCH /order/3/orders/1/:id       — update order lines (add/remove items)
 *
 * The order status is kept as "Open" until checkout.
 */
import type { FastifyInstance } from 'fastify';
import { ncrSiteRequest } from '../lib/ncrClient.js';
import { assertOk } from '../lib/errors.js';

const ORDER_BASE = '/order/3/orders/1';

interface CartLineItem {
  itemCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export default async function cartRoutes(app: FastifyInstance) {
  /** Create a new cart (BSP order in Open status). */
  app.post<{ Body: { currency?: string } }>('/create', async (req) => {
    const { currency = 'USD' } = req.body ?? {};

    const order = {
      status: 'OrderPlaced',
      currency,
      channel: 'Web',
      orderLines: [],
    };

    const { status, data } = await ncrSiteRequest(ORDER_BASE, {
      method: 'POST',
      body: order,
    });
    assertOk(status, 'create cart');
    return data;
  });

  /** Get cart by order ID. */
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const { status, data } = await ncrSiteRequest(`${ORDER_BASE}/${id}`);
    if (status === 404) return reply.status(404).send({ error: 'Cart not found' });
    assertOk(status, 'get cart');
    return data;
  });

  /** Add or update a line item in the cart. */
  app.post<{ Params: { id: string }; Body: CartLineItem }>(
    '/:id/lines',
    {
      schema: {
        body: {
          type: 'object',
          required: ['itemCode', 'description', 'quantity', 'unitPrice'],
          properties: {
            itemCode:    { type: 'string' },
            description: { type: 'string' },
            quantity:    { type: 'number', minimum: 0.001 },
            unitPrice:   { type: 'number', minimum: 0 },
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params;
      const { itemCode, description, quantity, unitPrice } = req.body;

      const patch = {
        orderLines: [
          {
            productId: { type: 'ITEM_CODE', value: itemCode },
            description,
            quantity: { value: quantity, unitOfMeasure: 'EA' },
            unitPrice,
            extendedAmount: parseFloat((quantity * unitPrice).toFixed(2)),
          },
        ],
      };

      const { status, data } = await ncrSiteRequest(`${ORDER_BASE}/${id}`, {
        method: 'PATCH',
        body: patch,
      });
      assertOk(status, 'add cart line');
      return data ?? { ok: true };
    }
  );

  /** Remove a line item by lineId. */
  app.delete<{ Params: { id: string; lineId: string } }>('/:id/lines/:lineId', async (req) => {
    const { id, lineId } = req.params;

    // BSP PATCH: set quantity to 0 on the line to void it
    const patch = {
      orderLines: [
        {
          lineId,
          quantity: { value: 0, unitOfMeasure: 'EA' },
          fulfillmentResult: 'Voided',
        },
      ],
    };

    const { status, data } = await ncrSiteRequest(`${ORDER_BASE}/${id}`, {
      method: 'PATCH',
      body: patch,
    });
    assertOk(status, 'remove cart line');
    return data ?? { ok: true };
  });

  /** Clear entire cart. */
  app.delete<{ Params: { id: string } }>('/:id', async (req) => {
    const { id } = req.params;
    const patch = { status: 'Cancelled' };
    const { status } = await ncrSiteRequest(`${ORDER_BASE}/${id}`, {
      method: 'PATCH',
      body: patch,
    });
    assertOk(status, 'cancel cart');
    return { ok: true };
  });
}
