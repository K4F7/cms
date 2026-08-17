# First-version production-shape acceptance

**Tickets:** [K4F7/cms#11](https://github.com/K4F7/cms/issues/11) (child), [K4F7/cms#6](https://github.com/K4F7/cms/issues/6) (parent spec)  
**Verdict:** The first-version Strapi operating contract is accepted against the repository's production-shaped split-origin baseline. Maintainers can re-run the same smoke without secrets in git.

## Durability promise (explicit)

This acceptance **only** guarantees that **same-host API process/container recreate** keeps database records and bind-mounted media available.

It does **not** claim recovery after VPS loss, disk failure, database deletion, media deletion, or any other disaster-recovery scenario. Backups, RPO, and RTO remain out of scope.

## Topology under test

```text
https://127.0.0.1:8443   prebuilt Admin (Vercel stand-in)
https://localhost:9443   TLS proxy → Strapi API (OpenResty stand-in)
http://127.0.0.1:1337    Strapi process (not public)
http://127.0.0.1:1901    control plane POST /restart (container recreate stand-in)
```

Production mapping is documented in [docs/production-baseline.md](../production-baseline.md): Vercel Admin HTTPS origin, OpenResty on `louis`, 1Panel PostgreSQL, host media bind mount, HMAC deploy webhook.

## How to re-run

Local production-shape smoke (builds Admin+API if needed, self-signed TLS, SQLite):

```powershell
npm ci
npm run typecheck
npm run test:acceptance
```

`test:acceptance` writes redacted evidence to `.tmp/acceptance/evidence.json` and `.tmp/acceptance/SUMMARY.md` (gitignored via `.tmp`).

Against deployed HTTPS origins (trusted certificates; do not commit secrets):

```powershell
$env:CMS_API_ORIGIN="https://api.example.com"
$env:CMS_ADMIN_ORIGIN="https://admin.example.com"
$env:APP_VERSION="<git-sha>"
$env:CMS_IMAGE_DIGEST="<image-digest>"
$env:ARCHIVE_ADMIN_EMAIL="<archive-administrator-email>"
$env:ARCHIVE_ADMIN_PASSWORD="<from GitHub Environment production>"
$env:ARCHIVE_READ_TOKEN="<archive-read-machine-credential>"
$env:CMS_REQUIRE_BROWSER_SESSION="1"
npm test
```

## Checklist ↔ evidence

| Criterion | Seam / evidence |
| --- | --- |
| Login, session refresh, expired-session feedback | `tests/login.test.mjs` — Admin origin login, `SameSite=None; Secure; HttpOnly` refresh, `POST /admin/access-token`, dead bearer → 401/403 |
| Create / reopen / edit / publish Work | `tests/work-authoring.test.mjs` — real Admin Content Manager browser flow |
| Upload, preview, WorkMedia Relationship | `tests/media-upload.test.mjs` — upload + preview URL + `mediaItems` association |
| Under/over 50 MiB product limit | `tests/media-upload.test.mjs` — tiny PNG succeeds; >50 MiB fails without a new Media Item |
| CORS allowlist / reject | `tests/login.test.mjs` — exact Admin origin + credentials; unapproved origin has no `ACAO` |
| Deploy webhook SHA + digest; invalid/expired/replay fail closed | `tests/deploy-webhook.test.mjs` — HMAC contract; no pull/recreate on 401 |
| Health reports version (+ digest when set) | `tests/health.test.mjs` + `/health` in acceptance evidence |
| After API recreate, Work / Media / relationship / preview remain | `tests/media-upload.test.mjs` — control `POST /restart` then re-read |
| Health failure fails deploy; diagnostics retained | `tests/deploy-webhook.test.mjs` — 503 `health_failed`, prune skipped |
| Reproducible config & known limits; no secrets in report | This document + `.tmp/acceptance/evidence.json` (`secrets: redacted`) |
| Build / typecheck / suite green | `npm run typecheck` and `npm run test:acceptance` |

## Browser network evidence (baseline)

From the Admin HTTPS origin against the API HTTPS origin:

1. CORS preflight to `/admin/init` returns the exact Admin origin and `Access-Control-Allow-Credentials: true`.
2. `POST /admin/login` with valid Archive Administrator credentials returns 200, an access token in the JSON body, and refresh cookies marked `SameSite=None; Secure; HttpOnly`.
3. Invalid password returns ≥400 and does not set a session cookie.
4. `POST /admin/access-token` with the refresh cookie returns a new access token.
5. Bearer `dead.token.value` against `/admin/users/me` returns 401/403 with explicit credential error copy.
6. Content Manager Work create / edit / publish and Media Library preview are exercised through Chromium against the prebuilt Admin assets.

Self-signed lab certificates are **not** proof that production cookie jars store `Secure` refresh cookies. Re-check with `CMS_REQUIRE_BROWSER_SESSION=1` on trusted certificates before treating SPA reload persistence as production-proven. See `prototype/cross-origin-admin-upload/FINDINGS.md`.

## Deployment evidence (baseline)

Contract tests (no private shell structure):

- Timely HMAC over `timestamp.body` is accepted; wrong signature, skew beyond max, and replay are rejected.
- Invalid signature returns 401 and never pulls or recreates.
- Successful deploy returns `{ status, gitSha, imageDigest }` after health succeeds.
- Failed health returns 503 `health_failed` and does not prune images; previous successful state is retained.
- `redeploy-previous` rebuilds the last successful image through the same webhook.

Live `main` publish path: `.github/workflows/publish.yml` builds `ghcr.io/k4f7/cms:<git-sha>`, then calls the HMAC webhook. Operator runbook: [docs/production-baseline.md](../production-baseline.md) §发布.

## Known limits

- Local acceptance uses SQLite and a process restart control plane, not a Docker recreate against 1Panel PostgreSQL on `louis`.
- Deploy pull/recreate on the VPS is covered by the webhook contract plus the publish workflow, not by a second in-repo Docker integration harness.
- No automatic database or media rollback after a failed release.
- Archive Read Contract remains unbound to Koishi; this acceptance does not deliver the QQ read adapter.
- Payload runtime assumptions stay excluded.

## Parent spec closure

Closing #11 completes the child set for #6 (`#7`–`#11`). The durable operating decisions remain those recorded in the #6 specification and this repository's production baseline docs.
