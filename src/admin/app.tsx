import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: ['zh-Hans'],
  },
  bootstrap(_app: StrapiApp) {
    if (typeof localStorage === 'undefined') {
      return;
    }

    if (localStorage.getItem('strapi-admin-language') === null) {
      localStorage.setItem('strapi-admin-language', 'zh-Hans');
    }
  },
};
