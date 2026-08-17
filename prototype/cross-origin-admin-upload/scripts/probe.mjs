/**
 * Network evidence for K4F7/cms#5. Talks to the running prototype.
 * Not a unit-test suite — a recorded verification pass.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN,
  ORIGINS,
  PORTS,
  PRODUCT_LIMIT_BYTES,
  evidenceDir,
} from './lib.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log('      ', typeof detail === 'string' ? detail : JSON.stringify(detail));
}

async function raw(url, init = {}) {
  const res = await fetch(url, init);
  const headers = {};
  for (const [k, v] of res.headers.entries()) headers[k.toLowerCase()] = v;
  const setCookie = res.headers.getSetCookie?.() || [];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers, setCookie, text, json };
}

function cookieHeader(setCookie) {
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

function accessToken(payload) {
  return payload?.data?.token || payload?.data?.accessToken || payload?.token || null;
}

function authHeaders(cookie, token, extra = {}) {
  return {
    Origin: ORIGINS.admin,
    cookie,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function corsPreflight(origin) {
  return raw(`${ORIGINS.api}/admin/init`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
}

const approvedPreflight = await corsPreflight(ORIGINS.admin);
record(
  'CORS allows configured Admin origin with credentials',
  approvedPreflight.headers['access-control-allow-origin'] === ORIGINS.admin &&
    String(approvedPreflight.headers['access-control-allow-credentials']) === 'true',
  {
    status: approvedPreflight.status,
    acao: approvedPreflight.headers['access-control-allow-origin'] || null,
    acac: approvedPreflight.headers['access-control-allow-credentials'] || null,
  }
);

const rejectedPreflight = await corsPreflight(ORIGINS.unapproved);
record(
  'CORS rejects unapproved origin',
  rejectedPreflight.headers['access-control-allow-origin'] !== ORIGINS.unapproved &&
    !rejectedPreflight.headers['access-control-allow-origin'],
  {
    status: rejectedPreflight.status,
    acao: rejectedPreflight.headers['access-control-allow-origin'] || null,
  }
);

const badLogin = await raw(`${ORIGINS.api}/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Origin: ORIGINS.admin },
  body: JSON.stringify({ email: ADMIN.email, password: 'wrong-password' }),
});
record(
  'invalid login has clear failure and sets no session cookie',
  badLogin.status >= 400 && badLogin.setCookie.every((c) => !/jwtToken|strapi/i.test(c)),
  { status: badLogin.status, body: badLogin.json || badLogin.text, setCookie: badLogin.setCookie }
);

const login = await raw(`${ORIGINS.api}/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Origin: ORIGINS.admin },
  body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
});
const cookies = login.setCookie;
const cookieAttrs = cookies.join(' | ');
record(
  'login from Admin origin sets Secure HttpOnly SameSite=None cookies',
  login.status === 200 &&
    /samesite=none/i.test(cookieAttrs) &&
    /secure/i.test(cookieAttrs) &&
    /httponly/i.test(cookieAttrs),
  { status: login.status, setCookie: cookies, acao: login.headers['access-control-allow-origin'] || null }
);

const cookie = cookieHeader(cookies);
let token = accessToken(login.json);
record('login body includes a short-lived access token', Boolean(token), {
  hasToken: Boolean(token),
  keys: login.json ? Object.keys(login.json.data || login.json) : [],
});

const me = await raw(`${ORIGINS.api}/admin/users/me`, {
  headers: authHeaders(cookie, token),
});
record('authenticated session reaches /admin/users/me', me.status === 200, {
  status: me.status,
  email: me.json?.data?.email || me.json?.email || null,
});

const refresh = await raw(`${ORIGINS.api}/admin/access-token`, {
  method: 'POST',
  headers: authHeaders(cookie, token, { 'content-type': 'application/json' }),
  body: '{}',
});
const refreshedToken = accessToken(refresh.json);
if (refreshedToken) token = refreshedToken;
record(
  'session refresh issues a new access token from the refresh cookie',
  (refresh.status === 200 || refresh.status === 201) && Boolean(refreshedToken),
  { status: refresh.status, setCookie: refresh.setCookie, hasToken: Boolean(refreshedToken) }
);

const deadSession = await raw(`${ORIGINS.api}/admin/users/me`, {
  headers: { Origin: ORIGINS.admin, cookie: 'jwtToken=dead.token.value' },
});
record(
  'invalid session has explicit unauthenticated feedback',
  deadSession.status === 401 || deadSession.status === 403,
  { status: deadSession.status, body: deadSession.json || deadSession.text }
);

const created = await raw(`${ORIGINS.api}/content-manager/collection-types/api::work.work`, {
  method: 'POST',
  headers: authHeaders(cookie, token, { 'content-type': 'application/json' }),
  body: JSON.stringify({ title: 'Prototype Work', body: 'draft body' }),
});
const workId = created.json?.data?.documentId || created.json?.data?.id || created.json?.id;
record('create Work draft', created.status === 200 || created.status === 201, {
  status: created.status,
  id: workId,
  body: created.json || created.text,
});

const updated = await raw(
  `${ORIGINS.api}/content-manager/collection-types/api::work.work/${workId}`,
  {
    method: 'PUT',
    headers: authHeaders(cookie, token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ title: 'Prototype Work edited', body: 'edited body' }),
  }
);
record('edit Work', updated.status === 200, {
  status: updated.status,
  title: updated.json?.data?.title || updated.json?.title || null,
});

const published = await raw(
  `${ORIGINS.api}/content-manager/collection-types/api::work.work/${workId}/actions/publish`,
  {
    method: 'POST',
    headers: authHeaders(cookie, token, { 'content-type': 'application/json' }),
    body: '{}',
  }
);
record('publish Work', published.status === 200, {
  status: published.status,
  publishedAt: published.json?.data?.publishedAt || published.json?.publishedAt || null,
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const form = new FormData();
form.append('files', new Blob([png], { type: 'image/png' }), 'tiny.png');
const uploaded = await raw(`${ORIGINS.api}/upload`, {
  method: 'POST',
  headers: authHeaders(cookie, token),
  body: form,
});
const file = uploaded.json?.[0] || uploaded.json?.data?.[0];
const fileUrl = file?.url ? new URL(file.url, ORIGINS.api).href : null;
record('upload image under 50 MiB', uploaded.status === 200 || uploaded.status === 201, {
  status: uploaded.status,
  url: fileUrl,
  id: file?.id || null,
});

let previewStatus = null;
if (fileUrl) {
  const preview = await raw(fileUrl, { headers: { Origin: ORIGINS.admin } });
  previewStatus = preview.status;
}
record('preview uploaded Media Item', previewStatus === 200, { status: previewStatus, url: fileUrl });

if (workId && file?.id) {
  const linked = await raw(
    `${ORIGINS.api}/content-manager/collection-types/api::work.work/${workId}`,
    {
      method: 'PUT',
      headers: authHeaders(cookie, token, { 'content-type': 'application/json' }),
      body: JSON.stringify({ mediaItems: [file.id] }),
    }
  );
  record('associate Media Item with Work', linked.status === 200, {
    status: linked.status,
    media: linked.json?.data?.mediaItems || linked.json?.mediaItems || null,
  });
} else {
  record('associate Media Item with Work', false, 'missing work or file id');
}

const beforeOversize = await raw(`${ORIGINS.api}/upload/files`, {
  headers: authHeaders(cookie, token),
});
const beforeCount = Array.isArray(beforeOversize.json)
  ? beforeOversize.json.length
  : beforeOversize.json?.results?.length ?? null;

const huge = Buffer.alloc(PRODUCT_LIMIT_BYTES + 1024, 1);
const hugeForm = new FormData();
hugeForm.append('files', new Blob([huge], { type: 'application/pdf' }), 'oversize.pdf');
let oversize;
try {
  oversize = await raw(`${ORIGINS.api}/upload`, {
    method: 'POST',
    headers: authHeaders(cookie, token),
    body: hugeForm,
  });
} catch (err) {
  oversize = { status: 0, text: String(err), json: null, setCookie: [], headers: {} };
}
const afterOversize = await raw(`${ORIGINS.api}/upload/files`, {
  headers: authHeaders(cookie, token),
});
const afterCount = Array.isArray(afterOversize.json)
  ? afterOversize.json.length
  : afterOversize.json?.results?.length ?? null;
record(
  'oversize upload fails and does not create a Media Item',
  oversize.status >= 400 && (beforeCount == null || afterCount === beforeCount),
  { status: oversize.status, beforeCount, afterCount, body: oversize.json || oversize.text }
);

const restart = await raw(`http://127.0.0.1:${PORTS.control}/restart`, { method: 'POST' });
record('API process restart completes', restart.status === 200, {
  status: restart.status,
  body: restart.json || restart.text,
});

if (fileUrl) {
  const afterRestart = await raw(fileUrl);
  record('Media Item preview survives API process restart', afterRestart.status === 200, {
    status: afterRestart.status,
    url: fileUrl,
  });
} else {
  record('Media Item preview survives API process restart', false, 'no file url');
}

const relogin = await raw(`${ORIGINS.api}/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Origin: ORIGINS.admin },
  body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
});
const reopened = await raw(
  `${ORIGINS.api}/content-manager/collection-types/api::work.work/${workId}`,
  {
    headers: authHeaders(cookieHeader(relogin.setCookie), accessToken(relogin.json)),
  }
);
record('Work still readable after API restart', reopened.status === 200, {
  status: reopened.status,
  title: reopened.json?.data?.title || reopened.json?.title || null,
});

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
const report = {
  question: 'K4F7/cms#5',
  capturedAt: new Date().toISOString(),
  origins: ORIGINS,
  passed,
  failed,
  results,
};
writeFileSync(join(evidenceDir(root), 'probe.json'), JSON.stringify(report, null, 2));
console.log(`\n${passed}/${results.length} checks passed. Wrote evidence/probe.json`);
process.exit(failed ? 1 : 0);
