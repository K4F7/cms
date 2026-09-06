import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const composePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'deploy', 'compose.yml');
const compose = readFileSync(composePath, 'utf8');

test('prod compose pins sha image, always pulls, no build', () => {
  assert.match(compose, /image:\s*ghcr\.io\/k4f7\/cms:\$\{CMS_IMAGE_TAG:\?/);
  assert.match(compose, /pull_policy:\s*always/);
  assert.doesNotMatch(compose, /^\s*build:/m);
  assert.match(compose, /container_name:\s*deploy-api-1/);
  assert.match(compose, /network_mode:\s*host/);
  assert.doesNotMatch(compose, /image:.*:latest/);
  assert.doesNotMatch(compose, /CMS_IMAGE_TAG:-[^}]*latest/);
});

test('prod compose healthcheck probes loopback /health via node', () => {
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /127\.0\.0\.1:1337\/health/);
  assert.match(compose, /["']node["']/);
  assert.match(compose, /start_period:\s*90s/);
  assert.match(compose, /interval:\s*30s/);
  assert.match(compose, /timeout:\s*5s/);
  assert.match(compose, /retries:\s*3/);
  assert.match(compose, /mem_limit:\s*1g/);
});
