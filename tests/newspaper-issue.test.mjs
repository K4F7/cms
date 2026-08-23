/**
 * Newspaper Issue collection for Archive Administrator authoring (K4F7/cms#35).
 * Entry path is 期数 + PDF. Public REST CRUD stays closed.
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

test('Newspaper Issue schema is 期数 plus PDF', () => {
  const schema = loadJson(
    'src/api/newspaper-issue/content-types/newspaper-issue/schema.json'
  );
  assert.equal(schema.kind, 'collectionType');
  assert.equal(schema.info.singularName, 'newspaper-issue');
  assert.equal(schema.info.displayName, 'Newspaper Issue');
  assert.equal(schema.options.draftAndPublish, true);
  assert.equal(schema.attributes.issueNumber.required, true);
  assert.equal(schema.attributes.issueNumber.unique, true);
  assert.equal(schema.attributes.title.required, undefined);
  assert.equal(schema.attributes.archiveId.required, true);
  assert.equal(schema.attributes.archiveId.unique, true);
  assert.equal(schema.attributes.pdf.type, 'media');
  assert.equal(schema.attributes.pdf.multiple, false);
  assert.deepEqual(schema.attributes.pdf.allowedTypes, ['files']);
  assert.equal(schema.attributes.sourceLink.type, 'string');
  assert.deepEqual(Object.keys(schema.attributes), [
    'issueNumber',
    'pdf',
    'title',
    'archiveId',
    'sourceLink',
  ]);
});

test('Newspaper Issue content-api CRUD is closed', () => {
  const routes = readFileSync(
    join(root, 'src/api/newspaper-issue/routes/newspaper-issue.ts'),
    'utf8'
  );
  assert.match(routes, /except: \['find', 'findOne', 'create', 'update', 'delete'\]/);
});

test('Newspaper Issue generates archive id from 期数 when omitted', () => {
  const lifecycles = readFileSync(
    join(root, 'src/api/newspaper-issue/content-types/newspaper-issue/lifecycles.ts'),
    'utf8'
  );
  assert.match(lifecycles, /suggestedArchiveId\('paper'/);
  assert.match(lifecycles, /data\.title = issueNumber/);
});
