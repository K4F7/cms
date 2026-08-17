/**
 * Real-browser evidence for K4F7/cms#5. Uses local Chrome and ignores the
 * prototype self-signed cert. Runs two Chrome cookie policies so the
 * third-party-cookie question is visible in the artifact.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { ADMIN, ORIGINS, evidenceDir } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runSession(label, adminOrigin, extraArgs) {
  const network = [];
    const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    acceptInsecureCerts: true,
    args: ['--ignore-certificate-errors', '--allow-insecure-localhost', ...extraArgs],
  });

  try {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    page.on('response', async (res) => {
      const req = res.request();
      const url = res.url();
      if (!url.startsWith(ORIGINS.api)) return;
      const headers = res.headers();
      const authorization = req.headers().authorization || null;
      network.push({
        method: req.method(),
        url,
        status: res.status(),
        requestCookie: req.headers().cookie || null,
        requestAuthorization: authorization ? authorization.slice(0, 20) : null,
        acao: headers['access-control-allow-origin'] || null,
        acac: headers['access-control-allow-credentials'] || null,
        setCookie: headers['set-cookie'] || null,
      });
    });

    await page.goto(adminOrigin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.screenshot({
      path: join(evidenceDir(root), `admin-${label}-load.png`),
      fullPage: true,
    });
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 30_000 });
    const email = await page.$('input[name="email"]') || await page.$('input[type="email"]');
    const password = await page.$('input[name="password"]') || await page.$('input[type="password"]');
    await email.click({ clickCount: 3 });
    await email.type(ADMIN.email);
    await password.click({ clickCount: 3 });
    await password.type(ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForNetworkIdle({ timeout: 20_000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 1500));

    const afterLogin = await page.url();
    const shot = join(evidenceDir(root), `admin-${label}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    const afterReload = await page.url();
    const cookies = await page.cookies('https://localhost:9443/admin/login');
    const login = network.find((n) => n.method === 'POST' && n.url.endsWith('/admin/login'));
    const me = network.find((n) => n.method === 'GET' && n.url.endsWith('/admin/users/me'));
    const refresh = network.find((n) => n.method === 'POST' && n.url.endsWith('/admin/access-token'));

    return {
      label,
      adminOrigin,
      extraArgs,
      afterLogin,
      afterReload,
      stillAuthed: !afterReload.includes('/auth/login'),
      screenshot: shot,
      apiCookies: cookies.map((c) => ({
        name: c.name,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
      })),
      loginStatus: login?.status ?? null,
      loginSetCookie: login?.setCookie ?? null,
      meStatus: me?.status ?? null,
      meRequestCookie: me?.requestCookie ?? null,
      meAuthorization: me?.requestAuthorization ?? null,
      refreshStatus: refresh?.status ?? null,
      refreshRequestCookie: refresh?.requestCookie ?? null,
      network,
    };
  } finally {
    await browser.close();
  }
}

async function safeSession(label, origin, extraArgs) {
  try {
    return await runSession(label, origin, extraArgs);
  } catch (err) {
    return { label, adminOrigin: origin, error: String(err) };
  }
}

const crossSite = await safeSession('cross-site', ORIGINS.admin, []);
const sameSite = await safeSession('same-site', ORIGINS.adminSameSite, []);

const report = {
  question: 'K4F7/cms#5 browser',
  capturedAt: new Date().toISOString(),
  origins: ORIGINS,
  crossSite,
  sameSite,
};
writeFileSync(join(evidenceDir(root), 'browser.json'), JSON.stringify(report, null, 2));

console.log('cross-site', crossSite.error || `${crossSite.loginStatus} me=${crossSite.meStatus} cookie=${Boolean(crossSite.meRequestCookie)} reload=${crossSite.afterReload}`);
console.log('same-site ', sameSite.error || `${sameSite.loginStatus} me=${sameSite.meStatus} cookie=${Boolean(sameSite.meRequestCookie)} reload=${sameSite.afterReload}`);
console.log('wrote evidence/browser.json');
