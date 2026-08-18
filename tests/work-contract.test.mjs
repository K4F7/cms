/**
 * Archive Read Contract seam for published Works (K4F7/cms#8, #19).
 * Freezes the external representation; does not bind Koishi.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN } from '../scripts/lib.mjs';

const apiOrigin = process.env.CMS_API_ORIGIN;
const adminOrigin = process.env.CMS_ADMIN_ORIGIN;
const archiveReadToken = process.env.ARCHIVE_READ_TOKEN;

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
    headers: res.headers,
    text,
    json,
  };
}

async function rawBinary(url, init = {}) {
  const res = await fetch(url, init);
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    headers: res.headers,
    bytes,
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

async function createWork(session, data) {
  return raw(`${apiOrigin}/content-manager/collection-types/api::work.work`, {
    method: 'POST',
    headers: adminHeaders(session, { 'content-type': 'application/json' }),
    body: JSON.stringify(data),
  });
}

async function updateWork(session, documentId, data) {
  return raw(`${apiOrigin}/content-manager/collection-types/api::work.work/${documentId}`, {
    method: 'PUT',
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

async function uploadMedia(session, filename, caption = null) {
  const form = new FormData();
  form.append('files', new Blob([TINY_PNG], { type: 'image/png' }), filename);
  if (caption !== null) {
    form.append('fileInfo', JSON.stringify({ caption, name: filename }));
  }
  const uploaded = await raw(`${apiOrigin}/upload`, {
    method: 'POST',
    headers: adminHeaders(session),
    body: form,
  });
  assert.ok(uploaded.status === 200 || uploaded.status === 201, uploaded.text);
  const file = uploadedFile(uploaded.json);
  assert.ok(file?.id, uploaded.text);
  return file;
}

function mediaIdOf(file) {
  return file.documentId || String(file.id);
}

async function readPublished(archiveId) {
  return raw(`${apiOrigin}/api/archive/v1/works/${encodeURIComponent(archiveId)}`, {
    headers: {
      Authorization: `Bearer ${archiveReadToken}`,
    },
  });
}

async function searchWorks(params = {}, token = archiveReadToken) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const suffix = search.toString() ? `?${search}` : '';
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return raw(`${apiOrigin}/api/archive/v1/works${suffix}`, { headers });
}

async function downloadMedia(mediaId, token = archiveReadToken) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return rawBinary(`${apiOrigin}/api/archive/v1/media/${encodeURIComponent(mediaId)}`, { headers });
}

function requireOrigins(t) {
  if (!apiOrigin || !adminOrigin || !archiveReadToken) {
    t.skip('CMS_API_ORIGIN, CMS_ADMIN_ORIGIN, and ARCHIVE_READ_TOKEN are required');
    return false;
  }
  return true;
}

test('published Work is readable through the Archive Read Contract seam', async (t) => {
  if (!requireOrigins(t)) return;

  const session = await adminSession();
  const stamp = Date.now();
  const archiveId = `work-contract-${stamp}`;
  const title = 'Contract Published Work';
  const summary = 'Frozen published representation for Archive Read.';
  const author = `Contract Author ${stamp}`;
  const filename = `contract-${stamp}.png`;

  const created = await createWork(session, { title, summary, author, archiveId });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;
  assert.ok(documentId);
  assert.equal(created.json?.data?.archiveId, archiveId);
  assert.equal(created.json?.data?.author, author);

  const file = await uploadMedia(session, filename, 'Contract caption');
  const linked = await updateWork(session, documentId, { mediaItems: [file.id] });
  assert.equal(linked.status, 200, linked.text);

  const beforePublish = await readPublished(archiveId);
  assert.equal(beforePublish.status, 404);

  const published = await publishWork(session, documentId);
  assert.equal(published.status, 200, published.text);

  const detail = await readPublished(archiveId);
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.json?.data?.archiveId, archiveId);
  assert.equal(detail.json?.data?.title, title);
  assert.equal(detail.json?.data?.summary, summary);
  assert.equal(detail.json?.data?.author, author);
  assert.equal(detail.json?.data?.media?.length, 1);
  const publishedMedia = detail.json.data.media[0];
  assert.equal(publishedMedia.mediaId, mediaIdOf(file));
  assert.equal(publishedMedia.filename, filename);
  assert.equal(publishedMedia.mediaType, 'image/png');
  assert.equal(typeof publishedMedia.size, 'number');
  assert.ok(publishedMedia.size > 0);
  assert.equal(publishedMedia.caption, 'Contract caption');
});

test('draft-only Work is not exposed as a published Archive Read record', async (t) => {
  if (!requireOrigins(t)) return;

  const session = await adminSession();
  const archiveId = `work-draft-${Date.now()}`;

  const created = await createWork(session, {
    title: 'Draft Only Work',
    summary: 'Must not appear as published.',
    author: 'Draft Author',
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

  const detail = await raw(`${apiOrigin}/api/archive/v1/works/any-id`);
  assert.ok(detail.status === 401 || detail.status === 403);

  const search = await searchWorks({}, null);
  assert.ok(search.status === 401 || search.status === 403);

  const media = await downloadMedia('any-media', null);
  assert.ok(media.status === 401 || media.status === 403);
});

test('unpublished draft edits do not replace the published Archive Read representation', async (t) => {
  if (!requireOrigins(t)) return;

  const session = await adminSession();
  const stamp = Date.now();
  const archiveId = `work-modified-${stamp}`;
  const publishedTitle = 'Published Title';
  const publishedSummary = 'Published summary';
  const publishedAuthor = `Published Author ${stamp}`;
  const filename = `published-${stamp}.png`;

  const created = await createWork(session, {
    title: publishedTitle,
    summary: publishedSummary,
    author: publishedAuthor,
    archiveId,
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;
  assert.ok(documentId);

  const file = await uploadMedia(session, filename, 'Published caption');
  const linked = await updateWork(session, documentId, { mediaItems: [file.id] });
  assert.equal(linked.status, 200, linked.text);

  const published = await publishWork(session, documentId);
  assert.equal(published.status, 200, published.text);

  const draftEdit = await updateWork(session, documentId, {
    title: 'Draft-only Title',
    summary: 'Draft-only summary',
    author: 'Draft-only Author',
    archiveId,
  });
  assert.equal(draftEdit.status, 200, draftEdit.text);

  const detail = await readPublished(archiveId);
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.json?.data?.archiveId, archiveId);
  assert.equal(detail.json?.data?.title, publishedTitle);
  assert.equal(detail.json?.data?.summary, publishedSummary);
  assert.equal(detail.json?.data?.author, publishedAuthor);
  assert.equal(detail.json?.data?.media?.length, 1);
  assert.equal(detail.json.data.media[0].mediaId, mediaIdOf(file));
  assert.equal(detail.json.data.media[0].filename, filename);
  assert.equal(detail.json.data.media[0].caption, 'Published caption');
});

test('search returns exact total for hits and empty results', async (t) => {
  if (!requireOrigins(t)) return;

  const session = await adminSession();
  const stamp = Date.now();
  const token = `search-token-${stamp}`;
  const authorAda = `Ada ${stamp}`;
  const authorBob = `Bob ${stamp}`;

  async function publishReadable(fields, filename) {
    const created = await createWork(session, fields);
    assert.ok(created.status === 200 || created.status === 201, created.text);
    const documentId = created.json?.data?.documentId;
    const file = await uploadMedia(session, filename);
    const linked = await updateWork(session, documentId, { mediaItems: [file.id] });
    assert.equal(linked.status, 200, linked.text);
    const published = await publishWork(session, documentId);
    assert.equal(published.status, 200, published.text);
    return created.json?.data?.archiveId;
  }

  const firstId = await publishReadable(
    {
      title: `Alpha ${token}`,
      summary: 'Red fox summary',
      author: authorAda,
      archiveId: `search-a-${stamp}`,
    },
    `search-a-${stamp}.png`
  );
  const secondId = await publishReadable(
    {
      title: 'Beta other title',
      summary: `Blue ${token} summary`,
      author: authorAda,
      archiveId: `search-b-${stamp}`,
    },
    `search-b-${stamp}.png`
  );
  await publishReadable(
    {
      title: 'Gamma unrelated',
      summary: 'No token here',
      author: authorBob,
      archiveId: `search-c-${stamp}`,
    },
    `search-c-${stamp}.png`
  );

  const emptyPublished = await createWork(session, {
    title: `Empty ${token}`,
    summary: `Empty ${token} summary`,
    author: authorAda,
    archiveId: `search-empty-${stamp}`,
  });
  assert.ok(emptyPublished.status === 200 || emptyPublished.status === 201, emptyPublished.text);
  const emptyPublish = await publishWork(session, emptyPublished.json?.data?.documentId);
  assert.equal(emptyPublish.status, 200, emptyPublish.text);

  const draftOnly = await createWork(session, {
    title: `Draft ${token}`,
    summary: `Draft ${token} summary`,
    author: authorAda,
    archiveId: `search-draft-${stamp}`,
  });
  assert.ok(draftOnly.status === 200 || draftOnly.status === 201, draftOnly.text);

  const hits = await searchWorks({ query: token });
  assert.equal(hits.status, 200, hits.text);
  assert.equal(hits.json?.total, 2);
  assert.equal(hits.json?.data?.length, 2);
  const hitIds = hits.json.data.map((item) => item.archiveId).sort();
  assert.deepEqual(hitIds, [firstId, secondId].sort());
  for (const item of hits.json.data) {
    assert.deepEqual(Object.keys(item).sort(), ['archiveId', 'author', 'summary', 'title']);
  }

  const byAuthor = await searchWorks({ author: authorAda });
  assert.equal(byAuthor.status, 200, byAuthor.text);
  assert.equal(byAuthor.json?.total, 2);
  assert.deepEqual(
    byAuthor.json.data.map((item) => item.archiveId).sort(),
    [firstId, secondId].sort()
  );

  const combined = await searchWorks({ query: 'blue', author: authorAda });
  assert.equal(combined.status, 200, combined.text);
  assert.equal(combined.json?.total, 1);
  assert.equal(combined.json?.data?.[0]?.archiveId, secondId);
  assert.equal(combined.json?.data?.[0]?.author, authorAda);

  const caseInsensitive = await searchWorks({ query: token.toUpperCase() });
  assert.equal(caseInsensitive.status, 200, caseInsensitive.text);
  assert.equal(caseInsensitive.json?.total, 2);

  const empty = await searchWorks({ query: `no-such-${stamp}-zzzz` });
  assert.equal(empty.status, 200, empty.text);
  assert.deepEqual(empty.json, { data: [], total: 0 });
});

test('published media list keeps field order and caption', async (t) => {
  if (!requireOrigins(t)) return;

  const session = await adminSession();
  const stamp = Date.now();
  const archiveId = `work-order-${stamp}`;
  const created = await createWork(session, {
    title: 'Ordered Media Work',
    summary: 'List order follows mediaItems',
    author: `Order Author ${stamp}`,
    archiveId,
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;

  const first = await uploadMedia(session, `order-first-${stamp}.png`, 'First caption');
  const second = await uploadMedia(session, `order-second-${stamp}.png`, 'Second caption');
  const linked = await updateWork(session, documentId, { mediaItems: [second.id, first.id] });
  assert.equal(linked.status, 200, linked.text);
  const published = await publishWork(session, documentId);
  assert.equal(published.status, 200, published.text);

  const detail = await readPublished(archiveId);
  assert.equal(detail.status, 200, detail.text);
  assert.deepEqual(
    detail.json?.data?.media?.map((item) => ({
      mediaId: item.mediaId,
      filename: item.filename,
      caption: item.caption,
    })),
    [
      { mediaId: mediaIdOf(second), filename: `order-second-${stamp}.png`, caption: 'Second caption' },
      { mediaId: mediaIdOf(first), filename: `order-first-${stamp}.png`, caption: 'First caption' },
    ]
  );
});

test('draft-added media does not appear on the published Archive Read list', async (t) => {
  if (!requireOrigins(t)) return;

  const session = await adminSession();
  const stamp = Date.now();
  const archiveId = `work-draft-media-${stamp}`;
  const created = await createWork(session, {
    title: 'Published Media Work',
    summary: 'Draft media must stay hidden',
    author: `Draft Media Author ${stamp}`,
    archiveId,
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;

  const publishedFile = await uploadMedia(session, `published-media-${stamp}.png`, 'Published media');
  const linked = await updateWork(session, documentId, { mediaItems: [publishedFile.id] });
  assert.equal(linked.status, 200, linked.text);
  const published = await publishWork(session, documentId);
  assert.equal(published.status, 200, published.text);

  const draftFile = await uploadMedia(session, `draft-media-${stamp}.png`, 'Draft media');
  const draftEdit = await updateWork(session, documentId, {
    mediaItems: [publishedFile.id, draftFile.id],
  });
  assert.equal(draftEdit.status, 200, draftEdit.text);

  const detail = await readPublished(archiveId);
  assert.equal(detail.status, 200, detail.text);
  assert.deepEqual(
    detail.json?.data?.media?.map((item) => item.mediaId),
    [mediaIdOf(publishedFile)]
  );
  assert.equal(
    detail.json?.data?.media?.some((item) => item.mediaId === mediaIdOf(draftFile)),
    false
  );

  const hidden = await downloadMedia(mediaIdOf(draftFile));
  assert.equal(hidden.status, 404);
});

test('published Work with an empty media list is not readable', async (t) => {
  if (!requireOrigins(t)) return;

  const session = await adminSession();
  const stamp = Date.now();
  const archiveId = `work-empty-${stamp}`;
  const title = `Empty List ${stamp}`;
  const created = await createWork(session, {
    title,
    summary: 'Published but empty media list',
    author: `Empty Author ${stamp}`,
    archiveId,
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const published = await publishWork(session, created.json?.data?.documentId);
  assert.equal(published.status, 200, published.text);

  const detail = await readPublished(archiveId);
  assert.equal(detail.status, 404);

  const search = await searchWorks({ query: title });
  assert.equal(search.status, 200, search.text);
  assert.equal(search.json?.total, 0);
  assert.equal(
    (search.json?.data || []).some((item) => item.archiveId === archiveId),
    false
  );
});

test('protected media download enforces auth and published membership', async (t) => {
  if (!requireOrigins(t)) return;

  const session = await adminSession();
  const stamp = Date.now();
  const archiveId = `work-download-${stamp}`;
  const filename = `download-${stamp}.png`;
  const created = await createWork(session, {
    title: 'Downloadable Work',
    summary: 'Has published media',
    author: `Download Author ${stamp}`,
    archiveId,
  });
  assert.ok(created.status === 200 || created.status === 201, created.text);
  const documentId = created.json?.data?.documentId;

  const file = await uploadMedia(session, filename, null);
  const orphan = await uploadMedia(session, `orphan-${stamp}.png`, null);
  const linked = await updateWork(session, documentId, { mediaItems: [file.id] });
  assert.equal(linked.status, 200, linked.text);

  const beforePublish = await downloadMedia(mediaIdOf(file));
  assert.equal(beforePublish.status, 404);

  const published = await publishWork(session, documentId);
  assert.equal(published.status, 200, published.text);

  const downloaded = await downloadMedia(mediaIdOf(file));
  assert.equal(downloaded.status, 200);
  assert.match(String(downloaded.headers.get('content-type') || ''), /image\/png/i);
  const disposition = String(downloaded.headers.get('content-disposition') || '');
  assert.match(disposition, new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(downloaded.bytes.length > 0);
  assert.deepEqual(downloaded.bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  const missing = await downloadMedia(mediaIdOf(orphan));
  assert.equal(missing.status, 404);

  const unknown = await downloadMedia(`missing-media-${stamp}`);
  assert.equal(unknown.status, 404);
});

test('wrong Archive Read credentials fail closed across the seam', async (t) => {
  if (!apiOrigin) {
    t.skip('CMS_API_ORIGIN is required');
    return;
  }

  const headers = { Authorization: 'Bearer not-the-archive-read-token' };
  const search = await raw(`${apiOrigin}/api/archive/v1/works`, { headers });
  assert.ok(search.status === 401 || search.status === 403);

  const detail = await raw(`${apiOrigin}/api/archive/v1/works/any-id`, { headers });
  assert.ok(detail.status === 401 || detail.status === 403);

  const media = await raw(`${apiOrigin}/api/archive/v1/media/any-id`, { headers });
  assert.ok(media.status === 401 || media.status === 403);
});
