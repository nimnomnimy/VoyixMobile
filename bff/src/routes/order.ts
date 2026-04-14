/**
 * Order routes — submits a finalised cart as a BSP order and records a TDM t-log.
 *
 * BSP endpoints:
 *   PATCH /order/3/orders/1/:id                              — finalise order
 *   POST  /transaction-document/transaction-documents        — create t-log
 *   GET   /order/3/orders/1/:id                             — get order
 *   POST  /order/3/orders/1/find                            — find orders by site
 */
import type { FastifyInstance } from 'fastify';
import { ncrSiteRequest, ncrRequest } from '../lib/ncrClient.js';
import { assertOk } from '../lib/errors.js';
import { config } from '../config.js';

const ORDER_BASE = '/order/3/orders/1';
const TDM_BASE   = '/transaction-document/transaction-documents';

/**
 * Fetch return t-logs from TDM for a given order ID and merge returned
 * quantities back onto the order lines as fulfillmentResult = 'Returned'.
 *
 * BSP Order v3 has no native "Returned" fulfillmentResult, so we store
 * returns in TDM (transactionType = RETURN, referenceId = orderId) and
 * derive the return state from there.
 */
async function mergeReturns(order: any): Promise<any> {
  if (!order?.id) return order;

  try {
    // Search TDM for RETURN t-logs that reference this order
    const { status, data } = await ncrRequest<any>(`${TDM_BASE}/find`, {
      method: 'POST',
      body: {
        fromTransactionDateTimeUtc: { dateTime: '2020-01-01T00:00:00.000Z' },
        toTransactionDateTimeUtc:   { dateTime: new Date().toISOString() },
      },
    });

    if (status !== 200 || !data?.pageContent) return order;

    // Collect RETURN t-logs whose ID starts with this orderId
    // (our naming convention: `${orderId}-ret-${timestamp}`)
    const returnTlogs = data.pageContent.filter((t: any) => t.id?.startsWith(`${order.id}-ret-`));
    const returnedQtys: Record<string, number> = {}; // productId → total returned qty

    for (const tlog of returnTlogs) {
      const items = tlog.tlog?.items ?? tlog.tlogData?.[0]?.tlog?.items ?? [];
      for (const item of items) {
        if (!item.isReturn) continue;
        const pid = item.productId ?? '';
        const qty = item.quantity?.quantity ?? 1;
        returnedQtys[pid] = (returnedQtys[pid] ?? 0) + qty;
      }
    }

    if (Object.keys(returnedQtys).length === 0) return order;

    // Merge onto order lines
    const updatedLines = (order.orderLines ?? []).map((line: any) => {
      const pid = line.productId?.value ?? '';
      const returnedQty = returnedQtys[pid] ?? 0;
      if (returnedQty <= 0) return line;
      const lineQty = line.quantity?.value ?? 1;
      return {
        ...line,
        fulfillmentResult: returnedQty >= lineQty ? 'Returned' : 'PartialReturn',
        returnedQuantity: returnedQty,
      };
    });

    // Sum tender amounts from all return t-logs to get total refunded amount
    const refundedTotal = returnTlogs.reduce((sum: number, tlog: any) => {
      const tenders = tlog.tlog?.tenders ?? tlog.tlogData?.[0]?.tlog?.tenders ?? [];
      const refundTenders = tenders.filter((t: any) => t.usage === 'REFUND');
      return sum + refundTenders.reduce((s: number, t: any) => s + (t.tenderAmount?.amount ?? 0), 0);
    }, 0);

    return { ...order, orderLines: updatedLines, refundedTotal };
  } catch {
    // TDM unavailable — return order as-is
    return order;
  }
}

interface CheckoutBody {
  orderId: string;
  paymentType: 'Cash' | 'CreditDebit' | 'Other';
  paymentSubType?: string;
  paymentAmount: number;
  staffId?: string;
}

