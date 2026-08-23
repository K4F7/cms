/**
 * Admin chrome contracts for K4F7/cms#35:
 * homepage after login, Chinese Works/Newspaper columns, hide language
 * and preview, keep forgot-password.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DOCUMENT_TITLE_SUFFIX,
  USERS_PERMISSIONS_CONTENT_TYPES,
  hideFromContentManager,
  rewriteDocumentTitle,
  rewriteIndexHtml,
} from '../src/admin-chrome.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(join(root, 'src/admin/app.tsx'), 'utf8');
const indexSource = readFileSync(join(root, 'src/index.ts'), 'utf8');

test('users-permissions types are hidden from Content Manager', () => {
  assert.deepEqual(USERS_PERMISSIONS_CONTENT_TYPES, [
    'plugin::users-permissions.user',
    'plugin::users-permissions.role',
  ]);
  const hidden = hideFromContentManager({ pluginOptions: { existing: true } });
  assert.equal(hidden.pluginOptions['content-manager'].visible, false);
  assert.equal(hidden.pluginOptions['content-type-builder'].visible, false);
  assert.equal(hidden.pluginOptions.existing, true);
  assert.equal(hideFromContentManager(undefined), undefined);
  assert.match(indexSource, /hideFromContentManager\(strapi\.contentType\(uid/);
});

test('document title drops Strapi and uses 迷因创作社', () => {
  const rewritten = rewriteDocumentTitle('document.title = `${title} | Strapi`;');
  assert.equal(rewritten, `document.title = \`\${title} | ${DOCUMENT_TITLE_SUFFIX}\`;`);
  const html = rewriteIndexHtml(
    '<!DOCTYPE html><html lang="en"><head><title>Strapi Admin</title></head></html>'
  );
  assert.match(html, /<html lang="zh-Hans">/);
  assert.match(html, /<title>迷因创作社<\/title>/);
  assert.match(appSource, /DOCUMENT_TITLE_SUFFIX = '迷因创作社'/);
});

test('login chrome hides language and preview, keeps forgot-password and homepage', () => {
  assert.match(appSource, /aria-label="选择界面语言"/);
  assert.match(appSource, /docs\.strapi\.io/);
  assert.match(appSource, /plugin::users-permissions/);
  assert.equal(appSource.includes('forgot-password'), false);
  assert.equal(appSource.includes("window.location.replace"), false);
  assert.equal(appSource.includes('aria-label="首页"'), false);
  assert.match(appSource, /Invalid credentials/);
  assert.match(appSource, /watchArchiveIdAutofill/);
});
