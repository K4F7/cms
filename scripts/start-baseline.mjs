/**
 * Production-shaped local stack for K4F7/cms#7+:
 *   https://127.0.0.1:8443  prebuilt Admin (Vercel stand-in)
 *   https://localhost:9443  TLS proxy → Strapi API (OpenResty stand-in)
 *   http://127.0.0.1:1337   Strapi process (not public)
 *   http://127.0.0.1:1901   control plane (API process restart for media persistence)
 */
import { spawn } from 'node:child_process';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import {
  ADMIN,
  APP_VERSION,
  ORIGINS,
  PORTS,
  ensureProductionBuild,
  ensureCerts,
  findAdminIndex,
  root,
  waitForUrl,
  writeTestEnv,
} from './lib.mjs';

writeTestEnv();
ensureProductionBuild();
const tls = ensureCerts();

const adminIndex = findAdminIndex();
if (!adminIndex) {
  throw new Error('Admin build output not found');
}
const adminDir = dirname(adminIndex);

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
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(adminDir, 'index.html')));
    return;
  }
  res.writeHead(200, { 'content-type': mime[extname(filePath)] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

function proxyToApi(req, res) {
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
}

createHttpsServer(tls, serveAdmin).listen(PORTS.adminHttps, '127.0.0.1', () => {
  console.log('admin  %s', ORIGINS.admin);
});

createHttpsServer(tls, proxyToApi).listen(PORTS.apiHttps, 'localhost', () => {
  console.log('api    %s', ORIGINS.api);
});

const strapiBin = join(root, 'node_modules', '@strapi', 'strapi', 'bin', 'strapi.js');
/** @type {import('node:child_process').ChildProcess | null} */
let strapiProc = null;

function startStrapi() {
  strapiProc = spawn(process.execPath, [strapiBin, 'start'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      APP_VERSION,
      STRAPI_ADMIN_BACKEND_URL: ORIGINS.api,
    },
  });

  strapiProc.on('exit', (code) => {
    if (stoppingStack) return;
    if (code) process.exit(code);
  });
}

function stopStrapi() {
  if (strapiProc && strapiProc.exitCode == null) {
    strapiProc.kill('SIGTERM');
  }
}

let stoppingStack = false;
startStrapi();

createHttpServer(async (req, res) => {
  const path = req.url?.split('?')[0];
  if (req.method === 'POST' && path === '/restart') {
    stopStrapi();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    startStrapi();
    try {
      await waitForUrl(`${ORIGINS.strapi}/health`, 180_000);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } catch (err) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'not_ready', error: String(err) }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'not_found' }));
}).listen(PORTS.control, '127.0.0.1', () => {
  console.log('control http://127.0.0.1:%s/restart', PORTS.control);
});

process.on('SIGINT', () => {
  stoppingStack = true;
  stopStrapi();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stoppingStack = true;
  stopStrapi();
  process.exit(0);
});
process.on('exit', () => {
  stoppingStack = true;
  stopStrapi();
});

await waitForUrl(`${ORIGINS.strapi}/health`, 180_000);
console.log('login  %s / %s', ADMIN.email, ADMIN.password);
console.log('health %s/health version=%s', ORIGINS.api, APP_VERSION);
