'use strict';

const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { rewriteGetBasename, rewriteUnauthorizedLoginAssign } = require('../admin-paths');
const { rewriteDocumentTitle, rewriteIndexHtml } = require('../admin-chrome');

function rewriteBuiltIndexHtml() {
  const candidates = [
    join(__dirname, '..', '..', 'dist', 'build', 'index.html'),
    join(__dirname, '..', '..', 'build', 'index.html'),
  ];
  for (const indexPath of candidates) {
    if (!existsSync(indexPath)) {
      continue;
    }
    const html = readFileSync(indexPath, 'utf8');
    const next = rewriteIndexHtml(html);
    if (next !== html) {
      writeFileSync(indexPath, next);
    }
  }
}

function adminChromePlugin() {
  return {
    name: 'cms-admin-chrome',
    enforce: 'pre',
    transform(code, id) {
      let next = code;
      if (code.includes('auth/login') || code.includes('ADMIN_PATH')) {
        if (id.includes('core/store/configure') || code.includes('window.location.href')) {
          next = rewriteUnauthorizedLoginAssign(next);
        }
        if (id.includes('core/utils/basename') || code.includes('const getBasename')) {
          next = rewriteGetBasename(next);
        }
      }
      if (next.includes('document.title = `${title} | Strapi`')) {
        next = rewriteDocumentTitle(next);
      }
      return next === code ? null : { code: next, map: null };
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return rewriteIndexHtml(html);
      },
    },
    closeBundle() {
      rewriteBuiltIndexHtml();
    },
  };
}

module.exports = (config) => ({
  ...config,
  plugins: [adminChromePlugin(), ...(config.plugins || [])],
});
