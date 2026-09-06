import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mergeReleaseEnv,
  releaseCompose,
  removeEnvVar,
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

test('removeEnvVar drops CMS_IMAGE_DIGEST lines and keeps peers', () => {
  const before = [
    'DATABASE_HOST=127.0.0.1',
    'CMS_IMAGE_DIGEST=sha256:stale',
    'APP_VERSION=old',
    '',
  ].join('\n');
  const after = removeEnvVar(before, 'CMS_IMAGE_DIGEST');
  assert.doesNotMatch(after, /CMS_IMAGE_DIGEST/);
  assert.match(after, /^DATABASE_HOST=127\.0\.0\.1$/m);
  assert.match(after, /^APP_VERSION=old$/m);
});

test('mergeReleaseEnv pins CMS_IMAGE_TAG and APP_VERSION, drops digest', () => {
  const before = [
    'DATABASE_PASSWORD=secret',
    `CMS_IMAGE_TAG=${SHA}`,
    'APP_VERSION=stale-version',
    'CMS_IMAGE_DIGEST=sha256:olddigest',
    'DATABASE_HOST=127.0.0.1',
  ].join('\n');

  const after = mergeReleaseEnv(before, SHA2);
  assert.match(after, new RegExp(`^CMS_IMAGE_TAG=${SHA2}$`, 'm'));
  assert.match(after, new RegExp(`^APP_VERSION=${SHA2}$`, 'm'));
  assert.doesNotMatch(after, /CMS_IMAGE_DIGEST/);
  assert.doesNotMatch(after, /stale-version/);
  assert.doesNotMatch(after, new RegExp(SHA));
  assert.match(after, /^DATABASE_PASSWORD=secret$/m);
});

test('mergeReleaseEnv appends APP_VERSION when missing', () => {
  const before = 'DATABASE_HOST=127.0.0.1\n';
  const after = mergeReleaseEnv(before, SHA);
  assert.match(after, new RegExp(`^CMS_IMAGE_TAG=${SHA}$`, 'm'));
  assert.match(after, new RegExp(`^APP_VERSION=${SHA}$`, 'm'));
  assert.doesNotMatch(after, /CMS_IMAGE_DIGEST/);
});

test('releaseCompose GETs env, POSTs merged saveEnvironment, then deploy', async () => {
  const calls = [];
  const existing = [
    'DATABASE_PASSWORD=secret',
    `CMS_IMAGE_TAG=${SHA}`,
    'APP_VERSION=old-app',
    'CMS_IMAGE_DIGEST=sha256:keep-me-not',
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
  assert.match(saveBody.env, new RegExp(`^APP_VERSION=${SHA2}$`, 'm'));
  assert.doesNotMatch(saveBody.env, /CMS_IMAGE_DIGEST/);
  assert.doesNotMatch(saveBody.env, /old-app/);
  assert.match(saveBody.env, /^DATABASE_PASSWORD=secret$/m);
  assert.match(saveBody.env, /^DATABASE_HOST=127\.0\.0\.1$/m);
  assert.doesNotMatch(saveBody.env, new RegExp(SHA));

  assert.match(calls[2].url, /\/api\/compose\.deploy$/);
  assert.equal(calls[2].method, 'POST');
  assert.deepEqual(JSON.parse(calls[2].body), { composeId: 'comp1' });

  assert.equal(result.imageTag, SHA2);
  assert.match(result.env, new RegExp(`^APP_VERSION=${SHA2}$`, 'm'));
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
