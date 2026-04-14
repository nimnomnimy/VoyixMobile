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

/**
 * Maps demo card numbers → BSP-generated consumerAccountNumbers.
 * BSP CDM auto-generates account numbers on POST — we cannot choose them,
 * so we maintain this map after running seed-consumers.ts.
 */
const CONSUMER_MAP: Record<string, { bspId: string; firstName: string; lastName: string }> = {
  '7': { bspId: '1YTKW29ZR2ADMRFA', firstName: 'Demo', lastName: 'Flybuys' },
  '8': { bspId: 'Y8SVDT00GC7U7NT7', firstName: 'Demo', lastName: 'TeamMember' },
  '9': { bspId: 'FMG811TQGF4RJAGO', firstName: 'Demo', lastName: 'OnePass' },
  '111122223333': { bspId: 'QASHUXB4LCZ21ETT', firstName: 'Sarah', lastName: 'Johnson' },
  '123412341234': { bspId: 'I74MCRD4F5UYREFF', firstName: 'Michael', lastName: 'Chen' },
  '444455556666': { bspId: 'XBW61INYWEFQ1T3Z', firstName: 'James', lastName: 'Taylor' },
  '777788889999': { bspId: 'GGLJYMYHGAQRIRZ5', firstName: 'Olivia', lastName: 'Brown' },
};

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

      // Resolve demo card numbers to their BSP-generated account IDs
      const mapped = CONSUMER_MAP[cardNumber];
      const bspAccountNumber = mapped?.bspId ?? cardNumber;

      try {
        const { status, data: consumer } = await ncrRequest<any>(
          `/cdm/consumers/${encodeURIComponent(bspAccountNumber)}`
        );

        if (status === 200 && consumer) {
          const firstName = consumer.firstName ?? mapped?.firstName ?? '';
          const lastName  = consumer.lastName  ?? mapped?.lastName  ?? '';
          return {
            accountId:     consumer.consumerAccountNumber ?? cardNumber,
            memberName:    firstName ? `${firstName} ${lastName}`.trim() : 'Loyalty Member',
            pointsBalance: 0,
            tier:          'Standard',
            cardType,
          };
        }

        if (status === 404) {
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
