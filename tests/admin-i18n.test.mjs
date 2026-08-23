/**
 * Admin zh-Hans overlay coverage (K4F7/cms#33).
 * Official content-manager zh-Hans is the admin catalog copied in;
 * upload and admin catalogs are incomplete. This overlay must cover
 * every English key Archive Administrator chrome can show.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

function missingKeys(english, chinese) {
  return Object.keys(english).filter((key) => !(key in chinese)).sort();
}

const appSource = readFileSync(join(root, 'src/admin/app.tsx'), 'utf8');
const domain = loadJson('src/admin/translations/zh-Hans.json');
const adminGaps = loadJson('src/admin/translations/admin-gaps.zh-Hans.json');
const contentManager = loadJson('src/admin/translations/content-manager.zh-Hans.json');
const uploadGaps = loadJson('src/admin/translations/upload-gaps.zh-Hans.json');

const adminEn = (await import('../node_modules/@strapi/admin/dist/admin/admin/src/translations/en.json.mjs')).default;
const adminZh = (await import('../node_modules/@strapi/admin/dist/admin/admin/src/translations/zh-Hans.json.mjs')).default;
const contentManagerEn = (
  await import('../node_modules/@strapi/content-manager/dist/admin/translations/en.json.mjs')
).default;
const uploadEn = (await import('../node_modules/@strapi/upload/dist/admin/translations/en.json.mjs')).default;
const uploadZh = (await import('../node_modules/@strapi/upload/dist/admin/translations/zh-Hans.json.mjs')).default;

test('Admin bundle pins zh-Hans before render and only registers that locale', () => {
  assert.match(appSource, /const ADMIN_LOCALE = 'zh-Hans'/);
  assert.match(appSource, /localStorage\.setItem\(ADMIN_LANGUAGE_KEY, ADMIN_LOCALE\)/);
  assert.match(appSource, /^pinAdminLocale\(\);$/m);
  assert.match(appSource, /locales: \[ADMIN_LOCALE\]/);
  assert.equal(appSource.includes("if (localStorage.getItem('strapi-admin-language') === null)"), false);
});

test('content-manager overlay covers the English catalog plus the plugin name', () => {
  const missing = missingKeys(contentManagerEn, contentManager);
  assert.deepEqual(missing, []);
  assert.equal(contentManager['plugin.name'], '内容管理');
});

test('upload overlay covers English keys missing from official zh-Hans', () => {
  const officialMissing = missingKeys(uploadEn, uploadZh);
  const missing = officialMissing.filter((key) => !(key in uploadGaps));
  assert.deepEqual(missing, []);
});

test('admin overlay covers English keys missing from official zh-Hans', () => {
  const officialMissing = missingKeys(adminEn, adminZh);
  const missing = officialMissing.filter((key) => !(key in adminGaps) && !(key in domain));
  assert.deepEqual(missing, []);
});

test('Work type, fields, and chrome stay in the domain overlay', () => {
  assert.equal(domain.Work, '作品');
  assert.equal(domain['content-manager.content-types.api::work.work.title'], '标题');
  assert.equal(domain['content-manager.content-types.api::work.work.archiveId'], '档案标识');
  assert.equal(domain['content-manager.content-types.api::work.work.summary'], '文字');
  assert.equal(domain['content-manager.content-types.api::work.work.mediaItems'], '图片');
  assert.equal(domain['Newspaper Issue'], '报纸');
  assert.equal(
    domain['content-manager.content-types.api::newspaper-issue.newspaper-issue.issueNumber'],
    '期数'
  );
  assert.equal(
    domain['content-manager.content-types.api::newspaper-issue.newspaper-issue'],
    '报纸'
  );
  assert.equal(
    domain['content-manager.content-types.api::newspaper-issue.newspaper-issue.archiveId'],
    '档案标识'
  );
  assert.equal(domain['search.placeholder'], '搜索');
  assert.equal(contentManager['containers.list.table-headers.status'], '状态');
  assert.equal(domain['Auth.form.welcome.subtitle'], '登录迷因创作社');
  assert.equal(domain['app.components.Logout.profile'], '个人资料');
  assert.equal(domain['Content Manager'], '内容管理');
  assert.equal(domain['upload.plugin.name'], '媒体库');
});
