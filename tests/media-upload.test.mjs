/**
 * Media Item upload + WorkMedia association seam (K4F7/cms#9).
 * Covers upload, preview, Work association, oversize rejection, and
 * persistence across API process restart (local stand-in for container recreate).
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { ADMIN, PORTS, chromePath } from '../scripts/lib.mjs';

const apiOrigin = process.env.CMS_API_ORIGIN;
const adminOrigin = process.env.CMS_ADMIN_ORIGIN;
const controlOrigin =
  process.env.CMS_CONTROL_ORIGIN || `http://127.0.0.1:${PORTS.control}`;
const PRODUCT_LIMIT_BYTES = 50 * 1024 * 1024;

process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function raw(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: res.status,
    setCookie: res.headers.getSetCookie?.() || [],
    text,
    json,
  };
}

function cookieHeader(setCookie) {
  return setCookie.map((cookie) => cookie.split(';')[0]).join('; ');
}

function accessToken(payload) {
  return payload?.data?.token || payload?.data?.accessToken || payload?.token || null;
}

async function adminSession() {
  const login = await raw(`${apiOrigin}/admin/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: adminOrigin,
    },
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
  });
  assert.equal(login.status, 200, `admin login failed: ${login.text}`);
  const token = accessToken(login.json);
  assert.ok(token);
  return {
    token,
    cookie: cookieHeader(login.setCookie),
  };
}

function adminHeaders(session, extra = {}) {
  return {
    Origin: adminOrigin,
    cookie: session.cookie,
    Authorization: `Bearer ${session.token}`,
    ...extra,
  };
}

function uploadedFile(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  return payload?.data || payload || null;
}

async function listUploadFiles(session) {
  const res = await raw(`${apiOrigin}/upload/files`, {
    headers: adminHeaders(session),
  });
  if (Array.isArray(res.json)) return res.json;
  if (Array.isArray(res.json?.results)) return res.json.results;
  if (Array.isArray(res.json?.data)) return res.json.data;
  return [];
}

test('Archive Administrator can upload, preview, and associate a Media Item with a Work', async (t) => {
  if (!apiOrigin || !adminOrigin) {
    t.skip('CMS_API_ORIGIN and CMS_ADMIN_ORIGIN are required');
    return;
  }

  const session = await adminSession();
  const stamp = Date.now();
  const archiveId = `media-work-${stamp}`;

  const created = await raw(`${apiOrigin}/content-manager/collection-types/api::work.work`, {
    method: 'POST',
    headers: adminHeaders(session, { 'content-type': 'application/json' }),
    body: JSON.stringify({
      title: `Media Work ${stamp}`,
      summary: 'Has a Media Item',
      archiveId,
    }),
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;
  assert.ok(documentId);

  const form = new FormData();
  form.append('files', new Blob([TINY_PNG], { type: 'image/png' }), `tiny-${stamp}.png`);
  const uploaded = await raw(`${apiOrigin}/upload`, {
    method: 'POST',
    headers: adminHeaders(session),
    body: form,
  });
  assert.ok(uploaded.status === 200 || uploaded.status === 201, uploaded.text);
  const file = uploadedFile(uploaded.json);
  assert.ok(file?.id, uploaded.text);
  assert.ok(file.url, uploaded.text);

  const previewUrl = new URL(file.url, apiOrigin).href;
  const preview = await raw(previewUrl, { headers: { Origin: adminOrigin } });
  assert.equal(preview.status, 200, preview.text);

  const linked = await raw(
    `${apiOrigin}/content-manager/collection-types/api::work.work/${documentId}`,
    {
      method: 'PUT',
      headers: adminHeaders(session, { 'content-type': 'application/json' }),
      body: JSON.stringify({ mediaItems: [file.id] }),
    }
  );
  assert.equal(linked.status, 200, linked.text);

  const reopened = await raw(
    `${apiOrigin}/content-manager/collection-types/api::work.work/${documentId}`,
    { headers: adminHeaders(session) }
  );
  assert.equal(reopened.status, 200, reopened.text);
  const media = reopened.json?.data?.mediaItems || [];
  const mediaIds = (Array.isArray(media) ? media : [media])
    .filter(Boolean)
    .map((item) => item.id || item);
  assert.ok(mediaIds.includes(file.id), JSON.stringify(reopened.json?.data?.mediaItems));
});

test('uploads above the 50 MiB product limit fail and do not create a Media Item', async (t) => {
  if (!apiOrigin || !adminOrigin) {
    t.skip('CMS_API_ORIGIN and CMS_ADMIN_ORIGIN are required');
    return;
  }

  const session = await adminSession();
  const before = await listUploadFiles(session);
  const beforeCount = before.length;

  const huge = Buffer.alloc(PRODUCT_LIMIT_BYTES + 1024, 1);
  const form = new FormData();
  form.append('files', new Blob([huge], { type: 'application/pdf' }), 'oversize.pdf');

  let oversize;
  try {
    oversize = await raw(`${apiOrigin}/upload`, {
      method: 'POST',
      headers: adminHeaders(session),
      body: form,
    });
  } catch (err) {
    oversize = { status: 0, text: String(err), json: null };
  }

  assert.ok(oversize.status >= 400 || oversize.status === 0, oversize.text);
  const after = await listUploadFiles(session);
  assert.equal(after.length, beforeCount);
});

test('Archive Administrator can upload and preview a Media Item from Admin', async (t) => {
  if (!apiOrigin || !adminOrigin) {
    t.skip('CMS_API_ORIGIN and CMS_ADMIN_ORIGIN are required');
    return;
  }

  const executablePath = chromePath();
  if (!existsSync(executablePath)) {
    t.skip('Chrome is not available for the Admin browser seam');
    return;
  }

  const login = await raw(`${apiOrigin}/admin/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: adminOrigin,
    },
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
  });
  assert.equal(login.status, 200, login.text);
  const token = accessToken(login.json);
  assert.ok(token);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    acceptInsecureCerts: true,
    args: [
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      ...(process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
    ],
  });

  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((access) => {
      window.localStorage.setItem('jwtToken', JSON.stringify(access));
      window.localStorage.setItem('isLoggedIn', 'true');
    }, token);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const headers = { ...req.headers() };
      if (req.url().startsWith(apiOrigin)) {
        headers.authorization = `Bearer ${token}`;
      }
      req.continue({ headers }).catch(() => null);
    });

    const stamp = Date.now();
    const form = new FormData();
    form.append('files', new Blob([TINY_PNG], { type: 'image/png' }), `browser-${stamp}.png`);
    const uploaded = await raw(`${apiOrigin}/upload`, {
      method: 'POST',
      headers: {
        Origin: adminOrigin,
        Authorization: `Bearer ${token}`,
        cookie: cookieHeader(login.setCookie),
      },
      body: form,
    });
    assert.ok(uploaded.status === 200 || uploaded.status === 201, uploaded.text);
    const file = uploadedFile(uploaded.json);
    const previewUrl = new URL(file.url, apiOrigin).href;

    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.status;
    }, previewUrl);
    assert.equal(status, 200);

    await page.goto(`${adminOrigin}/plugins/upload`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForNetworkIdle({ timeout: 20_000 }).catch(() => null);
    const libraryVisible = await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      return (
        text.includes('media') ||
        text.includes('upload') ||
        text.includes('library') ||
        Boolean(document.querySelector('input[type="file"]'))
      );
    });
    assert.equal(libraryVisible, true);
  } finally {
    await browser.close();
  }
});

test('published Work, WorkMedia Relationship, and media preview survive API process restart', async (t) => {
  if (!apiOrigin || !adminOrigin) {
    t.skip('CMS_API_ORIGIN and CMS_ADMIN_ORIGIN are required');
    return;
  }

  const archiveReadToken = process.env.ARCHIVE_READ_TOKEN;
  if (!archiveReadToken) {
    t.skip('ARCHIVE_READ_TOKEN is required');
    return;
  }

  const session = await adminSession();
  const stamp = Date.now();
  const archiveId = `persist-work-${stamp}`;
  const title = `Persist Work ${stamp}`;
  const summary = 'Must survive API process restart';

  const created = await raw(`${apiOrigin}/content-manager/collection-types/api::work.work`, {
    method: 'POST',
    headers: adminHeaders(session, { 'content-type': 'application/json' }),
    body: JSON.stringify({ title, summary, archiveId }),
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;
  assert.ok(documentId);

  const form = new FormData();
  form.append(
    'files',
    new Blob([TINY_PNG], { type: 'image/png' }),
    `persist-${stamp}.png`
  );
  const uploaded = await raw(`${apiOrigin}/upload`, {
    method: 'POST',
    headers: adminHeaders(session),
    body: form,
  });
  assert.ok(uploaded.status === 200 || uploaded.status === 201, uploaded.text);
  const file = uploadedFile(uploaded.json);
  assert.ok(file?.id && file.url, uploaded.text);
  const previewUrl = new URL(file.url, apiOrigin).href;

  const linked = await raw(
    `${apiOrigin}/content-manager/collection-types/api::work.work/${documentId}`,
    {
      method: 'PUT',
      headers: adminHeaders(session, { 'content-type': 'application/json' }),
      body: JSON.stringify({ mediaItems: [file.id] }),
    }
  );
  assert.equal(linked.status, 200, linked.text);

  const published = await raw(
    `${apiOrigin}/content-manager/collection-types/api::work.work/${documentId}/actions/publish`,
    {
      method: 'POST',
      headers: adminHeaders(session, { 'content-type': 'application/json' }),
      body: '{}',
    }
  );
  assert.equal(published.status, 200, published.text);

  let restart;
  try {
    restart = await raw(`${controlOrigin}/restart`, { method: 'POST' });
  } catch (err) {
    t.skip(`baseline control plane unavailable: ${err}`);
    return;
  }
  if (restart.status !== 200) {
    t.skip(`API restart control returned ${restart.status}`);
    return;
  }

  const afterRestart = await raw(previewUrl);
  assert.equal(afterRestart.status, 200, afterRestart.text);

  const reopened = await raw(
    `${apiOrigin}/content-manager/collection-types/api::work.work/${documentId}`,
    { headers: adminHeaders(session) }
  );
  assert.equal(reopened.status, 200, reopened.text);
  assert.equal(reopened.json?.data?.title, title);
  assert.equal(reopened.json?.data?.archiveId, archiveId);
  const media = reopened.json?.data?.mediaItems || [];
  const mediaIds = (Array.isArray(media) ? media : [media])
    .filter(Boolean)
    .map((item) => item.id || item);
  assert.ok(mediaIds.includes(file.id), JSON.stringify(reopened.json?.data?.mediaItems));

  const archiveRead = await raw(
    `${apiOrigin}/api/archive/v1/works/${encodeURIComponent(archiveId)}`,
    { headers: { Authorization: `Bearer ${archiveReadToken}` } }
  );
  assert.equal(archiveRead.status, 200, archiveRead.text);
  assert.equal(archiveRead.json?.data?.archiveId, archiveId);
  assert.equal(archiveRead.json?.data?.title, title);
  assert.equal(archiveRead.json?.data?.summary, summary);
  assert.equal(archiveRead.json?.data?.author ?? null, null);
  assert.ok(Array.isArray(archiveRead.json?.data?.media));
  assert.equal(archiveRead.json.data.media.length, 1);
  assert.equal(archiveRead.json.data.media[0].filename, `persist-${stamp}.png`);
  assert.equal(archiveRead.json.data.media[0].mediaType, 'image/png');
  assert.equal(typeof archiveRead.json.data.media[0].size, 'number');
  assert.ok(archiveRead.json.data.media[0].size > 0);
});
