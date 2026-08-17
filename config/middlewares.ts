import type { Core } from '@strapi/strapi';

const productLimitBytes = 50 * 1024 * 1024;

function adminOrigins(env: Core.Config.Shared.ConfigParams['env']): string[] {
  return env('ADMIN_ORIGIN', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: adminOrigins(env),
      credentials: true,
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  {
    name: 'strapi::body',
    config: {
      formLimit: '52mb',
      jsonLimit: '10mb',
      textLimit: '10mb',
      formidable: {
        maxFileSize: productLimitBytes,
      },
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
