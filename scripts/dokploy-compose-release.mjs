#!/usr/bin/env node
/**
 * Pin CMS_IMAGE_TAG (and APP_VERSION) on a Dokploy Compose service, then deploy.
 *
 * Env: DOKPLOY_URL, DOKPLOY_API_KEY, DOKPLOY_COMPOSE_ID, CMS_IMAGE_TAG|GITHUB_SHA.
 * Merges into the existing compose `env` string so DATABASE_* and peers stay.
 * Drops stale CMS_IMAGE_DIGEST so /health does not keep an old digest.
 */

import { pathToFileURL } from 'node:url';

/**
 * @param {string} envText
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
export function upsertEnvVar(envText, key, value) {
  if (!key || /[\n\r=]/.test(key)) {
    throw new Error(`invalid env key: ${JSON.stringify(key)}`);
  }
  if (value == null || /[\n\r]/.test(String(value))) {
    throw new Error(`invalid env value for ${key}`);
  }
  const raw = envText == null ? '' : String(envText);
  const lines = raw.length === 0 ? [] : raw.split(/\r?\n/);
  const prefix = `${key}=`;
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    if (next.length > 0 && next[next.length - 1] === '') {
      next[next.length - 1] = `${key}=${value}`;
      next.push('');
    } else {
      next.push(`${key}=${value}`);
    }
  }
  return next.join('\n');
}

/**
 * Remove every `key=` line from an env blob (keeps blank lines / peers).
 * @param {string} envText
 * @param {string} key
 * @returns {string}
 */
export function removeEnvVar(envText, key) {
  if (!key || /[\n\r=]/.test(key)) {
    throw new Error(`invalid env key: ${JSON.stringify(key)}`);
  }
  const raw = envText == null ? '' : String(envText);
  if (raw.length === 0) return '';
  const prefix = `${key}=`;
  const lines = raw.split(/\r?\n/).filter((line) => !line.startsWith(prefix));
  return lines.join('\n');
}

/**
 * Merge release identity into Dokploy env: pin CMS_IMAGE_TAG + APP_VERSION,
 * drop stale CMS_IMAGE_DIGEST.
 * @param {string} envText
 * @param {string} imageTag full 40-char sha
 * @returns {string}
 */
export function mergeReleaseEnv(envText, imageTag) {
  let next = upsertEnvVar(envText, 'CMS_IMAGE_TAG', imageTag);
  next = upsertEnvVar(next, 'APP_VERSION', imageTag);
  next = removeEnvVar(next, 'CMS_IMAGE_DIGEST');
  return next;
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.apiKey
 * @param {string} opts.composeId
 * @param {string} opts.imageTag
 * @param {typeof fetch} [opts.fetchImpl]
 */
export async function releaseCompose(opts) {
  const {
    baseUrl,
    apiKey,
    composeId,
    imageTag,
    fetchImpl = globalThis.fetch,
  } = opts;

  if (!baseUrl) throw new Error('DOKPLOY_URL is required');
  if (!apiKey) throw new Error('DOKPLOY_API_KEY is required');
  if (!composeId) throw new Error('DOKPLOY_COMPOSE_ID is required');
  if (!imageTag || !/^[0-9a-f]{40}$/i.test(imageTag)) {
    throw new Error('CMS_IMAGE_TAG / GITHUB_SHA must be a full 40-char git sha');
  }

  const root = String(baseUrl).replace(/\/+$/, '').replace(/\/api$/i, '');
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
  };

  async function dokploy(method, path, body) {
    const url = `${root}/api/${path}`;
    const res = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }
    if (!res.ok) {
      const detail = typeof json === 'object' ? JSON.stringify(json) : String(json);
      throw new Error(`Dokploy ${method} ${path} failed HTTP ${res.status}: ${detail}`);
    }
    return json;
  }

  const current = await dokploy('GET', `compose.one?composeId=${encodeURIComponent(composeId)}`);
  const existingEnv = current && typeof current.env === 'string' ? current.env : '';
  const mergedEnv = mergeReleaseEnv(existingEnv, imageTag);

  await dokploy('POST', 'compose.saveEnvironment', {
    composeId,
    env: mergedEnv,
  });

  await dokploy('POST', 'compose.deploy', { composeId });

  return { composeId, imageTag, env: mergedEnv };
}

export function readConfigFromEnv(env = process.env) {
  return {
    baseUrl: env.DOKPLOY_URL || '',
    apiKey: env.DOKPLOY_API_KEY || '',
    composeId: env.DOKPLOY_COMPOSE_ID || '',
    imageTag: env.CMS_IMAGE_TAG || env.GITHUB_SHA || '',
  };
}

async function main() {
  const result = await releaseCompose(readConfigFromEnv());
  console.log(
    JSON.stringify({
      ok: true,
      composeId: result.composeId,
      CMS_IMAGE_TAG: result.imageTag,
      APP_VERSION: result.imageTag,
    }),
  );
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entry && import.meta.url === entry) {
  main().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}
