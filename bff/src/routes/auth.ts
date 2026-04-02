/**
 * Auth routes — staff PIN login.
 *
 * In a production system PINs would be looked up against a staff directory.
 * For the sandbox demo we accept any 4-digit PIN and issue a JWT with a
 * hard-coded cashier role tied to the configured site.
 */
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

interface LoginBody {
  staffId: string;
  pin: string;
}

const DEMO_STAFF: Record<string, { name: string; role: 'cashier' | 'manager' }> = {
  '1001': { name: 'Alex Johnson',  role: 'cashier' },
  '1002': { name: 'Sam Williams',  role: 'cashier' },
  '9001': { name: 'Manager Davis', role: 'manager' },
};

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['staffId', 'pin'],
        properties: {
          staffId: { type: 'string' },
          pin:     { type: 'string', minLength: 4, maxLength: 8 },
        },
      },
    },
  }, async (req, reply) => {
    const { staffId, pin } = req.body;

    const staff = DEMO_STAFF[staffId];
    if (!staff || pin.length < 4) {
      return reply.status(401).send({ error: 'Invalid staff ID or PIN' });
    }

    const token = app.jwt.sign(
      {
        sub:      staffId,
        name:     staff.name,
        role:     staff.role,
        siteId:   config.bsp.siteId,
        deviceId: `device-${Date.now()}`,
      },
      { expiresIn: '8h' }
    );

    return { token, staff: { id: staffId, name: staff.name, role: staff.role } };
  });

  app.post('/logout', async (_req, reply) => {
    // JWT is stateless — client drops the token
    return reply.status(204).send();
  });
}
