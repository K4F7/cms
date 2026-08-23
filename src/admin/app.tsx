import type { StrapiApp } from '@strapi/strapi/admin';
import adminGapsZhHans from './translations/admin-gaps.zh-Hans.json';
import contentManagerZhHans from './translations/content-manager.zh-Hans.json';
import uploadGapsZhHans from './translations/upload-gaps.zh-Hans.json';
import zhHansDomain from './translations/zh-Hans.json';
import { watchArchiveIdAutofill } from './authoring';
import favicon from './extensions/favicon.png';
import loginLogo from './extensions/login-logo.png';

/** Sampled from the processed MEME. wordmark (dark emerald, not the bright cyan fringe). */
const BRAND = '#2c8874';
const ADMIN_LOCALE = 'zh-Hans';
const ADMIN_LANGUAGE_KEY = 'strapi-admin-language';
const DOCUMENT_TITLE_SUFFIX = '迷因创作社';
const LOGIN_ERROR_ZH: Record<string, string> = {
  'Invalid credentials': '邮箱或密码不正确。',
};

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

function prefixPluginTranslations(
  messages: Record<string, string>,
  pluginId: string
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [`${pluginId}.${key}`, value])
  );
}

const zhHans = {
  ...adminGapsZhHans,
  ...prefixPluginTranslations(contentManagerZhHans, 'content-manager'),
  ...prefixPluginTranslations(uploadGapsZhHans, 'upload'),
  ...zhHansDomain,
};

function pinAdminLocale(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(ADMIN_LANGUAGE_KEY, ADMIN_LOCALE);
}

pinAdminLocale();

function keepPluginMenuLink(to: string): boolean {
  const path = to.replace(/^\//, '');
  return path === 'content-manager' || path.startsWith('content-manager/') || path === 'plugins/upload' || path.startsWith('plugins/upload/');
}

function pinDocumentTitle(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const apply = (): void => {
    if (document.title === 'Strapi Admin') {
      document.title = DOCUMENT_TITLE_SUFFIX;
      return;
    }
    if (document.title.endsWith(' | Strapi')) {
      document.title = `${document.title.slice(0, -' | Strapi'.length)} | ${DOCUMENT_TITLE_SUFFIX}`;
    }
  };

  apply();
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(apply).observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

function localizeLoginError(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const apply = (): void => {
    const el = document.getElementById('global-form-error');
    if (!el) {
      return;
    }
    const next = LOGIN_ERROR_ZH[el.textContent?.trim() ?? ''];
    if (next) {
      el.textContent = next;
    }
  };

  apply();
  new MutationObserver(apply).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function injectAdminChrome(): void {
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
    'a[href*="plugin::users-permissions"],',
    'li:has(a[href*="plugin::users-permissions"]),',
    '[aria-label="选择界面语言"],',
    '[aria-label="Select interface language"],',
    'header:has([aria-label="选择界面语言"]),',
    'header:has([aria-label="Select interface language"]),',
    'aside:has(a[href*="docs.strapi.io"]),',
    'a[href*="docs.strapi.io"] {',
    '  display: none !important;',
    '}',
  ].join('\n');
  document.head.appendChild(style);
}

export default {
  config: {
    locales: [ADMIN_LOCALE],
    translations: {
      [ADMIN_LOCALE]: zhHans,
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
    injectAdminChrome();
    pinDocumentTitle();
    localizeLoginError();
    watchArchiveIdAutofill();
    pinAdminLocale();
  },
};
