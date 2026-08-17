import type { Core } from '@strapi/strapi';
import { appVersion, healthResponse } from './health.cjs';

let applicationReady = false;

async function databaseReady(strapi: Core.Strapi): Promise<boolean> {
  try {
    await strapi.db.connection.raw('select 1');
    return true;
  } catch {
    return false;
  }
}

async function seedArchiveAdministrator(strapi: Core.Strapi): Promise<void> {
  const email = process.env.ARCHIVE_ADMIN_EMAIL;
  const password = process.env.ARCHIVE_ADMIN_PASSWORD;
  if (!email || !password) {
    return;
  }

  const exists = await strapi.db.query('admin::user').findOne({ where: { email } });
  if (exists) {
    return;
  }

  const superAdmin = await strapi.service('admin::role').getSuperAdmin();
  await strapi.service('admin::user').create({
    email,
    firstname: 'Archive',
    lastname: 'Administrator',
    password,
    isActive: true,
    roles: [superAdmin.id],
  });
  strapi.log.info(`seeded Archive Administrator ${email}`);
}

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    strapi.server.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/health') {
        await next();
        return;
      }

      const ready = applicationReady && (await databaseReady(strapi));
      const result = healthResponse(ready, appVersion());
      ctx.status = result.statusCode;
      ctx.body = result.body;
    });
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await seedArchiveAdministrator(strapi);
    applicationReady = true;
  },
};
