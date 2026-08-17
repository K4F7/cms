/**
 * Archive Read Contract seam for published Works (K4F7/cms#8).
 * Freezes the external representation; does not bind Koishi.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN } from '../scripts/lib.mjs';

const apiOrigin = process.env.CMS_API_ORIGIN;
const adminOrigin = process.env.CMS_ADMIN_ORIGIN;
const archiveReadToken = process.env.ARCHIVE_READ_TOKEN;

process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

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

async function createWork(session, data) {
  return raw(`${apiOrigin}/content-manager/collection-types/api::work.work`, {
    method: 'POST',
    headers: adminHeaders(session, { 'content-type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

async function publishWork(session, documentId) {
  return raw(
    `${apiOrigin}/content-manager/collection-types/api::work.work/${documentId}/actions/publish`,
    {
      method: 'POST',
      headers: adminHeaders(session, { 'content-type': 'application/json' }),
      body: '{}',
    }
  );
}

async function readPublished(archiveId) {
  return raw(`${apiOrigin}/api/archive/v1/works/${encodeURIComponent(archiveId)}`, {
    headers: {
      Authorization: `Bearer ${archiveReadToken}`,
    },
  });
}

test('published Work is readable through the Archive Read Contract seam', async (t) => {
  if (!apiOrigin || !adminOrigin || !archiveReadToken) {
    t.skip('CMS_API_ORIGIN, CMS_ADMIN_ORIGIN, and ARCHIVE_READ_TOKEN are required');
    return;
  }

  const session = await adminSession();
  const archiveId = `work-contract-${Date.now()}`;
  const title = 'Contract Published Work';
  const summary = 'Frozen published representation for Archive Read.';

  const created = await createWork(session, { title, summary, archiveId });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;
  assert.ok(documentId);
  assert.equal(created.json?.data?.archiveId, archiveId);

  const beforePublish = await readPublished(archiveId);
  assert.equal(beforePublish.status, 404);

  const published = await publishWork(session, documentId);
  assert.equal(published.status, 200, published.text);

  const detail = await readPublished(archiveId);
  assert.equal(detail.status, 200, detail.text);
  assert.deepEqual(detail.json, {
    data: {
      archiveId,
      title,
      summary,
    },
  });
});

test('draft-only Work is not exposed as a published Archive Read record', async (t) => {
  if (!apiOrigin || !adminOrigin || !archiveReadToken) {
    t.skip('CMS_API_ORIGIN, CMS_ADMIN_ORIGIN, and ARCHIVE_READ_TOKEN are required');
    return;
  }

  const session = await adminSession();
  const archiveId = `work-draft-${Date.now()}`;

  const created = await createWork(session, {
    title: 'Draft Only Work',
    summary: 'Must not appear as published.',
    archiveId,
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);

  const detail = await readPublished(archiveId);
  assert.equal(detail.status, 404);
});

test('Archive Read Contract rejects missing machine credentials', async (t) => {
  if (!apiOrigin) {
    t.skip('CMS_API_ORIGIN is required');
    return;
  }

  const res = await raw(`${apiOrigin}/api/archive/v1/works/any-id`);
  assert.ok(res.status === 401 || res.status === 403);
});

test('unpublished draft edits do not replace the published Archive Read representation', async (t) => {
  if (!apiOrigin || !adminOrigin || !archiveReadToken) {
    t.skip('CMS_API_ORIGIN, CMS_ADMIN_ORIGIN, and ARCHIVE_READ_TOKEN are required');
    return;
  }

  const session = await adminSession();
  const archiveId = `work-modified-${Date.now()}`;
  const publishedTitle = 'Published Title';
  const publishedSummary = 'Published summary';

  const created = await createWork(session, {
    title: publishedTitle,
    summary: publishedSummary,
    archiveId,
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;
  assert.ok(documentId);

  const published = await publishWork(session, documentId);
  assert.equal(published.status, 200, published.text);

  const draftEdit = await raw(
    `${apiOrigin}/content-manager/collection-types/api::work.work/${documentId}`,
    {
      method: 'PUT',
      headers: adminHeaders(session, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        title: 'Draft-only Title',
        summary: 'Draft-only summary',
        archiveId,
      }),
    }
  );
  assert.equal(draftEdit.status, 200, draftEdit.text);

  const detail = await readPublished(archiveId);
  assert.equal(detail.status, 200, detail.text);
  assert.deepEqual(detail.json, {
    data: {
      archiveId,
      title: publishedTitle,
      summary: publishedSummary,
    },
  });
});
