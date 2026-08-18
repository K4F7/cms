/**
 * Admin browser authoring seam for Work draft / edit / publish (K4F7/cms#8).
 * Asserts visible Admin behavior; does not couple to Strapi React internals.
 *
 * Split-origin Admin (127.0.0.1) → API (localhost) blocks third-party refresh
 * cookies in Chromium. Tests seed the Admin SPA access token via localStorage
 * (Strapi's "remember me" path) after a real Admin login API call, then drive
 * Content Manager in the browser.
 * Browser tests pin strapi-admin-language=en so English chrome selectors stay stable.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { ADMIN, chromePath } from '../scripts/lib.mjs';

const apiOrigin = process.env.CMS_API_ORIGIN;
const adminOrigin = process.env.CMS_ADMIN_ORIGIN;

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
  return { status: res.status, text, json };
}

function accessToken(payload) {
  return payload?.data?.token || payload?.data?.accessToken || payload?.token || null;
}

async function launchBrowser() {
  const executablePath = chromePath();
  if (!existsSync(executablePath)) {
    return null;
  }

  return puppeteer.launch({
    executablePath,
    headless: true,
    acceptInsecureCerts: true,
    args: [
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      ...(process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
    ],
  });
}

async function openAuthoringPage(browser) {
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

  const page = await browser.newPage();
  await page.evaluateOnNewDocument((access) => {
    window.localStorage.setItem('jwtToken', JSON.stringify(access));
    window.localStorage.setItem('isLoggedIn', 'true');
    window.localStorage.setItem('strapi-admin-language', 'en');
  }, token);

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const headers = { ...req.headers() };
    if (req.url().startsWith(apiOrigin)) {
      headers.authorization = `Bearer ${token}`;
    }
    req.continue({ headers }).catch(() => null);
  });

  return page;
}

async function openWorkCreate(page) {
  await page.goto(`${adminOrigin}/content-manager/collection-types/api::work.work/create`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForNetworkIdle({ timeout: 20_000 }).catch(() => null);
  await page.waitForFunction(
    () =>
      !(window.location.pathname || '').includes('/auth/login') &&
      Boolean(document.querySelector('input:not([type="hidden"]), textarea')),
    { timeout: 60_000 }
  );
}

async function fillFieldByNameOrLabel(page, field, value) {
  const selector = await page.evaluate((fieldName) => {
    const byName =
      document.querySelector(`input[name="${fieldName}"]`) ||
      document.querySelector(`textarea[name="${fieldName}"]`);
    if (byName) {
      if (!byName.id) byName.id = `cms-test-${fieldName}`;
      return `#${CSS.escape(byName.id)}`;
    }

    const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const wanted = normalize(fieldName);
    for (const input of document.querySelectorAll('input:not([type="hidden"]), textarea')) {
      const labelled =
        (input.id && document.querySelector(`label[for="${input.id}"]`)?.textContent) ||
        input.getAttribute('aria-label') ||
        '';
      if (normalize(labelled).includes(wanted)) {
        if (!input.id) input.id = `cms-test-${fieldName}`;
        return `#${CSS.escape(input.id)}`;
      }
    }
    return null;
  }, field);

  assert.ok(selector, `could not find field "${field}"`);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value, { delay: 10 });
}

async function clickButtonByText(page, texts) {
  const wanted = texts.map((text) => text.toLowerCase());
  const clicked = await page.evaluate((labels) => {
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
    for (const button of buttons) {
      const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (labels.some((label) => text === label || text.includes(label))) {
        button.click();
        return text;
      }
    }
    return null;
  }, wanted);
  assert.ok(clicked, `could not click button matching ${texts.join(' / ')}`);
  await page.waitForNetworkIdle({ timeout: 20_000 }).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function pageContains(page, text) {
  return page.evaluate((expected) => {
    if ((document.body?.innerText || '').includes(expected)) return true;
    return [...document.querySelectorAll('input, textarea')].some((el) =>
      String(el.value || '').includes(expected)
    );
  }, text);
}

test('Archive Administrator can create, reopen, edit, and publish a Work in Admin', async (t) => {
  if (!apiOrigin || !adminOrigin) {
    t.skip('CMS_API_ORIGIN and CMS_ADMIN_ORIGIN are required');
    return;
  }

  const browser = await launchBrowser();
  if (!browser) {
    t.skip('Chrome is not available for the Admin browser seam');
    return;
  }

  const stamp = Date.now();
  const archiveId = `browser-work-${stamp}`;
  const title = `Browser Work ${stamp}`;
  const summary = `Created in browser ${stamp}`;
  const editedTitle = `Edited Browser Work ${stamp}`;
  const editedSummary = `Edited in browser ${stamp}`;

  try {
    const page = await openAuthoringPage(browser);
    await openWorkCreate(page);

    await fillFieldByNameOrLabel(page, 'title', title);
    await fillFieldByNameOrLabel(page, 'archiveId', archiveId);
    await fillFieldByNameOrLabel(page, 'summary', summary);
    await clickButtonByText(page, ['save']);

    await page.waitForFunction(
      (expectedTitle) => {
        if ((document.body?.innerText || '').includes(expectedTitle)) return true;
        return [...document.querySelectorAll('input, textarea')].some((el) =>
          String(el.value || '').includes(expectedTitle)
        );
      },
      { timeout: 30_000 },
      title
    );

    const createUrl = page.url();
    assert.match(createUrl, /api::work\.work\/.+/);
    const documentPath = new URL(createUrl).pathname;

    await page.goto(`${adminOrigin}${documentPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForNetworkIdle({ timeout: 20_000 }).catch(() => null);
    await page.waitForFunction(
      (expectedTitle) =>
        [...document.querySelectorAll('input, textarea')].some((el) =>
          String(el.value || '').includes(expectedTitle)
        ),
      { timeout: 30_000 },
      title
    );
    assert.equal(await pageContains(page, title), true);
    assert.equal(await pageContains(page, summary), true);

    await fillFieldByNameOrLabel(page, 'title', editedTitle);
    await fillFieldByNameOrLabel(page, 'summary', editedSummary);
    await clickButtonByText(page, ['save']);
    await page.waitForFunction(
      (expectedTitle) =>
        [...document.querySelectorAll('input, textarea')].some((el) =>
          String(el.value || '').includes(expectedTitle)
        ),
      { timeout: 30_000 },
      editedTitle
    );

    await page.reload({ waitUntil: 'networkidle0', timeout: 60_000 }).catch(() => null);
    await page.waitForNetworkIdle({ timeout: 20_000 }).catch(() => null);
    await page.waitForFunction(
      (expectedTitle) =>
        [...document.querySelectorAll('input, textarea')].some((el) =>
          String(el.value || '').includes(expectedTitle)
        ),
      { timeout: 30_000 },
      editedTitle
    );
    assert.equal(await pageContains(page, editedTitle), true);
    assert.equal(await pageContains(page, editedSummary), true);

    await clickButtonByText(page, ['publish']);
    await page.waitForFunction(
      () => {
        const text = (document.body?.innerText || '').toLowerCase();
        return text.includes('published') || text.includes('unpublish');
      },
      { timeout: 30_000 }
    );

    await page.reload({ waitUntil: 'networkidle0', timeout: 60_000 }).catch(() => null);
    await page.waitForNetworkIdle({ timeout: 20_000 }).catch(() => null);
    assert.equal(await pageContains(page, editedTitle), true);
    const publishedCue = await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      return text.includes('published') || text.includes('unpublish');
    });
    assert.equal(publishedCue, true);
  } finally {
    await browser.close();
  }
});

test('invalid Work input shows validation feedback and does not publish a successful record', async (t) => {
  if (!apiOrigin || !adminOrigin) {
    t.skip('CMS_API_ORIGIN and CMS_ADMIN_ORIGIN are required');
    return;
  }

  const browser = await launchBrowser();
  if (!browser) {
    t.skip('Chrome is not available for the Admin browser seam');
    return;
  }

  const archiveId = `invalid-publish-${Date.now()}`;

  try {
    const page = await openAuthoringPage(browser);
    let publishStatus = null;
    page.on('response', (res) => {
      const url = res.url();
      const method = res.request().method();
      if (method === 'POST' && url.includes('/actions/publish')) {
        publishStatus = res.status();
      }
    });

    await openWorkCreate(page);
    // Drafts may omit required fields; publish must still enforce them.
    await fillFieldByNameOrLabel(page, 'archiveId', archiveId);
    await clickButtonByText(page, ['save']);
    await page.waitForFunction(
      () => /api::work\.work\/.+/.test(window.location.pathname || ''),
      { timeout: 30_000 }
    );

    await clickButtonByText(page, ['publish']);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    assert.ok(
      publishStatus === null || publishStatus >= 400,
      `unexpected publish status ${publishStatus}`
    );
    const feedback = await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      return (
        text.includes('required') ||
        text.includes('validation') ||
        text.includes('title') ||
        text.includes('cannot') ||
        Boolean(document.querySelector('[data-error], [aria-invalid="true"], .error'))
      );
    });
    assert.equal(feedback, true);

    const published = await raw(`${apiOrigin}/api/archive/v1/works/${encodeURIComponent(archiveId)}`, {
      headers: {
        Authorization: `Bearer ${process.env.ARCHIVE_READ_TOKEN}`,
      },
    });
    assert.equal(published.status, 404);
  } finally {
    await browser.close();
  }
});
