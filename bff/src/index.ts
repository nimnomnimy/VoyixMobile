import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import staticFiles from '@fastify/static';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { BspError } from './lib/errors.js';

import catalogRoutes from './routes/catalog.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/order.js';
import sitesRoutes from './routes/sites.js';
import authRoutes from './routes/auth.js';
import logRoutes from './routes/log.js';
import loyaltyRoutes from './routes/loyalty.js';
import promotionsRoutes from './routes/promotions.js';
import inventoryRoutes from './routes/inventory.js';

const app = Fastify({
  logger: {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
});

await app.register(cors, { origin: config.allowedOrigins });
await app.register(jwt, { secret: config.jwtSecret });

// Serve static product images from public/images/
await app.register(staticFiles, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
  decorateReply: false,
});

// Health check
app.get('/health', async () => ({ ok: true, service: 'VoyixMobile BFF' }));

// API routes
await app.register(authRoutes,    { prefix: '/api/auth' });
await app.register(catalogRoutes, { prefix: '/api/catalog' });
await app.register(cartRoutes,    { prefix: '/api/cart' });
await app.register(orderRoutes,   { prefix: '/api/order' });
await app.register(sitesRoutes,    { prefix: '/api/sites' });
await app.register(logRoutes,      { prefix: '/api/log' });
await app.register(loyaltyRoutes,  { prefix: '/api/loyalty' });
await app.register(promotionsRoutes, { prefix: '/api/promotions' });
await app.register(inventoryRoutes, { prefix: '/api/inventory' });

// Global error handler — never expose raw BSP errors to mobile
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof BspError) {
    return reply.status(err.statusCode).send({ error: err.message });
  }
  app.log.error(err);
  return reply.status(500).send({ error: 'Internal server error' });
});

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`VoyixMobile BFF listening on :${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
