import 'dotenv/config';

function require_env(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  // Render injects PORT; fall back to BFF_PORT for local dev.
  port: parseInt(process.env.PORT ?? process.env.BFF_PORT ?? '8765'),
  host: process.env.BFF_HOST ?? '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
  // Comma-separated list of allowed origins. Unset = allow all (dev mode).
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : true as const,
  bsp: {
    gateway: process.env.BSP_API_GATEWAY ?? 'https://api.ncr.com',
    organization: require_env('BSP_ORGANIZATION'),
    siteId: require_env('BSP_SITE_ID'),
    sharedKey: require_env('BSP_SHARED_KEY'),
    secretKey: require_env('BSP_SECRET_KEY'),
  },
};
