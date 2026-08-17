/**
 * Start the production-shaped local stack, then run the public health and
 * Admin→API login checks. Used by `npm run test:baseline`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ADMIN, APP_VERSION, ORIGINS, root, waitForUrl } from './lib.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const stack = spawn(process.execPath, [join(root, 'scripts', 'start-baseline.mjs')], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    APP_VERSION,
  },
});

stack.stdout.pipe(process.stdout);
stack.stderr.pipe(process.stderr);

const stopping = new Promise((resolve) => stack.on('exit', resolve));

try {
  await waitForUrl(`${ORIGINS.strapi}/health`, 180_000);

  const tests = spawn(
    process.execPath,
    ['--test', '--test-timeout=180000', 'tests/health.test.mjs', 'tests/login.test.mjs', 'tests/vercel-boundary.test.mjs'],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
        CMS_API_ORIGIN: ORIGINS.api,
        CMS_ADMIN_ORIGIN: ORIGINS.admin,
        CMS_UNAPPROVED_ORIGIN: ORIGINS.unapproved,
        APP_VERSION,
        ARCHIVE_ADMIN_EMAIL: ADMIN.email,
        ARCHIVE_ADMIN_PASSWORD: ADMIN.password,
      },
    }
  );

  const status = await new Promise((resolve, reject) => {
    tests.on('exit', resolve);
    tests.on('error', reject);
  });

  if (status !== 0) {
    process.exitCode = status || 1;
  }
} finally {
  if (process.platform === 'win32' && stack.pid) {
    spawnSync('taskkill', ['/pid', String(stack.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    stack.kill('SIGTERM');
  }
  await Promise.race([stopping, new Promise((resolve) => setTimeout(resolve, 8000))]);
  if (stack.exitCode == null) stack.kill('SIGKILL');
}
