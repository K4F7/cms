import type { StrapiApp } from '@strapi/strapi/admin';
import zhHans from './translations/zh-Hans.json';

export default {
  config: {
    locales: ['zh-Hans'],
    translations: {
      'zh-Hans': zhHans,
    },
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
