import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NEWSPAPER_LAYOUT, WORK_LAYOUT } from '../src/authoring-layouts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexSource = readFileSync(join(root, 'src/index.ts'), 'utf8');
const appSource = readFileSync(join(root, 'src/admin/app.tsx'), 'utf8');

test('Work edit layout is title, text, images, then archive id', () => {
  assert.deepEqual(
    WORK_LAYOUT.layouts.edit.flat().map((field) => field.name),
    ['title', 'author', 'summary', 'mediaItems', 'archiveId']
  );
  assert.equal(WORK_LAYOUT.metadatas.summary.edit.label, '文字');
  assert.equal(WORK_LAYOUT.metadatas.mediaItems.edit.label, '图片');
  assert.equal(WORK_LAYOUT.settings.mainField, 'title');
});

test('Newspaper edit layout is 期数 then PDF', () => {
  assert.deepEqual(
    NEWSPAPER_LAYOUT.layouts.edit.flat().map((field) => field.name),
    ['issueNumber', 'pdf', 'title', 'archiveId', 'sourceLink']
  );
  assert.equal(NEWSPAPER_LAYOUT.metadatas.issueNumber.edit.label, '期数');
  assert.equal(NEWSPAPER_LAYOUT.metadatas.pdf.edit.label, 'PDF 文件');
  assert.equal(NEWSPAPER_LAYOUT.settings.mainField, 'issueNumber');
  assert.deepEqual(NEWSPAPER_LAYOUT.layouts.list, ['issueNumber', 'title', 'archiveId']);
});

test('bootstrap applies authoring layouts and the Admin auto-fills archive id', () => {
  assert.match(indexSource, /applyAuthoringLayouts\(strapi\)/);
  assert.match(appSource, /watchArchiveIdAutofill/);
});
