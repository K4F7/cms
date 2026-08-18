import type { StrapiApp } from '@strapi/strapi/admin';
import zhHans from './translations/zh-Hans.json';
import favicon from './extensions/favicon.png';
import loginLogo from './extensions/login-logo.png';

/** Sampled from the processed MEME. wordmark (dark emerald, not the bright cyan fringe). */
const BRAND = '#2c8874';

const brandColors = {
  primary100: '#e8f6f2',
  primary200: '#bfe6db',
  primary500: '#3a9d86',
  primary600: BRAND,
  primary700: '#1f6153',
  buttonPrimary500: '#3a9d86',
  buttonPrimary600: BRAND,
};

const brandColorsDark = {
  primary100: '#16332c',
  primary200: '#1f4a41',
  primary500: '#3a9d86',
  primary600: '#4aad96',
  primary700: '#6ec4b0',
  buttonPrimary500: '#3a9d86',
  buttonPrimary600: BRAND,
};

const englishChrome = {
  'Auth.form.welcome.title': 'meme',
  'Auth.form.welcome.subtitle': 'Log in to 迷因创作社',
  'app.components.LeftMenu.navbrand.title': 'meme',
  'app.components.LeftMenu.navbrand.workplace': '迷因创作社',
};

function keepPluginMenuLink(to: string): boolean {
  const path = to.replace(/^\//, '');
  return path === 'content-manager' || path.startsWith('content-manager/') || path === 'plugins/upload' || path.startsWith('plugins/upload/');
}

function hideHomeAndMarketplace(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById('cms-admin-chrome')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'cms-admin-chrome';
  style.textContent = [
    'a[href="https://market.strapi.io"],',
    'a[href^="https://market.strapi.io?"],',
    'li:has(a[href="https://market.strapi.io"]),',
    'li:has(a[aria-label="Home"]),',
    'li:has(a[aria-label="首页"]),',
    'nav ul li:has(> a[href="/"]) {',
    '  display: none !important;',
    '}',
  ].join('\n');
  document.head.appendChild(style);
}

export default {
  config: {
    locales: ['zh-Hans'],
    translations: {
      'zh-Hans': zhHans,
      en: englishChrome,
    },
    auth: { logo: loginLogo },
    menu: { logo: favicon },
    head: { favicon },
    theme: {
      light: { colors: brandColors },
      dark: { colors: brandColorsDark },
    },
    tutorials: false,
    notifications: { releases: false },
  },
  register(app: StrapiApp) {
    const menu = app.router.menu;
    for (let i = menu.length - 1; i >= 0; i -= 1) {
      if (!keepPluginMenuLink(menu[i]?.to ?? '')) {
        menu.splice(i, 1);
      }
    }
  },
  bootstrap(_app: StrapiApp) {
    hideHomeAndMarketplace();

    if (typeof localStorage === 'undefined') {
      return;
    }

    if (localStorage.getItem('strapi-admin-language') === null) {
      localStorage.setItem('strapi-admin-language', 'zh-Hans');
    }
  },
};
