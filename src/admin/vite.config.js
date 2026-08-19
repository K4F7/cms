'use strict';

const { rewriteGetBasename, rewriteUnauthorizedLoginAssign } = require('../admin-paths');

function safeAdminLoginHrefPlugin() {
  return {
    name: 'cms-admin-401-login-href',
    enforce: 'pre',
    transform(code, id) {
      if (!code.includes('auth/login') && !code.includes('ADMIN_PATH')) {
        return null;
      }

      let next = code;
      if (id.includes('core/store/configure') || code.includes('window.location.href')) {
        next = rewriteUnauthorizedLoginAssign(next);
      }
      if (id.includes('core/utils/basename') || code.includes('const getBasename')) {
        next = rewriteGetBasename(next);
      }
      return next === code ? null : { code: next, map: null };
    },
  };
}

module.exports = (config) => ({
  ...config,
  plugins: [safeAdminLoginHrefPlugin(), ...(config.plugins || [])],
});
