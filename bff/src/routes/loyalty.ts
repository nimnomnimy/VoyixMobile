/**
 * Loyalty routes — uses NCR CDM API for consumer lookup.
 *
 * CDM endpoint used:
 *   GET /cdm/consumers/{consumerAccountNumber}  — identify member by card number
 *
 * Points accrual is handled as a stub (ret-loyalty/v1 requires separate provisioning).
 */
import type { FastifyInstance } from 'fastify';
import { ncrRequest } from '../lib/ncrClient.js';

export default async function loyaltyRoutes(app: FastifyInstance) {
  /**
   * POST /api/loyalty/identify
   * Body: { cardNumber: string, cardType: string }
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
    async (req) => {
      const { cardNumber, cardType } = req.body;

      try {
        const { status, data: consumer } = await ncrRequest<any>(
          `/cdm/consumers/${encodeURIComponent(cardNumber)}`
        );

        if (status === 200 && consumer) {
          const firstName = consumer.firstName ?? '';
          const lastName  = consumer.lastName ?? '';
          return {
            accountId:     consumer.consumerAccountNumber ?? cardNumber,
            memberName:    firstName ? `${firstName} ${lastName}`.trim() : 'Loyalty Member',
            pointsBalance: 0,
            tier:          'Standard',
            cardType,
          };
        }

        if (status === 404) {
          // Card not found — return stub without logging a warning
          return {
            accountId:     cardNumber,
            memberName:    'Loyalty Member',
            pointsBalance: 0,
            tier:          'Standard',
            cardType,
            stub: true,
          };
        }
      } catch (err) {
        app.log.warn({ err }, 'CDM consumer lookup failed, returning stub');
      }

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
   *
   * Note: ret-loyalty/v1 requires separate provisioning. Returns stub (1pt/dollar).
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
    async (req) => {
      const { totalAmount, cardType } = req.body;
      const pointsEarned = Math.floor(totalAmount);
      return { pointsEarned, newBalance: pointsEarned, cardType, stub: true };
    }
  );
}
