/**
 * Vercel may only build and publish the prebuilt Admin SPA.
 * Refuse database, API runtime, and media secrets so this origin cannot
 * become an accidental API host.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const present = Object.keys(process.env).filter((name) => name.startsWith('DATABASE_'));
if (present.length > 0) {
  throw new Error(
    `Vercel must not connect to the database. Unset: ${present.join(', ')}`
  );
}

if (!process.env.STRAPI_ADMIN_BACKEND_URL) {
  throw new Error('STRAPI_ADMIN_BACKEND_URL must be baked into the Admin build');
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('npx', ['strapi', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    SERVE_ADMIN_PANEL: 'false',
  },
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const adminIndex = join(root, 'dist', 'build', 'index.html');
if (!existsSync(adminIndex)) {
  throw new Error(`Admin output missing: ${adminIndex}`);
}
