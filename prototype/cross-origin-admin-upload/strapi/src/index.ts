import type { Core } from '@strapi/strapi';

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const email = process.env.PROTOTYPE_ADMIN_EMAIL;
    const password = process.env.PROTOTYPE_ADMIN_PASSWORD;
    if (!email || !password) {
      strapi.log.warn('[prototype] PROTOTYPE_ADMIN_EMAIL/PASSWORD unset; skip seed');
      return;
    }

    const exists = await strapi.db.query('admin::user').findOne({ where: { email } });
    if (exists) {
      strapi.log.info(`[prototype] Archive Administrator already present: ${email}`);
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
    strapi.log.info(`[prototype] seeded Archive Administrator ${email}`);
  },
};
