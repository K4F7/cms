import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeRuntimeEnv } from '../scripts/runtime-env.mjs';

test('mergeRuntimeEnv returns undefined when nothing is set', () => {
  assert.equal(mergeRuntimeEnv(undefined, {}), undefined);
  assert.equal(mergeRuntimeEnv('', { ADMIN_ORIGIN: '' }), undefined);
});

test('mergeRuntimeEnv prefers public extras over JSON for the same key', () => {
  const merged = mergeRuntimeEnv(
    JSON.stringify({ ADMIN_ORIGIN: 'https://old.example', APP_KEYS: 'secret' }),
    { ADMIN_ORIGIN: 'https://meme.sein.moe', PUBLIC_URL: 'https://cms.sein.moe' }
  );
  assert.deepEqual(merged, {
    ADMIN_ORIGIN: 'https://meme.sein.moe',
    APP_KEYS: 'secret',
    PUBLIC_URL: 'https://cms.sein.moe',
  });
});

test('mergeRuntimeEnv rejects a non-object JSON payload', () => {
  assert.throws(() => mergeRuntimeEnv('[]', {}), /JSON object/);
});
