/**
 * Deployment webhook seam (K4F7/cms#10).
 * Asserts the HTTPS webhook contract: signature gate, successful publish,
 * health failure, and previous-image rebuild. Does not couple to shell
 * function structure inside the deploy scripts.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  handleDeployRequest,
  signDeployRequest,
  verifyDeploySignature,
} from '../deploy/webhook/contract.mjs';

const SECRET = 'test-deploy-webhook-secret';

function signedHeaders(rawBody, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  return {
    'content-type': 'application/json',
    'x-cms-timestamp': String(timestamp),
    'x-cms-signature': signDeployRequest(rawBody, timestamp, secret),
  };
}

function fakeDeps(overrides = {}) {
  const calls = {
    pull: [],
    recreate: [],
    health: [],
    prune: [],
    writeEnv: [],
  };
  const state = {
    current: null,
    previous: null,
  };

  return {
    calls,
    state,
    deps: {
      nowSeconds: () => Math.floor(Date.now() / 1000),
      maxSkewSeconds: 300,
      secret: SECRET,
      seenReplayKeys: new Set(),
      readState: async () => ({ ...state }),
      writeState: async (next) => {
        state.current = next.current;
        state.previous = next.previous;
      },
      writeRuntimeEnv: async (env) => {
        calls.writeEnv.push(env);
      },
      pullImage: async (imageRef) => {
        calls.pull.push(imageRef);
      },
      recreateApi: async (imageRef) => {
        calls.recreate.push(imageRef);
      },
      waitForHealth: async (expected) => {
        calls.health.push(expected);
        if (overrides.healthResult) {
          return overrides.healthResult(expected);
        }
        return {
          ok: true,
          version: expected.gitSha,
          imageDigest: expected.digest,
        };
      },
      pruneImages: async (keep) => {
        calls.prune.push(keep);
      },
      ...overrides.deps,
    },
  };
}

test('verifyDeploySignature accepts a timely HMAC over body and timestamp', () => {
  const rawBody = '{"gitSha":"abc","image":"ghcr.io/k4f7/cms:abc"}';
  const timestamp = 1_700_000_000;
  const signature = signDeployRequest(rawBody, timestamp, SECRET);

  const result = verifyDeploySignature({
    rawBody,
    timestamp: String(timestamp),
    signature,
    secret: SECRET,
    nowSeconds: timestamp + 30,
    maxSkewSeconds: 300,
    seenReplayKeys: new Set(),
  });

  assert.equal(result.ok, true);
});

test('verifyDeploySignature rejects wrong, expired, and replayed signatures', () => {
  const rawBody = '{"gitSha":"abc"}';
  const timestamp = 1_700_000_000;
  const signature = signDeployRequest(rawBody, timestamp, SECRET);
  const seenReplayKeys = new Set();

  assert.equal(
    verifyDeploySignature({
      rawBody,
      timestamp: String(timestamp),
      signature: 'deadbeef',
      secret: SECRET,
      nowSeconds: timestamp,
      maxSkewSeconds: 300,
      seenReplayKeys,
    }).ok,
    false
  );

  assert.equal(
    verifyDeploySignature({
      rawBody,
      timestamp: String(timestamp),
      signature,
      secret: SECRET,
      nowSeconds: timestamp + 301,
      maxSkewSeconds: 300,
      seenReplayKeys,
    }).ok,
    false
  );

  const first = verifyDeploySignature({
    rawBody,
    timestamp: String(timestamp),
    signature,
    secret: SECRET,
    nowSeconds: timestamp,
    maxSkewSeconds: 300,
    seenReplayKeys,
  });
  assert.equal(first.ok, true);

  const replay = verifyDeploySignature({
    rawBody,
    timestamp: String(timestamp),
    signature,
    secret: SECRET,
    nowSeconds: timestamp + 1,
    maxSkewSeconds: 300,
    seenReplayKeys,
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'replay');
});

test('invalid webhook signature fails closed without pulling or recreating', async () => {
  const { calls, deps } = fakeDeps();
  const rawBody = JSON.stringify({
    action: 'deploy',
    gitSha: 'deadbeef',
    image: 'ghcr.io/k4f7/cms:deadbeef',
    digest: 'sha256:1',
  });

  const result = await handleDeployRequest({
    rawBody,
    headers: {
      'x-cms-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-cms-signature': createHmac('sha256', SECRET).update('nope').digest('hex'),
    },
    deps,
  });

  assert.equal(result.statusCode, 401);
  assert.equal(calls.pull.length, 0);
  assert.equal(calls.recreate.length, 0);
  assert.equal(calls.prune.length, 0);
});

test('successful deploy pulls the requested image and reports sha plus digest', async () => {
  const { calls, state, deps } = fakeDeps();
  const payload = {
    action: 'deploy',
    gitSha: 'abc1234',
    image: 'ghcr.io/k4f7/cms:abc1234',
    digest: 'sha256:digest-abc',
  };
  const rawBody = JSON.stringify(payload);
  const headers = signedHeaders(rawBody);

  const result = await handleDeployRequest({ rawBody, headers, deps });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    status: 'ok',
    gitSha: 'abc1234',
    imageDigest: 'sha256:digest-abc',
  });
  assert.deepEqual(calls.pull, ['ghcr.io/k4f7/cms:abc1234']);
  assert.deepEqual(calls.recreate, ['ghcr.io/k4f7/cms:abc1234']);
  assert.equal(calls.health.length, 1);
  assert.deepEqual(calls.prune[0], {
    current: 'ghcr.io/k4f7/cms:abc1234',
    previous: null,
  });
  assert.equal(state.current.image, 'ghcr.io/k4f7/cms:abc1234');
  assert.equal(state.current.gitSha, 'abc1234');
  assert.equal(state.previous, null);
});

test('failed health check fails the deploy and does not prune diagnostic images', async () => {
  const { calls, state, deps } = fakeDeps({
    healthResult: async () => ({ ok: false, version: 'missing', imageDigest: null }),
  });
  state.current = {
    image: 'ghcr.io/k4f7/cms:old',
    gitSha: 'old',
    digest: 'sha256:old',
  };

  const payload = {
    action: 'deploy',
    gitSha: 'badcafe',
    image: 'ghcr.io/k4f7/cms:badcafe',
    digest: 'sha256:bad',
  };
  const rawBody = JSON.stringify(payload);

  const result = await handleDeployRequest({
    rawBody,
    headers: signedHeaders(rawBody),
    deps,
  });

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, 'health_failed');
  assert.equal(calls.pull.length, 1);
  assert.equal(calls.recreate.length, 1);
  assert.equal(calls.prune.length, 0);
  assert.equal(state.current.gitSha, 'old');
});

test('redeploy-previous rebuilds the last successful image through the same webhook', async () => {
  const { calls, state, deps } = fakeDeps();
  state.current = {
    image: 'ghcr.io/k4f7/cms:newer',
    gitSha: 'newer',
    digest: 'sha256:newer',
  };
  state.previous = {
    image: 'ghcr.io/k4f7/cms:older',
    gitSha: 'older',
    digest: 'sha256:older',
  };

  const payload = { action: 'redeploy-previous' };
  const rawBody = JSON.stringify(payload);

  const result = await handleDeployRequest({
    rawBody,
    headers: signedHeaders(rawBody),
    deps,
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    status: 'ok',
    gitSha: 'older',
    imageDigest: 'sha256:older',
  });
  assert.deepEqual(calls.pull, ['ghcr.io/k4f7/cms:older']);
  assert.deepEqual(calls.recreate, ['ghcr.io/k4f7/cms:older']);
  assert.equal(state.current.gitSha, 'older');
  assert.equal(state.previous.gitSha, 'newer');
});
