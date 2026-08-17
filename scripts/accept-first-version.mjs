/**
 * First-version production-shape acceptance runner (K4F7/cms#11).
 *
 * Starts the same split-origin baseline as `npm run test:baseline`, runs the
 * acceptance seam suite, and writes a redacted evidence summary under
 * `.tmp/acceptance/` for maintainers. Does not print or store secrets.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN,
  APP_VERSION,
  ARCHIVE_READ_TOKEN,
  ORIGINS,
  PORTS,
  root,
  waitForUrl,
} from './lib.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const IMAGE_DIGEST = process.env.CMS_IMAGE_DIGEST || 'sha256:acceptance-baseline';
const startedAt = new Date().toISOString();

const checklist = [
  {
    id: 'login-session',
    criterion: 'Login, session refresh, and expired-session feedback from Admin HTTPS origin',
    tests: ['tests/login.test.mjs'],
  },
  {
    id: 'work-authoring',
    criterion: 'Create, reopen, edit, and publish a representative Work from Admin',
    tests: ['tests/work-authoring.test.mjs'],
  },
  {
    id: 'media-workmedia',
    criterion: 'Upload image/PDF, preview, and WorkMedia Relationship association',
    tests: ['tests/media-upload.test.mjs'],
  },
  {
    id: 'upload-limits',
    criterion: 'Under-limit upload succeeds; over 50 MiB fails without a false success record',
    tests: ['tests/media-upload.test.mjs'],
  },
  {
    id: 'cors',
    criterion: 'Unapproved origin CORS fails; configured Admin origin with credentials succeeds',
    tests: ['tests/login.test.mjs'],
  },
  {
    id: 'deploy-webhook',
    criterion: 'HMAC webhook deploy reports gitSha and imageDigest; bad/expired/replay fail closed',
    tests: ['tests/deploy-webhook.test.mjs'],
  },
  {
    id: 'health-identity',
    criterion: 'Health reports deployed version (and imageDigest when configured)',
    tests: ['tests/health.test.mjs'],
  },
  {
    id: 'recreate-persistence',
    criterion: 'After API recreate, Work, Media Item, WorkMedia Relationship, and preview remain',
    tests: ['tests/media-upload.test.mjs'],
  },
  {
    id: 'health-fail-closed',
    criterion: 'Failed health check fails deploy and does not prune diagnostic images',
    tests: ['tests/deploy-webhook.test.mjs'],
  },
  {
    id: 'vercel-boundary',
    criterion: 'Vercel Admin build rejects database/runtime secrets',
    tests: ['tests/vercel-boundary.test.mjs'],
  },
  {
    id: 'archive-read',
    criterion: 'Published Work readable via Archive Read Contract; drafts stay private',
    tests: ['tests/work-contract.test.mjs'],
  },
];

const testFiles = [
  'tests/health.test.mjs',
  'tests/login.test.mjs',
  'tests/vercel-boundary.test.mjs',
  'tests/work-contract.test.mjs',
  'tests/work-authoring.test.mjs',
  'tests/media-upload.test.mjs',
  'tests/deploy-webhook.test.mjs',
];

const stack = spawn(process.execPath, [join(root, 'scripts', 'start-baseline.mjs')], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    APP_VERSION,
    CMS_IMAGE_DIGEST: IMAGE_DIGEST,
  },
});

stack.stdout.pipe(process.stdout);
stack.stderr.pipe(process.stderr);

const stopping = new Promise((resolve) => stack.on('exit', resolve));
let status = 1;

try {
  await waitForUrl(`${ORIGINS.strapi}/health`, 180_000);

  const health = await fetch(`${ORIGINS.api}/health`).then(async (res) => ({
    status: res.status,
    body: await res.json(),
  }));

  const tests = spawn(
    process.execPath,
    ['--test', '--test-concurrency=1', '--test-timeout=180000', ...testFiles],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
        CMS_API_ORIGIN: ORIGINS.api,
        CMS_ADMIN_ORIGIN: ORIGINS.admin,
        CMS_UNAPPROVED_ORIGIN: ORIGINS.unapproved,
        CMS_CONTROL_ORIGIN: `http://127.0.0.1:${PORTS.control}`,
        APP_VERSION,
        CMS_IMAGE_DIGEST: IMAGE_DIGEST,
        ARCHIVE_ADMIN_EMAIL: ADMIN.email,
        ARCHIVE_ADMIN_PASSWORD: ADMIN.password,
        ARCHIVE_READ_TOKEN,
      },
    }
  );

  status = await new Promise((resolve, reject) => {
    tests.on('exit', resolve);
    tests.on('error', reject);
  });

  const finishedAt = new Date().toISOString();
  const evidenceDir = join(root, '.tmp', 'acceptance');
  mkdirSync(evidenceDir, { recursive: true });

  const evidence = {
    ticket: 'K4F7/cms#11',
    parent: 'K4F7/cms#6',
    startedAt,
    finishedAt,
    exitStatus: status ?? 1,
    topology: {
      adminOrigin: ORIGINS.admin,
      apiOrigin: ORIGINS.api,
      unapprovedOrigin: ORIGINS.unapproved,
      controlOrigin: `http://127.0.0.1:${PORTS.control}`,
      note: 'Local production-shaped split: prebuilt Admin HTTPS + TLS proxy API. Not live Vercel/louis.',
    },
    identity: {
      appVersion: APP_VERSION,
      imageDigest: IMAGE_DIGEST,
      health,
    },
    durabilityPromise:
      'Same-host API process/container recreate keeps SQLite/Postgres records and bind-mounted media. This is not disaster recovery for VPS, disk, database, or media loss.',
    secrets: 'redacted — ARCHIVE_ADMIN_PASSWORD and ARCHIVE_READ_TOKEN are never written here',
    checklist: checklist.map((item) => ({
      ...item,
      status: status === 0 ? 'pass' : 'see-suite',
    })),
    knownLimits: [
      'Self-signed TLS in the local baseline; Chrome Secure cookie storage on trusted production certs must still be confirmed with CMS_REQUIRE_BROWSER_SESSION=1 against real origins.',
      'Local baseline uses SQLite + public/uploads (or configured media path), not 1Panel PostgreSQL.',
      'Deploy webhook assertions are contract-level (HMAC, fail-closed, health gate). Live louis pull/recreate is exercised by publish.yml against production.',
      'No backup, off-box restore, RPO, or RTO claim.',
    ],
  };

  writeFileSync(join(evidenceDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(
    join(evidenceDir, 'SUMMARY.md'),
    [
      '# First-version acceptance evidence',
      '',
      `Generated: ${finishedAt}`,
      `Suite exit: ${status === 0 ? 'pass' : `fail (${status})`}`,
      '',
      `Health: HTTP ${health.status} version=${health.body?.version} imageDigest=${health.body?.imageDigest || '(none)'}`,
      '',
      evidence.durabilityPromise,
      '',
      'Checklist:',
      ...checklist.map((item) => `- [${status === 0 ? 'x' : ' '}] ${item.id}: ${item.criterion}`),
      '',
      'Secrets are not recorded. See docs/acceptance/first-version.md.',
      '',
    ].join('\n')
  );

  console.log('acceptance evidence: %s', join(evidenceDir, 'evidence.json'));
  if (status !== 0) process.exitCode = status || 1;
} finally {
  if (process.platform === 'win32' && stack.pid) {
    spawnSync('taskkill', ['/pid', String(stack.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    stack.kill('SIGTERM');
  }
  await Promise.race([stopping, new Promise((resolve) => setTimeout(resolve, 8000))]);
  if (stack.exitCode == null) stack.kill('SIGKILL');
}
