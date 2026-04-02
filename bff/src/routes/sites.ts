/**
 * Sites routes — wraps NCR Voyix Sites API.
 */
import type { FastifyInstance } from 'fastify';
import { ncrRequest } from '../lib/ncrClient.js';
import { assertOk } from '../lib/errors.js';
import { config } from '../config.js';

export default async function sitesRoutes(app: FastifyInstance) {
  /** Get the configured default site. */
  app.get('/current', async () => {
    const { status, data } = await ncrRequest(`/site/sites/${config.bsp.siteId}`);
    assertOk(status, 'get site');
    return data;
  });

  /** Find all active sites in the org. */
  app.get('/all', async () => {
    const body = { criteria: { status: 'ACTIVE' } };
    const { status, data } = await ncrRequest('/site/sites/find-by-criteria', {
      method: 'POST',
      body,
    });
    assertOk(status, 'find sites');
    return data;
  });
}
