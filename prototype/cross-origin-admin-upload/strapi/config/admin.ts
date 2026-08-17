import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  // Admin SPA is hosted on a different origin (Vercel stand-in).
  url: env('ADMIN_URL', '/'),
  serveAdminPanel: env.bool('SERVE_ADMIN_PANEL', false),
  auth: {
    secret: env('ADMIN_JWT_SECRET')!,
    // Default Strapi sameSite is 'lax', which will not send cookies on
    // cross-site Admin→API XHR (Vercel vs VPS). Production needs 'none'.
    cookie: {
      sameSite: env('ADMIN_COOKIE_SAMESITE', 'none') as 'lax' | 'strict' | 'none',
      path: '/admin',
    },
    sessions: {
      accessTokenLifespan: env.int('ADMIN_ACCESS_TOKEN_LIFESPAN', 120),
      idleSessionLifespan: env.int('ADMIN_IDLE_SESSION_LIFESPAN', 600),
    },
  },
  rateLimit: {
    enabled: false,
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
