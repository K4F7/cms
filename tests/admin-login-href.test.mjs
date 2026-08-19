/**
 * Contract for the root-mounted Admin 401 login href (K4F7/cms#29).
 * ADMIN_PATH=/ must not become //auth/login (host=auth).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SAFE_LOGIN_HREF,
  adminBasename,
  adminCookiePath,
  rewriteGetBasename,
  rewriteUnauthorizedLoginAssign,
  unauthorizedLoginHref,
} from '../src/admin-paths.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_ORIGIN = 'https://memecms.sein.moe';

function resolvedLogin(href, documentOrigin = ADMIN_ORIGIN) {
  return new URL(href, documentOrigin);
}

function assertSafeLoginHref(href, documentOrigin = ADMIN_ORIGIN) {
  const url = resolvedLogin(href, documentOrigin);
  assert.notEqual(url.hostname, 'auth', `401 href resolved to host=auth: ${href}`);
  assert.notEqual(url.host, 'auth', `401 href resolved to host=auth: ${href}`);
  assert.ok(
    href === '/auth/login' ||
      href === `${documentOrigin}/auth/login` ||
      url.href === `${documentOrigin}/auth/login`,
    `401 href must be /auth/login or ${documentOrigin}/auth/login, got ${href}`
  );
  assert.equal(url.origin, documentOrigin);
  assert.equal(url.pathname, '/auth/login');
}

test('401 join with ADMIN_PATH=/ is /auth/login, not host=auth', () => {
  const broken = `${'/'}/auth/login`;
  const brokenUrl = resolvedLogin(broken);
  assert.equal(broken, '//auth/login');
  assert.equal(brokenUrl.hostname, 'auth');

  const href = unauthorizedLoginHref('/');
  assert.equal(href, '/auth/login');
  assertSafeLoginHref(href);
});

test('401 join accepts empty basename and a full Admin origin without a trailing slash', () => {
  assertSafeLoginHref(unauthorizedLoginHref(''));
  assertSafeLoginHref(unauthorizedLoginHref(undefined));
  assertSafeLoginHref(unauthorizedLoginHref(ADMIN_ORIGIN));
  assertSafeLoginHref(unauthorizedLoginHref(`${ADMIN_ORIGIN}/`));
  assert.equal(adminBasename('/'), '');
  assert.equal(adminBasename(ADMIN_ORIGIN), '');
});

test('401 join keeps a non-root Admin path when that path model is in use', () => {
  assert.equal(unauthorizedLoginHref('/admin'), '/admin/auth/login');
  assert.equal(adminBasename('/admin'), '/admin');
});

test('cookie path follows the Admin mount instead of a hardcoded /admin', () => {
  assert.equal(adminCookiePath('/'), '/');
  assert.equal(adminCookiePath(ADMIN_ORIGIN), '/');
  assert.equal(adminCookiePath(`${ADMIN_ORIGIN}/`), '/');
  assert.equal(adminCookiePath('/admin'), '/admin');
});

test('rewriting Strapi 401 middleware never assigns //auth/login', () => {
  const configurePath = join(
    root,
    'node_modules/@strapi/admin/dist/admin/admin/src/core/store/configure.js'
  );
  const source = readFileSync(configurePath, 'utf8');
  assert.match(source, /window\.location\.href = `\$\{basename\$1\}\/auth\/login`/);

  const rewritten = rewriteUnauthorizedLoginAssign(source);
  assert.doesNotMatch(rewritten, /window\.location\.href = `\$\{[^}]+\}\/auth\/login`/);
  assert.match(rewritten, /window\.location\.href = \(function\(b\)/);
  assert.equal(rewritten.includes(SAFE_LOGIN_HREF), true);
});

test('rewriting getBasename treats / as an empty basename', () => {
  const basenamePath = join(
    root,
    'node_modules/@strapi/admin/dist/admin/admin/src/core/utils/basename.js'
  );
  const source = readFileSync(basenamePath, 'utf8');
  const rewritten = rewriteGetBasename(source);
  assert.notEqual(rewritten, source);
  assert.match(rewritten, /return t===''\|\|t==='\/'\?''\:t/);
});
