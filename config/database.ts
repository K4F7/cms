import path from 'path';
import type { Core } from '@strapi/strapi';
import { isDatabaseClientKind } from '@strapi/database';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Database => {
  const client = env('DATABASE_CLIENT', 'postgres');

  if (!isDatabaseClientKind(client)) {
    throw new Error(
      `Unsupported DATABASE_CLIENT: ${client}. Use "postgres" or "sqlite".`
    );
  }

  const connections: Partial<
    Record<Core.Config.Database.ClientKind, Core.Config.Database['connection']>
  > = {
    postgres: {
      client: 'postgres',
      connection: {
        connectionString: env('DATABASE_URL'),
        host: env('DATABASE_HOST', '127.0.0.1'),
        port: env.int('DATABASE_PORT', 5432),
        database: env('DATABASE_NAME', 'cms'),
        user: env('DATABASE_USERNAME', 'cms'),
        password: env('DATABASE_PASSWORD', 'cms'),
        ssl: env.bool('DATABASE_SSL', false) && {
          key: env('DATABASE_SSL_KEY', undefined),
          cert: env('DATABASE_SSL_CERT', undefined),
          ca: env('DATABASE_SSL_CA', undefined),
          capath: env('DATABASE_SSL_CAPATH', undefined),
          cipher: env('DATABASE_SSL_CIPHER', undefined),
          rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
        },
        schema: env('DATABASE_SCHEMA', 'public'),
      },
      pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
    },
    sqlite: {
      client: 'sqlite',
      connection: {
        filename: path.join(__dirname, '..', '..', env('DATABASE_FILENAME', '.tmp/data.db')),
      },
      useNullAsDefault: true,
    },
  };

  const selected = connections[client];
  if (!selected) {
    throw new Error(`DATABASE_CLIENT ${client} is not configured. Use "postgres" or "sqlite".`);
  }

  return {
    connection: {
      ...selected,
      acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
    },
  };
};

export default config;
