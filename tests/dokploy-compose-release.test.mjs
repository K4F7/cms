import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  releaseCompose,
  upsertEnvVar,
} from '../scripts/dokploy-compose-release.mjs';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

test('upsertEnvVar replaces an existing CMS_IMAGE_TAG line and keeps peers', () => {
  const before = [
    'DATABASE_HOST=127.0.0.1',
    'CMS_IMAGE_TAG=old',
    'DATABASE_NAME=cms',
    '',
  ].join('\n');

  const after = upsertEnvVar(before, 'CMS_IMAGE_TAG', SHA);
  assert.match(after, new RegExp(`^CMS_IMAGE_TAG=${SHA}$`, 'm'));
  assert.match(after, /^DATABASE_HOST=127\.0\.0\.1$/m);
  assert.match(after, /^DATABASE_NAME=cms$/m);
  assert.doesNotMatch(after, /CMS_IMAGE_TAG=old/);
});

test('upsertEnvVar appends CMS_IMAGE_TAG when missing', () => {
  const before = 'DATABASE_HOST=127.0.0.1\nDATABASE_NAME=cms\n';
  const after = upsertEnvVar(before, 'CMS_IMAGE_TAG', SHA);
  assert.match(after, new RegExp(`CMS_IMAGE_TAG=${SHA}`));
  assert.match(after, /^DATABASE_HOST=127\.0\.0\.1$/m);
});

test('releaseCompose GETs env, POSTs merged saveEnvironment, then deploy', async () => {
  const calls = [];
  const existing = [
    'DATABASE_PASSWORD=secret',
    `CMS_IMAGE_TAG=${SHA}`,
    'DATABASE_HOST=127.0.0.1',
  ].join('\n');

  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body || null });
    if (String(url).includes('compose.one')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ composeId: 'comp1', env: existing });
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return '{}';
      },
    };
  };

  const result = await releaseCompose({
    baseUrl: 'https://dokploy.example',
    apiKey: 'test-key',
    composeId: 'comp1',
    imageTag: SHA2,
    fetchImpl,
  });

  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /\/api\/compose\.one\?composeId=comp1$/);
  assert.equal(calls[0].method, 'GET');

  assert.match(calls[1].url, /\/api\/compose\.saveEnvironment$/);
  assert.equal(calls[1].method, 'POST');
  const saveBody = JSON.parse(calls[1].body);
  assert.equal(saveBody.composeId, 'comp1');
  assert.match(saveBody.env, new RegExp(`^CMS_IMAGE_TAG=${SHA2}$`, 'm'));
  assert.match(saveBody.env, /^DATABASE_PASSWORD=secret$/m);
  assert.match(saveBody.env, /^DATABASE_HOST=127\.0\.0\.1$/m);
  assert.doesNotMatch(saveBody.env, new RegExp(SHA));

  assert.match(calls[2].url, /\/api\/compose\.deploy$/);
  assert.equal(calls[2].method, 'POST');
  assert.deepEqual(JSON.parse(calls[2].body), { composeId: 'comp1' });

  assert.equal(result.imageTag, SHA2);
});

test('releaseCompose fails the job when Dokploy returns non-2xx', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    async text() {
      return JSON.stringify({ message: 'boom' });
    },
  });

  await assert.rejects(
    () =>
      releaseCompose({
        baseUrl: 'https://dokploy.example',
        apiKey: 'test-key',
        composeId: 'comp1',
        imageTag: SHA,
        fetchImpl,
      }),
    /HTTP 500/,
  );
});

test('releaseCompose rejects non-sha tags', async () => {
  await assert.rejects(
    () =>
      releaseCompose({
        baseUrl: 'https://dokploy.example',
        apiKey: 'test-key',
        composeId: 'comp1',
        imageTag: 'latest',
        fetchImpl: async () => {
          throw new Error('fetch should not run');
        },
      }),
    /full 40-char git sha/,
  );
});
