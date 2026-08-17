import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { healthResponse } = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'health.cjs'));

const apiOrigin = process.env.CMS_API_ORIGIN;
const expectedVersion = process.env.APP_VERSION || 'baseline-test';

test('public health reports ok and the current application version', async (t) => {
  if (!apiOrigin) {
    t.skip('CMS_API_ORIGIN is required');
    return;
  }

  const res = await fetch(`${apiOrigin}/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.version, expectedVersion);

  const expectedDigest = process.env.CMS_IMAGE_DIGEST || process.env.IMAGE_DIGEST;
  if (expectedDigest) {
    assert.equal(body.imageDigest, expectedDigest);
  }
});

test('public health reports not_ready when the application cannot serve', async () => {
  const version = 'fixture-sha';
  const server = createServer((req, res) => {
    const result = healthResponse(false, version);
    res.writeHead(result.statusCode, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());

  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();

  assert.equal(res.status, 503);
  assert.equal(body.status, 'not_ready');
  assert.equal(body.version, version);
});
