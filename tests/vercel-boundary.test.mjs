import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'vercel-build.mjs');

test('Vercel Admin build refuses database connection settings', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_CLIENT: 'postgres',
      DATABASE_HOST: '127.0.0.1',
      STRAPI_ADMIN_BACKEND_URL: 'https://api.example.com',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /must not connect to the database/i);
});
