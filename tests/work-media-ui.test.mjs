import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  WORK_MEDIA_LIMIT_BYTES,
  reorderItems,
  validateWorkMediaFiles,
} from '../src/work-media-ui.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(join(root, 'src/admin/app.tsx'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function file(name, type, size) {
  return { name, type, size };
}

test('Work media accepts images and PDFs up to the 50 MiB product limit', () => {
  const image = file('image.png', 'image/png', 128);
  const pdf = file('paper.pdf', 'application/pdf', WORK_MEDIA_LIMIT_BYTES);
  const executable = file('program.exe', 'application/octet-stream', 128);
  const tooLarge = file('large.pdf', 'application/pdf', WORK_MEDIA_LIMIT_BYTES + 1);

  const result = validateWorkMediaFiles([image, pdf, executable, tooLarge]);
  assert.deepEqual(result.accepted, [image, pdf]);
  assert.deepEqual(result.rejected.map(({ file: rejected, reason }) => [rejected.name, reason]), [
    ['program.exe', 'type'],
    ['large.pdf', 'size'],
  ]);
});

test('Work media reorder is stable and ignores invalid moves', () => {
  assert.deepEqual(reorderItems(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(reorderItems(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(reorderItems(['a', 'b', 'c'], -1, 0), ['a', 'b', 'c']);
});

test('only the Work mediaItems field replaces the native Strapi media input', () => {
  assert.match(appSource, /props\.name === 'mediaItems'/);
  assert.match(appSource, /NativeMediaInput/);
  assert.match(appSource, /WorkMediaInput/);
  assert.equal(packageJson.dependencies['@strapi/upload'], '5.52.0');
});
