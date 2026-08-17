import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

export const PORTS = {
  strapi: 1337,
  apiHttps: 9443,
  adminHttps: 8443,
  unapprovedHttps: 8844,
};

export const ORIGINS = {
  admin: `https://127.0.0.1:${PORTS.adminHttps}`,
  api: `https://localhost:${PORTS.apiHttps}`,
  unapproved: `https://127.0.0.1:${PORTS.unapprovedHttps}`,
  strapi: `http://127.0.0.1:${PORTS.strapi}`,
};

export const ADMIN = {
  email: process.env.ARCHIVE_ADMIN_EMAIL || 'archive.admin@example.test',
  password: process.env.ARCHIVE_ADMIN_PASSWORD || 'ArchiveAdmin!baseline1',
};

/** Dedicated machine credential for the unbound Archive Read Contract seam. */
export const ARCHIVE_READ_TOKEN =
  process.env.ARCHIVE_READ_TOKEN || 'archive-read-contract-baseline-token';

export const APP_VERSION = process.env.APP_VERSION || 'baseline-test';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function secret() {
  return randomBytes(16).toString('base64url');
}

export function writeTestEnv() {
  const envPath = join(root, '.env');
  const lines = {
    HOST: '127.0.0.1',
    PORT: String(PORTS.strapi),
    APP_KEYS: `${secret()},${secret()}`,
    API_TOKEN_SALT: secret(),
    ADMIN_JWT_SECRET: secret(),
    TRANSFER_TOKEN_SALT: secret(),
    ENCRYPTION_KEY: secret(),
    JWT_SECRET: secret(),
    PUBLIC_URL: ORIGINS.api,
    ADMIN_URL: '/',
    SERVE_ADMIN_PANEL: 'false',
    ADMIN_ORIGIN: ORIGINS.admin,
    ADMIN_COOKIE_SAMESITE: 'none',
    ADMIN_RATE_LIMIT: 'false',
    STRAPI_ADMIN_BACKEND_URL: ORIGINS.api,
    APP_VERSION,
    ARCHIVE_ADMIN_EMAIL: ADMIN.email,
    ARCHIVE_ADMIN_PASSWORD: ADMIN.password,
    ARCHIVE_READ_TOKEN,
    DATABASE_CLIENT: 'sqlite',
    DATABASE_FILENAME: '.tmp/baseline.db',
  };

  writeFileSync(
    envPath,
    Object.entries(lines)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
}

export function findAdminIndex() {
  const candidates = [
    join(root, 'dist', 'build', 'index.html'),
    join(root, 'build', 'index.html'),
    join(root, 'dist', 'index.html'),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

export function ensureProductionBuild() {
  const distWorkSchema = join(
    root,
    'dist',
    'src',
    'api',
    'work',
    'content-types',
    'work',
    'schema.json'
  );
  if (findAdminIndex() && existsSync(distWorkSchema)) return;
  console.log('building Admin+API with STRAPI_ADMIN_BACKEND_URL=%s', ORIGINS.api);
  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      STRAPI_ADMIN_BACKEND_URL: ORIGINS.api,
    },
    shell: true,
  });
}

/** @deprecated Use ensureProductionBuild — kept as an alias for older scripts. */
export function ensureAdminBuild() {
  return ensureProductionBuild();
}

export function ensureCerts() {
  const certDir = join(root, '.tmp', 'certs');
  mkdirSync(certDir, { recursive: true });
  const key = join(certDir, 'key.pem');
  const cert = join(certDir, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${key}" -out "${cert}" -days 2 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { stdio: 'inherit' }
    );
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

export async function waitForUrl(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timeout waiting for ${url}`);
}

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;

  try {
    const command = process.platform === 'win32' ? 'where chrome' : 'which google-chrome';
    return execSync(command, { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
  } catch {
    return candidates[0];
  }
}