export default async function orderRoutes(app: FastifyInstance) {
  /** Checkout: finalise order + record t-log. */
  app.post<{ Body: CheckoutBody }>(
    '/checkout',
    {
      schema: {
        body: {
          type: 'object',
          required: ['orderId', 'paymentType', 'paymentAmount'],
          properties: {
            orderId:          { type: 'string' },
            paymentType:      { type: 'string', enum: ['Cash', 'CreditDebit', 'Other'] },
            paymentSubType:   { type: 'string' },
            paymentAmount:    { type: 'number', minimum: 0 },
            staffId:          { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const { orderId, paymentType, paymentSubType, paymentAmount, staffId = 'unknown' } = req.body;
      const resolvedSubType = paymentSubType ?? (paymentType === 'Cash' ? 'Cash' : 'Contactless');

      // 1. Fetch the current order to calculate totals
      const { status: getStatus, data: order } = await ncrSiteRequest<any>(`${ORDER_BASE}/${orderId}`);
      assertOk(getStatus, 'fetch order for checkout');

      // 2. Patch order to OrderPlaced with payment
      const finalise = {
        status: 'OrderPlaced',
        payments: [
          {
            type: paymentType,
            subType: resolvedSubType,
            amount: paymentAmount,
            status: 'Authorized',
          },
        ],
      };

      const { status: patchStatus, data: patchData } = await ncrSiteRequest(`${ORDER_BASE}/${orderId}`, {
        method: 'PATCH',
        body: finalise,
      });
      if (patchStatus >= 400) {
        app.log.error({ patchStatus, patchData, finalise }, 'BSP order PATCH failed');
      }
      assertOk(patchStatus, 'finalise order');

      // 3. Submit t-log to TDM
      const tlogId = `${orderId}-tlog-${Date.now()}`;
      const lines: any[] = (order?.orderLines ?? []).map((line: any, idx: number) => ({
        id: String(idx + 1),
        productId: line.productId?.value ?? 'UNKNOWN',
        productName: line.description ?? '',
        quantity: { quantity: line.quantity?.value ?? 1, unitOfMeasurement: 'PIECE' },
        actualAmount: { amount: line.extendedAmount ?? 0 },
        regularUnitPrice: { amount: line.unitPrice ?? 0 },
        extendedUnitPrice: { amount: line.unitPrice ?? 0 },
        actualUnitPrice: { amount: line.unitPrice ?? 0 },
        extendedAmount: { amount: line.extendedAmount ?? 0 },
        isVoided: false,
        isReturn: false,
        entryMethod: 'KEYED',
        itemSellType: 'SALES',
        itemTaxes: [],
        itemPromotions: [],
        itemDiscounts: [],
        surcharges: [],
      }));

      const grandTotal = lines.reduce((sum, l) => sum + (l.actualAmount?.amount ?? 0), 0);

      const tlog = {
        tlogData: [
          {
            id: tlogId,
            modelVersion: 1,
            siteInfo: { id: config.bsp.siteId, name: 'Kmart Store' },
            transactionNumber: orderId.slice(-8),
            openDateTimeUtc: { dateTime: new Date().toISOString() },
            closeDateTimeUtc: { dateTime: new Date().toISOString() },
            touchPointId: '1',
            touchPointType: 'MPOS',
            dataProviderName: 'VoyixMobile',
            dataProviderVersion: '1.0.0',
            businessDay: { dateTime: new Date().toISOString().slice(0, 10) + 'T00:00:00Z' },
            isTrainingMode: false,
            transactionCategory: 'SALE_OR_RETURN',
            tlog: {
              transactionType: 'SALES',
              localCurrency: { code: 'USD' },
              isVoided: false,
              isSuspended: false,
              employees: [{ id: staffId, name: `Staff ${staffId}`, roleId: '1', roleName: 'Cashier', isTippableEmployee: false }],
              totals: {
                grossAmount: { amount: grandTotal },
                grandAmount: { amount: paymentAmount },
                netAmount: { amount: grandTotal },
                taxExclusive: { amount: 0 },
                taxInclusive: { amount: 0 },
                discountAmount: { amount: 0 },
                voidsAmount: { amount: 0 },
              },
              items: lines,
              tenders: [
                {
                  id: '1',
                  name: paymentType,
                  type: paymentType === 'Cash' ? 'CASH' : 'CREDIT_CARD',
                  tenderAmount: { amount: paymentAmount },
                  tipAmount: { amount: 0 },
                  isVoided: false,
                  cashDrawerId: '0',
                  surcharges: [],
                  usage: 'PAYMENT',
                },
              ],
              totalTaxes: [],
              transactionPromotions: [],
              transactionDiscounts: [],
              coupons: [],
              surcharges: [],
              customerCount: 1,
              checkOutType: 'ASSISTED_CHECKOUT',
            },
          },
        ],
      };

      const { status: tlogStatus } = await ncrRequest(TDM_BASE, {
        method: 'POST',
        body: tlog,
      });
      // TDM errors are non-fatal — log but don't block the cashier
      if (tlogStatus >= 400) {
        app.log.warn({ tlogStatus }, 'TDM t-log submission failed');
      }

      return { ok: true, orderId, tlogId };
    }
  );

  /** Get order by ID — merges TDM return data onto lines. */
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const { status, data } = await ncrSiteRequest(`${ORDER_BASE}/${id}`);
    if (status === 404) return reply.status(404).send({ error: 'Order not found' });
    assertOk(status, 'get order');
    return mergeReturns(data);
  });

  /** Refund / return selected lines on a completed order. */
  app.post<{
    Params: { id: string };
    Body: { lines: { lineId: string; quantity: number }[]; staffId?: string; paymentType?: string; refundAmount?: number };
  }>(
    '/:id/refund',
    {
      schema: {
        body: {
          type: 'object',
          required: ['lines'],
          properties: {
            lines: { type: 'array', items: { type: 'object', required: ['lineId', 'quantity'], properties: { lineId: { type: 'string' }, quantity: { type: 'number', minimum: 1 } } } },
            staffId:      { type: 'string' },
            paymentType:  { type: 'string' },
            refundAmount: { type: 'number', minimum: 0 },
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params;
      const { lines, staffId = 'unknown', paymentType = 'CreditDebit', refundAmount } = req.body;

      // 1. Fetch original order for line details (needed for t-log)
      const { status: getStatus, data: order } = await ncrSiteRequest<any>(`${ORDER_BASE}/${id}`);
      assertOk(getStatus, 'fetch order for refund');

      // BSP Order v3 FulfillmentResultType has no "Returned" value — skip the PATCH.
      // The return is recorded via the TDM t-log below.

      // 2. Use the promo-adjusted refund amount if provided, otherwise fall back to line totals
      const returnLineIds = new Set(lines.map((l) => l.lineId));
      const refundLines = (order?.orderLines ?? []).filter((l: any) => returnLineIds.has(l.lineId));
      const refundTotal = refundAmount
        ?? refundLines.reduce((sum: number, l: any) => sum + (l.extendedAmount ?? l.unitPrice ?? 0), 0);

      // 3. Submit return t-log (non-fatal)
      const returnTlogId = `${id}-ret-${Date.now()}`;
      const returnTlog = {
        tlogData: [{
          id: returnTlogId,
          modelVersion: 1,
          siteInfo: { id: config.bsp.siteId, name: 'Kmart Store' },
          transactionNumber: returnTlogId.slice(-8),
          openDateTimeUtc:  { dateTime: new Date().toISOString() },
          closeDateTimeUtc: { dateTime: new Date().toISOString() },
          touchPointId: '1', touchPointType: 'MPOS',
          dataProviderName: 'VoyixMobile', dataProviderVersion: '1.0.0',
          businessDay: { dateTime: new Date().toISOString().slice(0, 10) + 'T00:00:00Z' },
          isTrainingMode: false, transactionCategory: 'SALE_OR_RETURN',
          tlog: {
            transactionType: 'RETURN', localCurrency: { code: 'AUD' },
            isVoided: false, isSuspended: false,
            employees: [{ id: staffId, name: `Staff ${staffId}`, roleId: '1', roleName: 'Cashier', isTippableEmployee: false }],
            totals: { grossAmount: { amount: refundTotal }, grandAmount: { amount: refundTotal }, netAmount: { amount: refundTotal }, taxExclusive: { amount: 0 }, taxInclusive: { amount: 0 }, discountAmount: { amount: 0 }, voidsAmount: { amount: 0 } },
            items: refundLines.map((l: any, idx: number) => ({
              id: String(idx + 1), productId: l.productId?.value ?? 'UNKNOWN', productName: l.description ?? '',
              quantity: { quantity: l.quantity?.value ?? 1, unitOfMeasurement: 'PIECE' },
              actualAmount: { amount: l.extendedAmount ?? 0 }, regularUnitPrice: { amount: l.unitPrice ?? 0 },
              extendedUnitPrice: { amount: l.unitPrice ?? 0 }, actualUnitPrice: { amount: l.unitPrice ?? 0 },
              extendedAmount: { amount: l.extendedAmount ?? 0 },
              isVoided: false, isReturn: true, entryMethod: 'KEYED', itemSellType: 'SALES',
              itemTaxes: [], itemPromotions: [], itemDiscounts: [], surcharges: [],
            })),
            tenders: [{ id: '1', name: paymentType, type: paymentType === 'Cash' ? 'CASH' : 'CREDIT_CARD', tenderAmount: { amount: refundTotal }, tipAmount: { amount: 0 }, isVoided: false, cashDrawerId: '0', surcharges: [], usage: 'REFUND' }],
            totalTaxes: [], transactionPromotions: [], transactionDiscounts: [], coupons: [], surcharges: [], customerCount: 1, checkOutType: 'ASSISTED_CHECKOUT',
          },
        }],
      };
      const { status: tlogStatus } = await ncrRequest(TDM_BASE, { method: 'POST', body: returnTlog });
      if (tlogStatus >= 400) app.log.warn({ tlogStatus }, 'Return t-log submission failed');

      return { ok: true, orderId: id, returnTlogId, refundTotal };
    }
  );

  /** List recent orders for the site — merges TDM return data onto each order's lines. */
  app.get('/recent', async () => {
    const body = {
      enterpriseUnitId: config.bsp.siteId,
      returnFullOrders: true,
      sort: { column: 'CreatedDate', direction: 'Desc' },
    };
    const { status, data } = await ncrSiteRequest<{ pageContent?: any[]; [k: string]: any }>(
      `${ORDER_BASE}/find?pageSize=50`,
      { method: 'POST', body },
    );
    assertOk(status, 'list orders');

    // Merge TDM return data onto each order's lines in parallel
    const orders: any[] = data?.pageContent ?? [];
    const merged = await Promise.all(orders.map(mergeReturns));
    return { ...data, pageContent: merged };
  });
}
