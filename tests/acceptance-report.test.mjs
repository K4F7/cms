/**
 * Keeps the first-version acceptance report from drifting away from the
 * seam suite and durability promise (K4F7/cms#11).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { root } from '../scripts/lib.mjs';

const reportPath = join(root, 'docs', 'acceptance', 'first-version.md');
const packagePath = join(root, 'package.json');

test('acceptance report records the no-disaster-recovery promise and checklist seams', () => {
  const report = readFileSync(reportPath, 'utf8');

  assert.match(report, /same-host API process\/container recreate/i);
  assert.match(report, /does \*\*not\*\* claim recovery/i);
  assert.match(report, /tests\/login\.test\.mjs/);
  assert.match(report, /tests\/work-authoring\.test\.mjs/);
  assert.match(report, /tests\/media-upload\.test\.mjs/);
  assert.match(report, /tests\/deploy-webhook\.test\.mjs/);
  assert.match(report, /tests\/health\.test\.mjs/);
  assert.match(report, /npm run test:acceptance/);
  assert.match(report, /K4F7\/cms#11/);
  assert.match(report, /K4F7\/cms#6/);
  assert.doesNotMatch(report, /ARCHIVE_ADMIN_PASSWORD=(?!["']?<)[^\s"']+/);
  assert.doesNotMatch(report, /CMS_DEPLOY_WEBHOOK_SECRET=\S+/);
});

test('package.json exposes test:acceptance for maintainers', () => {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  assert.equal(pkg.scripts['test:acceptance'], 'node scripts/accept-first-version.mjs');
});
