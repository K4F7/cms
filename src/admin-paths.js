'use strict';

/**
 * Safe Admin path helpers for the root-mounted Admin (`ADMIN_PATH=/`).
 *
 * Strapi's 401 middleware does `${ADMIN_PATH}/auth/login`. When the path is
 * `/`, that becomes `//auth/login`, which the browser treats as host=`auth`.
 */

function adminBasename(adminPath) {
  const raw = String(adminPath ?? '');
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname;
    } catch {
      path = raw;
    }
  }
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' || trimmed === '/' ? '' : trimmed;
}

function unauthorizedLoginHref(adminPath) {
  const base = adminBasename(adminPath);
  return base ? `${base}/auth/login` : '/auth/login';
}

function adminCookiePath(adminUrl) {
  return adminBasename(adminUrl) || '/';
}

/** Inlined into the Admin bundle so the 401 middleware never emits //auth/login. */
const SAFE_LOGIN_HREF =
  '(function(b){var t=String(b==null?"":b).replace(/\\/+$/,"");return t?t+"/auth/login":"/auth/login"})';

function rewriteUnauthorizedLoginAssign(code) {
  return code.replace(
    /window\.location\.href\s*=\s*`\$\{([^}]+)\}\/auth\/login`/g,
    (_, expr) => `window.location.href = ${SAFE_LOGIN_HREF}(${expr})`
  );
}

function rewriteGetBasename(code) {
  return code.replace(
    /const getBasename = \(\)=\>\(process\.env\.ADMIN_PATH \?\? ['"]{2}\)\.replace\(window\.location\.origin, ['"]{2}\);/g,
    "const getBasename = ()=>{const r=(process.env.ADMIN_PATH ?? '').replace(typeof window==='undefined'?'':window.location.origin,'');const t=String(r).replace(/\\/+$/,'');return t===''||t==='/'?'':t;};"
  );
}

module.exports = {
  adminBasename,
  unauthorizedLoginHref,
  adminCookiePath,
  rewriteUnauthorizedLoginAssign,
  rewriteGetBasename,
  SAFE_LOGIN_HREF,
};
