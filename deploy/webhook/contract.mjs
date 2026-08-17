import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Public deployment webhook seam for K4F7/cms#10.
 * Signatures cover the raw body and timestamp. Callers inject host effects
 * (pull / recreate / health / prune) so contract tests stay at this boundary.
 */

export function signDeployRequest(rawBody, timestamp, secret) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

function safeEqualHex(a, b) {
  try {
    const left = Buffer.from(String(a), 'utf8');
    const right = Buffer.from(String(b), 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function verifyDeploySignature({
  rawBody,
  timestamp,
  signature,
  secret,
  nowSeconds,
  maxSkewSeconds,
  seenReplayKeys,
}) {
  if (!secret || !timestamp || !signature) {
    return { ok: false, reason: 'missing' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'timestamp' };
  }

  if (Math.abs(nowSeconds - ts) > maxSkewSeconds) {
    return { ok: false, reason: 'expired' };
  }

  const expected = signDeployRequest(rawBody, timestamp, secret);
  if (!safeEqualHex(expected, signature)) {
    return { ok: false, reason: 'signature' };
  }

  const replayKey = `${timestamp}.${signature}`;
  if (seenReplayKeys.has(replayKey)) {
    return { ok: false, reason: 'replay' };
  }
  seenReplayKeys.add(replayKey);
  if (seenReplayKeys.size > 2048) {
    const oldest = seenReplayKeys.values().next().value;
    seenReplayKeys.delete(oldest);
  }
  return { ok: true };
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

async function runDeploy({ target, deps, promotePrevious, runtimeEnv }) {
  const state = await deps.readState();

  if (deps.writeRuntimeEnv) {
    await deps.writeRuntimeEnv({
      ...(runtimeEnv || {}),
      CMS_IMAGE_TAG: target.gitSha,
      APP_VERSION: target.gitSha,
      CMS_IMAGE_DIGEST: target.digest,
    });
  }

  await deps.pullImage(target.image);
  await deps.recreateApi(target.image);

  const health = await deps.waitForHealth({
    gitSha: target.gitSha,
    digest: target.digest,
  });

  if (!health?.ok) {
    return {
      statusCode: 503,
      body: {
        status: 'health_failed',
        gitSha: target.gitSha,
        imageDigest: target.digest,
      },
    };
  }

  const nextCurrent = {
    image: target.image,
    gitSha: target.gitSha,
    digest: target.digest,
  };
  const nextPrevious = promotePrevious
    ? state.current
    : state.current && state.current.gitSha !== nextCurrent.gitSha
      ? state.current
      : state.previous;

  await deps.writeState({
    current: nextCurrent,
    previous: nextPrevious || null,
  });

  await deps.pruneImages({
    current: nextCurrent.image,
    previous: nextPrevious?.image || null,
  });

  return {
    statusCode: 200,
    body: {
      status: 'ok',
      gitSha: nextCurrent.gitSha,
      imageDigest: nextCurrent.digest,
    },
  };
}

export async function handleDeployRequest({ rawBody, headers, deps }) {
  const verification = verifyDeploySignature({
    rawBody,
    timestamp: headerValue(headers, 'x-cms-timestamp'),
    signature: headerValue(headers, 'x-cms-signature'),
    secret: deps.secret,
    nowSeconds: deps.nowSeconds(),
    maxSkewSeconds: deps.maxSkewSeconds,
    seenReplayKeys: deps.seenReplayKeys,
  });

  if (!verification.ok) {
    return {
      statusCode: 401,
      body: { status: 'unauthorized', reason: verification.reason },
    };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: { status: 'bad_request', reason: 'json' } };
  }

  const action = payload.action || 'deploy';

  if (action === 'redeploy-previous') {
    const state = await deps.readState();
    if (!state.previous) {
      return {
        statusCode: 409,
        body: { status: 'no_previous_image' },
      };
    }
    return runDeploy({
      target: state.previous,
      deps,
      promotePrevious: true,
      runtimeEnv: payload.runtimeEnv || null,
    });
  }

  if (action !== 'deploy') {
    return { statusCode: 400, body: { status: 'bad_request', reason: 'action' } };
  }

  if (!payload.gitSha || !payload.image || !payload.digest) {
    return {
      statusCode: 400,
      body: { status: 'bad_request', reason: 'target' },
    };
  }

  return runDeploy({
    target: {
      gitSha: payload.gitSha,
      image: payload.image,
      digest: payload.digest,
    },
    deps,
    promotePrevious: false,
    runtimeEnv: payload.runtimeEnv || null,
  });
}
