import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const PRODUCT_LIMIT_BYTES = 50 * 1024 * 1024;
export const PROXY_LIMIT_BYTES = 52 * 1024 * 1024;

export const PORTS = {
  strapi: 1337,
  apiHttps: 9443,
  adminHttps: 8443,
  adminSameSiteHttps: 8444,
  unapprovedHttps: 8844,
  control: 7099,
};

export const ORIGINS = {
  admin: `https://127.0.0.1:${PORTS.adminHttps}`,
  adminSameSite: `https://localhost:${PORTS.adminSameSiteHttps}`,
  api: `https://localhost:${PORTS.apiHttps}`,
  unapproved: `https://127.0.0.1:${PORTS.unapprovedHttps}`,
  strapi: `http://127.0.0.1:${PORTS.strapi}`,
};

export const ADMIN = {
  email: 'archive.admin@example.test',
  password: 'ArchiveAdmin!proto1',
};

export function ensureEnv(strapiRoot) {
  const envPath = join(strapiRoot, '.env');
  if (!existsSync(envPath)) {
    throw new Error('strapi/.env missing — run create-strapi first');
  }

  const extras = {
    HOST: '127.0.0.1',
    PORT: String(PORTS.strapi),
    PUBLIC_URL: ORIGINS.api,
    ADMIN_URL: '/',
    SERVE_ADMIN_PANEL: 'false',
    ADMIN_ORIGIN: ORIGINS.admin,
    ADMIN_ORIGIN_SAMESITE: ORIGINS.adminSameSite,
    ADMIN_COOKIE_SAMESITE: 'none',
    STRAPI_ADMIN_BACKEND_URL: ORIGINS.api,
    ADMIN_ACCESS_TOKEN_LIFESPAN: '120',
    ADMIN_IDLE_SESSION_LIFESPAN: '600',
    PROTOTYPE_ADMIN_EMAIL: ADMIN.email,
    PROTOTYPE_ADMIN_PASSWORD: ADMIN.password,
    DATABASE_CLIENT: 'sqlite',
    DATABASE_FILENAME: '.tmp/prototype.db',
  };

  let text = readFileSync(envPath, 'utf8');
  for (const [key, value] of Object.entries(extras)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) {
      text = text.replace(re, line);
    } else {
      text += `\n${line}`;
    }
  }
  writeFileSync(envPath, text.endsWith('\n') ? text : `${text}\n`);
}

export function findAdminIndex(strapiRoot) {
  const candidates = [
    join(strapiRoot, 'build', 'index.html'),
    join(strapiRoot, 'dist', 'build', 'index.html'),
    join(strapiRoot, 'dist', 'index.html'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function evidenceDir(root) {
  const dir = join(root, 'evidence');
  mkdirSync(dir, { recursive: true });
  return dir;
}
