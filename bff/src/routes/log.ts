import type { FastifyInstance } from 'fastify';
import { getLog, clearLog } from '../lib/apiLog.js';

export default async function logRoutes(app: FastifyInstance) {
  // GET /api/log — return all recorded BSP API calls
  app.get('/', async () => ({
    entries: getLog(),
    count: getLog().length,
  }));

  // DELETE /api/log — clear the log
  app.delete('/', async (_req, reply) => {
    clearLog();
    return reply.status(204).send();
  });
}
