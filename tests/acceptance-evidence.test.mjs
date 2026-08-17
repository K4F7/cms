/**
 * Evidence redaction seam for K4F7/cms#11.
 * Asserts committed acceptance records cannot contain secrets.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cookieFlags, redactAcceptance } from '../scripts/acceptance-evidence.mjs';

test('acceptance evidence redaction strips JWTs, cookie values, and passwords', () => {
  const redacted = redactAcceptance({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
    setCookie: ['strapi_admin_refresh=supersecret; Secure; HttpOnly'],
    password: 'ArchiveAdmin!baseline1',
    archiveReadToken: 'archive-read-contract-baseline-token',
    headers: {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ccc.ddd',
      cookie: 'strapi_admin_refresh=supersecret',
      password: 'some-other-secret',
    },
  });
  const text = JSON.stringify(redacted);

  assert.equal(text.includes('eyJ'), false);
  assert.equal(text.includes('supersecret'), false);
  assert.equal(text.includes('ArchiveAdmin!'), false);
  assert.equal(text.includes('archive-read-contract-baseline-token'), false);
  assert.equal(text.includes('some-other-secret'), false);
  assert.match(text, /\[redacted-jwt\]/);
  assert.match(text, /"password":"\[redacted\]"/);
  assert.match(text, /\[redacted-token\]/);
});

test('cookie flag capture keeps attributes and drops values', () => {
  assert.deepEqual(
    cookieFlags(['strapi_admin_refresh=secret-value; Path=/admin; Secure; HttpOnly; SameSite=None']),
    [
      {
        name: 'strapi_admin_refresh',
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/admin',
      },
    ]
  );
});
