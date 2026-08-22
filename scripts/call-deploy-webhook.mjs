/**
 * Call the louis deploy webhook with an HMAC over body + timestamp.
 * Used by GitHub Actions (K4F7/cms#10). Does not print the request body.
 */
import { signDeployRequest } from '../deploy/webhook/contract.mjs';
import { mergeRuntimeEnv } from './runtime-env.mjs';

const url = process.env.CMS_DEPLOY_WEBHOOK_URL;
const secret = process.env.CMS_DEPLOY_WEBHOOK_SECRET;

if (!url || !secret) {
  console.error('CMS_DEPLOY_WEBHOOK_URL and CMS_DEPLOY_WEBHOOK_SECRET are required');
  process.exit(1);
}

const action = process.argv[2] || 'deploy';
const gitSha = process.env.CMS_GIT_SHA || process.env.GITHUB_SHA;
const image = process.env.CMS_IMAGE_REF;
const digest = process.env.CMS_IMAGE_DIGEST;
const runtimeEnv = mergeRuntimeEnv(process.env.CMS_RUNTIME_ENV_JSON, {
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
  PUBLIC_URL: process.env.PUBLIC_URL,
});

const payload =
  action === 'redeploy-previous'
    ? { action: 'redeploy-previous', runtimeEnv }
    : {
        action: 'deploy',
        gitSha,
        image,
        digest,
        runtimeEnv,
      };

if (action === 'deploy' && (!gitSha || !image || !digest)) {
  console.error('CMS_GIT_SHA, CMS_IMAGE_REF, and CMS_IMAGE_DIGEST are required for deploy');
  process.exit(1);
}

const rawBody = JSON.stringify(payload);
const timestamp = Math.floor(Date.now() / 1000);
const signature = signDeployRequest(rawBody, timestamp, secret);

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-cms-timestamp': String(timestamp),
    'x-cms-signature': signature,
  },
  body: rawBody,
});

const text = await res.text();
let json = null;
try {
  json = JSON.parse(text);
} catch {
  json = null;
}

if (!res.ok) {
  console.error('deploy webhook failed', res.status, json || text);
  process.exit(1);
}

console.log(
  JSON.stringify({
    status: json?.status,
    gitSha: json?.gitSha,
    imageDigest: json?.imageDigest,
  })
);
