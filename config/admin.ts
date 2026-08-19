import type { Core } from '@strapi/strapi';
import { adminCookiePath } from '../src/admin-paths';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  url: env('ADMIN_URL', '/'),
  serveAdminPanel: env.bool('SERVE_ADMIN_PANEL', false),
  auth: {
    secret: env('ADMIN_JWT_SECRET')!,
    cookie: {
      sameSite: env('ADMIN_COOKIE_SAMESITE', 'none') as 'lax' | 'strict' | 'none',
      path: adminCookiePath(env('ADMIN_URL', '/')),
    },
    sessions: {
      accessTokenLifespan: env.int('ADMIN_ACCESS_TOKEN_LIFESPAN', 1800),
      idleSessionLifespan: env.int('ADMIN_IDLE_SESSION_LIFESPAN', 3600),
    },
  },
  rateLimit: {
    enabled: env.bool('ADMIN_RATE_LIMIT', true),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT')!,
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT')!,
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY')!,
  },
  flags: {
    nps: false,
    promoteEE: false,
    docLinks: false,
  },
  ai: {
    enabled: false,
  },
});

export default config;
