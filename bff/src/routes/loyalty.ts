/**
 * Loyalty routes — wraps NCR Voyix Retail Loyalty API v1.
 *
 * Base URL: https://api.ncrvoyix.com/ret-loyalty/v1
 *
 * Endpoints used:
 *   GET /consumers/{consumerAccountNumber}   — identify member by card number
 *   GET /points?consumerAccountNumber=xxx    — get points balance
 *   PUT /points                              — award points after purchase
 */
import type { FastifyInstance } from 'fastify';
import { ncrRequest } from '../lib/ncrClient.js';

const LOYALTY_BASE = '/ret-loyalty/v1';

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
        // 1. Look up consumer by account number (card number)
        const { status: consumerStatus, data: consumer } = await ncrRequest<any>(
          `${LOYALTY_BASE}/consumers/${encodeURIComponent(cardNumber)}`
        );

        app.log.info({ consumerStatus }, 'BSP loyalty consumer lookup');

        if (consumerStatus === 200 && consumer) {
          // 2. Get their points balance
          const { status: pointsStatus, data: pointsData } = await ncrRequest<any>(
            `${LOYALTY_BASE}/points?consumerAccountNumber=${encodeURIComponent(cardNumber)}`
          );

          app.log.info({ pointsStatus }, 'BSP loyalty points lookup');

          const pointsBalance = pointsStatus === 200
            ? (pointsData?.totalPoints ?? pointsData?.balance ?? 0)
            : 0;

          return {
            accountId:     cardNumber,
            memberName:    consumer.firstName
              ? `${consumer.firstName} ${consumer.lastName ?? ''}`.trim()
              : (consumer.name ?? 'Loyalty Member'),
            pointsBalance,
            tier:          consumer.tier ?? consumer.membershipLevel ?? 'Standard',
            cardType,
          };
        }
      } catch (err) {
        app.log.warn({ err }, 'BSP loyalty identify unavailable, returning stub');
      }

      // Graceful stub when API is unavailable
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
    async (req) => {
      const { accountId, orderId, totalAmount, cardType } = req.body;
      const pointsEarned = Math.floor(totalAmount);

      try {
        const payload = {
          consumerAccountNumber: accountId,
          referenceId: orderId,
          points: pointsEarned,
          transactionDate: new Date().toISOString(),
        };

        const { status, data } = await ncrRequest<any>(`${LOYALTY_BASE}/points`, {
          method: 'PUT',
          body: payload,
        });

        app.log.info({ status }, 'BSP loyalty accrue response');

        if (status < 400) {
          return {
            pointsEarned,
            newBalance: data?.totalPoints ?? data?.balance ?? pointsEarned,
            cardType,
          };
        }
      } catch (err) {
        app.log.warn({ err }, 'BSP loyalty accrue unavailable, returning stub');
      }

      // Stub: 1 point per dollar
      return {
        pointsEarned,
        newBalance: pointsEarned,
        cardType,
        stub: true,
      };
    }
  );
}
