/**
 * Loyalty routes — wraps NCR Voyix Loyalty / Customer API.
 *
 * BSP endpoints:
 *   GET  /customer/1/loyalty-accounts?loyaltyCardNumber=xxx  — identify card
 *   POST /customer/1/loyalty-events                           — accrue points
 */
import type { FastifyInstance } from 'fastify';
import { ncrRequest, ncrSiteRequest } from '../lib/ncrClient.js';

export default async function loyaltyRoutes(app: FastifyInstance) {
  /**
   * POST /api/loyalty/identify
   * Body: { cardNumber: string, cardType: 'flybuys' | 'teamMember' | 'onepass' }
   * Returns: { accountId, memberName, pointsBalance, tier }
   */
  app.post<{ Body: { cardNumber: string; cardType: string } }>(
    '/identify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['cardNumber'],
          properties: {
            cardNumber: { type: 'string' },
            cardType:   { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { cardNumber, cardType } = req.body;

      try {
        const { status, data } = await ncrSiteRequest<any>(
          `/customer/1/loyalty-accounts?loyaltyCardNumber=${encodeURIComponent(cardNumber)}&pageSize=1`
        );

        app.log.info({ bspLoyaltyStatus: status, bspLoyaltyData: data }, 'BSP loyalty identify response');

        if (status === 200 && data) {
          const account = data.pageContent?.[0] ?? data;
          return {
            accountId:     account.id ?? account.accountId ?? cardNumber,
            memberName:    account.name ?? account.firstName ?? 'Member',
            pointsBalance: account.pointsBalance ?? account.balance ?? 0,
            tier:          account.tier ?? account.membershipLevel ?? 'Standard',
            cardType,
          };
        }
      } catch (err) {
        app.log.warn({ err }, 'BSP loyalty identify unavailable, returning stub');
      }

      // Graceful stub when BSP doesn't support loyalty in this sandbox
      return {
        accountId:     cardNumber,
        memberName:    'Loyalty Member',
        pointsBalance: 0,
        tier:          'Standard',
        cardType,
        stub: true,
      };
    }
  );

  /**
   * POST /api/loyalty/accrue
   * Body: { accountId: string, orderId: string, totalAmount: number, cardType: string }
   * Returns: { pointsEarned, newBalance }
   */
  app.post<{ Body: { accountId: string; orderId: string; totalAmount: number; cardType: string } }>(
    '/accrue',
    {
      schema: {
        body: {
          type: 'object',
          required: ['accountId', 'orderId', 'totalAmount'],
          properties: {
            accountId:   { type: 'string' },
            orderId:     { type: 'string' },
            totalAmount: { type: 'number', minimum: 0 },
            cardType:    { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { accountId, orderId, totalAmount, cardType } = req.body;

      try {
        const payload = {
          loyaltyAccountId: accountId,
          referenceId: orderId,
          eventType: 'Purchase',
          purchaseAmount: totalAmount,
          transactionDate: new Date().toISOString(),
        };

        const { status, data } = await ncrSiteRequest<any>('/customer/1/loyalty-events', {
          method: 'POST',
          body: payload,
        });

        app.log.info({ bspAccrueStatus: status, bspAccrueData: data }, 'BSP loyalty accrue response');

        if (status < 400 && data) {
          return {
            pointsEarned: data.pointsEarned ?? Math.floor(totalAmount),
            newBalance:   data.newBalance ?? data.pointsBalance ?? 0,
            cardType,
          };
        }
      } catch (err) {
        app.log.warn({ err }, 'BSP loyalty accrue unavailable, returning stub');
      }

      // Stub: 1 point per dollar
      return {
        pointsEarned: Math.floor(totalAmount),
        newBalance:   Math.floor(totalAmount),
        cardType,
        stub: true,
      };
    }
  );
}
