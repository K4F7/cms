import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'evidence');

function redact(value) {
  const json = JSON.stringify(value);
  const cleaned = json
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[redacted-jwt]')
    .replace(/strapi_admin_refresh=[^;]+/g, 'strapi_admin_refresh=[redacted]')
    .replace(/strapi_admin_refresh\.sig=[^;]+/g, 'strapi_admin_refresh.sig=[redacted]');
  return JSON.parse(cleaned);
}

for (const name of ['probe.json', 'browser.json']) {
  const path = join(dir, name);
  if (!existsSync(path)) continue;
  writeFileSync(path, `${JSON.stringify(redact(JSON.parse(readFileSync(path, 'utf8'))), null, 2)}\n`);
  console.log('redacted', name);
}
