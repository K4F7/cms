import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { handleDeployRequest } from './contract.mjs';

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const deployDir = join(root, 'deploy');
const statePath = process.env.CMS_DEPLOY_STATE_PATH || join(deployDir, '.deploy-state.json');
const envPath = process.env.CMS_DEPLOY_ENV_PATH || join(deployDir, '.env');
const composeFile = process.env.CMS_COMPOSE_FILE || join(deployDir, 'compose.yml');
const healthUrl = process.env.CMS_HEALTH_URL || 'http://127.0.0.1:1337/health';
const listenHost = process.env.CMS_WEBHOOK_HOST || '127.0.0.1';
const listenPort = Number(process.env.CMS_WEBHOOK_PORT || 9100);
const secret = process.env.CMS_DEPLOY_WEBHOOK_SECRET || '';
const maxSkewSeconds = Number(process.env.CMS_DEPLOY_MAX_SKEW_SECONDS || 300);
const healthTimeoutMs = Number(process.env.CMS_DEPLOY_HEALTH_TIMEOUT_MS || 120_000);
const healthPollMs = Number(process.env.CMS_DEPLOY_HEALTH_POLL_MS || 2000);

const seenReplayKeys = new Set();

function readState() {
  if (!existsSync(statePath)) {
    return { current: null, previous: null };
  }
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

function writeState(next) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`);
}

function upsertEnv(updates) {
  mkdirSync(dirname(envPath), { recursive: true });
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const map = new Map();
  for (const line of existing.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    map.set(line.slice(0, idx), line.slice(idx + 1));
  }
  for (const [key, value] of Object.entries(updates)) {
    map.set(key, String(value ?? ''));
  }
  const body = [...map.entries()].map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  writeFileSync(envPath, body);
}

async function pullImage(imageRef) {
  await execFileAsync('docker', ['pull', imageRef], { cwd: deployDir });
}

async function recreateApi(imageRef) {
  const tag = imageRef.includes(':') ? imageRef.split(':').pop() : imageRef;
  await execFileAsync(
    'docker',
    ['compose', '-f', composeFile, 'up', '-d', '--no-build', '--force-recreate', 'api'],
    {
      cwd: deployDir,
      env: {
        ...process.env,
        CMS_IMAGE_TAG: tag,
      },
    }
  );
}

async function waitForHealth(expected) {
  const start = Date.now();
  while (Date.now() - start < healthTimeoutMs) {
    try {
      const res = await fetch(healthUrl);
      const body = await res.json();
      if (
        res.ok &&
        body.status === 'ok' &&
        body.version === expected.gitSha &&
        (!body.imageDigest || body.imageDigest === expected.digest)
      ) {
        return {
          ok: true,
          version: body.version,
          imageDigest: body.imageDigest || expected.digest,
        };
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, healthPollMs));
  }
  return { ok: false, version: expected.gitSha, imageDigest: expected.digest };
}

async function pruneImages(keep) {
  const { stdout } = await execFileAsync(
    'docker',
    ['images', 'ghcr.io/k4f7/cms', '--format', '{{.Repository}}:{{.Tag}} {{.ID}}'],
    { cwd: deployDir }
  );
  const keepSet = new Set([keep.current, keep.previous].filter(Boolean));
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [ref] = line.split(/\s+/);
    if (!ref || keepSet.has(ref) || ref.endsWith(':<none>')) continue;
    try {
      await execFileAsync('docker', ['rmi', ref], { cwd: deployDir });
    } catch {
      // best-effort prune
    }
  }

  try {
    await execFileAsync('docker', ['image', 'prune', '-f'], { cwd: deployDir });
  } catch {
    // best-effort
  }
}

const deps = {
  nowSeconds: () => Math.floor(Date.now() / 1000),
  maxSkewSeconds,
  secret,
  seenReplayKeys,
  readState: async () => readState(),
  writeState: async (next) => writeState(next),
  writeRuntimeEnv: async (env) => upsertEnv(env),
  pullImage,
  recreateApi,
  waitForHealth,
  pruneImages,
};

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url?.split('?')[0] !== '/deploy') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'not_found' }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  const result = await handleDeployRequest({
    rawBody,
    headers: req.headers,
    deps,
  });

  res.writeHead(result.statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(result.body));
});

server.listen(listenPort, listenHost, () => {
  console.log(`cms deploy webhook listening on http://${listenHost}:${listenPort}/deploy`);
});
