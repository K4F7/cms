import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateArchiveId, slugArchivePart, suggestedArchiveId } from '../src/archive-id.js';

test('slugArchivePart keeps readable 期数 and titles', () => {
  assert.equal(slugArchivePart('2024-03'), '2024-03');
  assert.equal(slugArchivePart('  第 12 期 '), '第-12-期');
  assert.equal(slugArchivePart('Hello, Work!'), 'hello-work');
  assert.equal(slugArchivePart(''), 'item');
});

test('suggestedArchiveId prefixes work and paper ids', () => {
  assert.equal(suggestedArchiveId('paper', '12'), 'paper-12');
  assert.equal(suggestedArchiveId('work', '春游'), 'work-春游');
});

test('allocateArchiveId skips taken values', async () => {
  const taken = new Set(['paper-12', 'paper-12-2']);
  const strapi = {
    db: {
      query() {
        return {
          findOne({ where }) {
            return taken.has(where.archiveId) ? { archiveId: where.archiveId } : null;
          },
        };
      },
    },
  };
  assert.equal(await allocateArchiveId(strapi, 'api::newspaper-issue.newspaper-issue', 'paper-12'), 'paper-12-3');
  assert.equal(await allocateArchiveId(strapi, 'api::newspaper-issue.newspaper-issue', 'paper-99'), 'paper-99');
});
