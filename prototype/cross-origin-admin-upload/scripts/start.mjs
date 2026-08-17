/**
 * PROTOTYPE — wipe me.
 *
 * Question (K4F7/cms#5): in a temporary split deployment, can a Vercel-like
 * Admin origin and a VPS-like Strapi API origin complete login, session
 * refresh, local upload/preview, Work edit/publish, and fail closed on
 * CORS / oversize / bad session?
 *
 * Topology:
 *   https://127.0.0.1:8443  Admin static (Vercel stand-in)
 *   https://localhost:9443  Strapi API via TLS proxy (OpenResty stand-in)
 *   http://127.0.0.1:1337   Strapi process (not public)
 *   https://127.0.0.1:8844  unapproved origin
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN, ORIGINS, PORTS, PROXY_LIMIT_BYTES, ensureEnv, findAdminIndex } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strapiRoot = join(root, 'strapi');
const cert = readFileAfterEnsure();

function readFileAfterEnsure() {
  execFileSync(process.execPath, [join(root, 'scripts', 'make-certs.mjs')], {
    stdio: 'inherit',
  });
  return {
    key: readFileSync(join(root, 'certs', 'key.pem')),
    cert: readFileSync(join(root, 'certs', 'cert.pem')),
  };
}

ensureEnv(strapiRoot);

if (!findAdminIndex(strapiRoot)) {
  console.log('building Admin bundle with STRAPI_ADMIN_BACKEND_URL=%s', ORIGINS.api);
  execFileSync('npm', ['run', 'build'], {
    cwd: strapiRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      STRAPI_ADMIN_BACKEND_URL: ORIGINS.api,
    },
    shell: true,
  });
}

const adminIndex = findAdminIndex(strapiRoot);
if (!adminIndex) {
  throw new Error('Admin build output not found');
}
const adminDir = dirname(adminIndex);

let strapiProc = startStrapi();
await waitFor('http://127.0.0.1:1337/admin/init', 120_000);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveAdmin(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = join(adminDir, decodeURIComponent(urlPath));
  if (!filePath.startsWith(adminDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    const fallback = join(adminDir, 'index.html');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(fallback));
    return;
  }
  res.writeHead(200, { 'content-type': mime[extname(filePath)] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

createHttpsServer(cert, serveAdmin).listen(PORTS.adminHttps, '127.0.0.1', () => {
  console.log('admin  %s  (cross-site Vercel stand-in)', ORIGINS.admin);
});
createHttpsServer(cert, serveAdmin).listen(PORTS.adminSameSiteHttps, 'localhost', () => {
  console.log('admin  %s  (same-site shared-domain stand-in)', ORIGINS.adminSameSite);
});

createHttpsServer(cert, (req, res) => {
  const length = Number(req.headers['content-length'] || 0);
  if (length > PROXY_LIMIT_BYTES) {
    res.writeHead(413, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy body limit 52 MiB' }));
    return;
  }

  let seen = 0;
  req.on('data', (chunk) => {
    seen += chunk.length;
    if (seen > PROXY_LIMIT_BYTES) {
      req.destroy();
      if (!res.headersSent) {
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'proxy body limit 52 MiB' }));
      }
    }
  });

  const proxyReq = httpRequest(
    {
      hostname: '127.0.0.1',
      port: PORTS.strapi,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `localhost:${PORTS.apiHttps}`,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': `localhost:${PORTS.apiHttps}`,
        'x-forwarded-for': req.socket.remoteAddress,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
  req.pipe(proxyReq);
}).listen(PORTS.apiHttps, 'localhost', () => {
  console.log('api    %s  (OpenResty stand-in, 52 MiB body cap)', ORIGINS.api);
});

const unapprovedPage = `<!doctype html>
<meta charset="utf-8">
<title>Unapproved origin</title>
<pre id="out">probing…</pre>
<script>
fetch(${JSON.stringify(ORIGINS.api + '/admin/init')}, { credentials: 'include' })
  .then(async (r) => {
    document.getElementById('out').textContent = 'unexpected success ' + r.status + ' ' + await r.text();
  })
  .catch((err) => {
    document.getElementById('out').textContent = 'CORS/network failure as expected: ' + err;
  });
</script>
`;

createHttpsServer(cert, (_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(unapprovedPage);
}).listen(PORTS.unapprovedHttps, '127.0.0.1', () => {
  console.log('other  %s  (unapproved origin)', ORIGINS.unapproved);
});

createHttpServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/restart') {
    console.log('restarting Strapi API process');
    await stopStrapi(strapiProc);
    strapiProc = startStrapi();
    try {
      await waitFor('http://127.0.0.1:1337/admin/init', 120_000);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }
  if (req.url === '/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        {
          question: 'K4F7/cms#5 cross-origin Admin + local upload',
          origins: ORIGINS,
          admin: { email: ADMIN.email },
          limits: { productMiB: 50, proxyMiB: 52 },
          cookie: { sameSite: 'none', path: '/admin', secureInProduction: true },
        },
        null,
        2
      )
    );
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORTS.control, '127.0.0.1', () => {
  console.log('ctrl   http://127.0.0.1:%s/state', PORTS.control);
  printState();
});

function startStrapi() {
  const bin = join(strapiRoot, 'node_modules', '@strapi', 'strapi', 'bin', 'strapi.js');
  return spawn(process.execPath, [bin, 'start'], {
    cwd: strapiRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      STRAPI_ADMIN_BACKEND_URL: ORIGINS.api,
    },
  });
}

function stopStrapi(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode != null) {
      resolve();
      return;
    }
    proc.once('exit', () => resolve());
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (proc.exitCode == null) proc.kill('SIGKILL');
    }, 8000);
  });
}

async function waitFor(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 401 || res.status === 200) return;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timeout waiting for ${url}`);
}

function printState() {
  console.log('');
  console.log('=== PROTOTYPE STATE ===');
  console.log('Admin origin :', ORIGINS.admin, '(cross-site)');
  console.log('Admin same   :', ORIGINS.adminSameSite, '(same-site)');
  console.log('API origin   :', ORIGINS.api);
  console.log('Login        :', ADMIN.email, '/', ADMIN.password);
  console.log('Unapproved   :', ORIGINS.unapproved);
  console.log('Probe        : npm run probe');
  console.log('=======================');
}
