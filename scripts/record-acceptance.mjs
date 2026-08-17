/**
 * Record redacted first-version acceptance evidence (K4F7/cms#11).
 * Talks to the running production-shaped stack (or configured origins).
 * Does not print or write secrets.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import {
  handleDeployRequest,
  signDeployRequest,
} from '../deploy/webhook/contract.mjs';
import { cookieFlags, originAndPath, redactAcceptance } from './acceptance-evidence.mjs';
import { ADMIN, APP_VERSION, IMAGE_DIGEST, ORIGINS, chromePath, root } from './lib.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

const apiOrigin = process.env.CMS_API_ORIGIN || ORIGINS.api;
const adminOrigin = process.env.CMS_ADMIN_ORIGIN || ORIGINS.admin;
const unapprovedOrigin = process.env.CMS_UNAPPROVED_ORIGIN || ORIGINS.unapproved;
const evidenceDir =
  process.env.CMS_ACCEPTANCE_EVIDENCE_DIR || join(root, 'docs', 'acceptance');

async function raw(url, init = {}) {
  const res = await fetch(url, init);
  const headers = {};
  for (const [key, value] of res.headers.entries()) headers[key.toLowerCase()] = value;
  const setCookie = res.headers.getSetCookie?.() || [];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers, setCookie, text, json };
}

function accessToken(payload) {
  return payload?.data?.token || payload?.data?.accessToken || payload?.token || null;
}

export async function recordAcceptance() {
  mkdirSync(evidenceDir, { recursive: true });
  const checks = [];

  function check(name, ok, detail) {
    checks.push({ name, ok, detail });
  }

  const health = await raw(`${apiOrigin}/health`);
  check(
    'health reports version and image digest',
    health.status === 200 &&
      health.json?.status === 'ok' &&
      health.json?.version === (process.env.APP_VERSION || APP_VERSION) &&
      health.json?.imageDigest === (process.env.CMS_IMAGE_DIGEST || IMAGE_DIGEST),
    {
      status: health.status,
      statusField: health.json?.status,
      version: health.json?.version,
      imageDigest: health.json?.imageDigest,
    }
  );

  const allowed = await raw(`${apiOrigin}/admin/init`, {
    method: 'OPTIONS',
    headers: {
      Origin: adminOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  check(
    'CORS allows the configured Admin origin with credentials',
    allowed.headers['access-control-allow-origin'] === adminOrigin &&
      String(allowed.headers['access-control-allow-credentials']) === 'true',
    {
      status: allowed.status,
      allowOrigin: allowed.headers['access-control-allow-origin'] || null,
      allowCredentials: allowed.headers['access-control-allow-credentials'] || null,
    }
  );

  const rejected = await raw(`${apiOrigin}/admin/init`, {
    method: 'OPTIONS',
    headers: {
      Origin: unapprovedOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  check(
    'CORS rejects an unapproved origin',
    rejected.headers['access-control-allow-origin'] === undefined,
    {
      status: rejected.status,
      allowOrigin: rejected.headers['access-control-allow-origin'] || null,
    }
  );

  const failedLogin = await raw(`${apiOrigin}/admin/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: adminOrigin,
    },
    body: JSON.stringify({ email: ADMIN.email, password: 'wrong-password' }),
  });
  check(
    'invalid credentials fail closed without a session cookie',
    failedLogin.status >= 400 &&
      failedLogin.setCookie.every((cookie) => !/jwtToken|strapi_admin_refresh/i.test(cookie)),
    {
      status: failedLogin.status,
      cookieNames: failedLogin.setCookie.map((cookie) => cookie.split('=')[0]),
    }
  );

  const login = await raw(`${apiOrigin}/admin/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: adminOrigin,
    },
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
  });
  const token = accessToken(login.json);
  const cookies = cookieFlags(login.setCookie);
  const refresh = cookies.find((cookie) => cookie.name === 'strapi_admin_refresh');
  check(
    'Admin login sets a credentialed refresh cookie',
    login.status === 200 &&
      Boolean(token) &&
      refresh?.httpOnly === true &&
      refresh?.secure === true &&
      refresh?.sameSite === 'none' &&
      refresh?.path === '/admin',
    {
      status: login.status,
      cookies,
    }
  );

  const dead = await raw(`${apiOrigin}/admin/users/me`, {
    headers: {
      Origin: adminOrigin,
      Authorization: 'Bearer dead.token.value',
    },
  });
  check(
    'invalid session returns explicit unauthenticated feedback',
    dead.status === 401 || dead.status === 403,
    { status: dead.status }
  );

  const secret = 'acceptance-deploy-secret';
  const timestamp = Math.floor(Date.now() / 1000);
  const deployBody = JSON.stringify({
    action: 'deploy',
    gitSha: 'acceptsha',
    image: 'ghcr.io/k4f7/cms:acceptsha',
    digest: 'sha256:accept',
  });
  const calls = { pull: 0, recreate: 0, prune: 0 };
  const invalid = await handleDeployRequest({
    rawBody: deployBody,
    headers: {
      'x-cms-timestamp': String(timestamp),
      'x-cms-signature': 'deadbeef',
    },
    deps: {
      nowSeconds: () => timestamp,
      maxSkewSeconds: 300,
      secret,
      seenReplayKeys: new Set(),
      readState: async () => ({ current: null, previous: null }),
      writeState: async () => {},
      pullImage: async () => {
        calls.pull += 1;
      },
      recreateApi: async () => {
        calls.recreate += 1;
      },
      waitForHealth: async () => ({ ok: true, version: 'acceptsha', imageDigest: 'sha256:accept' }),
      pruneImages: async () => {
        calls.prune += 1;
      },
    },
  });
  check(
    'invalid webhook signature fails closed',
    invalid.statusCode === 401 && calls.pull === 0 && calls.recreate === 0,
    { statusCode: invalid.statusCode, reason: invalid.body?.reason, pull: calls.pull }
  );

  const valid = await handleDeployRequest({
    rawBody: deployBody,
    headers: {
      'x-cms-timestamp': String(timestamp),
      'x-cms-signature': signDeployRequest(deployBody, timestamp, secret),
    },
    deps: {
      nowSeconds: () => timestamp,
      maxSkewSeconds: 300,
      secret,
      seenReplayKeys: new Set(),
      readState: async () => ({ current: null, previous: null }),
      writeState: async () => {},
      pullImage: async () => {},
      recreateApi: async () => {},
      waitForHealth: async (expected) => ({
        ok: true,
        version: expected.gitSha,
        imageDigest: expected.digest,
      }),
      pruneImages: async () => {},
    },
  });
  check(
    'successful deploy reports gitSha and imageDigest after health',
    valid.statusCode === 200 &&
      valid.body?.gitSha === 'acceptsha' &&
      valid.body?.imageDigest === 'sha256:accept',
    valid.body
  );

  const failedHealth = await handleDeployRequest({
    rawBody: deployBody,
    headers: {
      'x-cms-timestamp': String(timestamp + 1),
      'x-cms-signature': signDeployRequest(deployBody, timestamp + 1, secret),
    },
    deps: {
      nowSeconds: () => timestamp + 1,
      maxSkewSeconds: 300,
      secret,
      seenReplayKeys: new Set(),
      readState: async () => ({
        current: { image: 'ghcr.io/k4f7/cms:old', gitSha: 'old', digest: 'sha256:old' },
        previous: null,
      }),
      writeState: async () => {},
      pullImage: async () => {},
      recreateApi: async () => {},
      waitForHealth: async () => ({ ok: false, version: 'missing', imageDigest: null }),
      pruneImages: async () => {
        calls.prune += 1;
      },
    },
  });
  check(
    'failed health check fails the deploy and does not prune',
    failedHealth.statusCode === 503 && failedHealth.body?.status === 'health_failed',
    { statusCode: failedHealth.statusCode, status: failedHealth.body?.status }
  );

  const browser = await recordBrowserNetwork();

  const payload = redactAcceptance({
    recordedAt: new Date().toISOString(),
    topology: {
      adminOrigin,
      apiOrigin,
      unapprovedOrigin,
      note: 'Local production-shaped stack uses self-signed TLS. Production must re-run on trusted certificates.',
    },
    checks,
    browser,
    disasterRecovery:
      'Same-host API process or container recreation only. Not a backup, restore, or disaster-recovery promise.',
  });

  const evidencePath = join(evidenceDir, 'evidence.json');
  writeFileSync(evidencePath, `${JSON.stringify(payload, null, 2)}\n`);
  return { evidencePath, payload };
}

async function recordBrowserNetwork() {
  const executablePath = chromePath();
  if (!existsSync(executablePath)) {
    return { skipped: 'Chrome is not available' };
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    acceptInsecureCerts: true,
    args: [
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      ...(process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
    ],
  });

  try {
    const page = await browser.newPage();
    const network = [];
    page.on('response', (res) => {
      const url = res.url();
      if (!url.startsWith(apiOrigin) && !url.startsWith(adminOrigin)) return;
      network.push({
        method: res.request().method(),
        url: originAndPath(url),
        status: res.status(),
      });
    });

    await page.goto(adminOrigin, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 60_000 });
    const email = (await page.$('input[name="email"]')) || (await page.$('input[type="email"]'));
    const password = (await page.$('input[name="password"]')) || (await page.$('input[type="password"]'));
    await email.click({ clickCount: 3 });
    await email.type(ADMIN.email);
    await password.click({ clickCount: 3 });
    await password.type(ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForNetworkIdle({ timeout: 20_000 }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.reload({ waitUntil: 'networkidle0', timeout: 30_000 }).catch(() => null);

    const apiRequests = network.filter((entry) => entry.url.startsWith(apiOrigin));
    const adminDocument = network.find((entry) => entry.url === `${adminOrigin}/`);

    return redactAcceptance({
      note: 'Self-signed TLS may skip cookie storage. Production re-run uses CMS_REQUIRE_BROWSER_SESSION=1.',
      requests: [adminDocument, ...apiRequests].filter(Boolean).slice(0, 40),
    });
  } finally {
    await browser.close();
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('record-acceptance.mjs');
if (invokedDirectly) {
  const { evidencePath, payload } = await recordAcceptance();
  const failed = payload.checks.filter((check) => !check.ok);
  console.log('wrote', evidencePath);
  console.log('checks', payload.checks.length, 'failed', failed.length);
  if (failed.length) process.exitCode = 1;
}
