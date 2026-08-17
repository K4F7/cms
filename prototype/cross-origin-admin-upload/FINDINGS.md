# FINDINGS — K4F7/cms#5

**Question:** In a temporary split deployment, can a Vercel-like Strapi Admin origin and a VPS-like Strapi API origin complete login, session refresh, local media upload/preview, Work create/edit/publish? Do CORS, cookies, upload size, failure feedback, retry, and recovery meet the first-version bar?

**Verdict:** The HTTP contract works. Production can use the split if both origins are trusted HTTPS and the refresh cookie is first-party (shared eTLD+1) or explicitly `SameSite=None; Secure`. A default Vercel `*.vercel.app` Admin plus an unrelated VPS API hostname is not a first-party cookie topology. The stock Admin SPA did not establish a durable browser session in this self-signed lab.

This is a throwaway prototype, not production.

## What was verified

Reproducible stack: `cd prototype/cross-origin-admin-upload && npm start`, then `npm run probe`.

| Check | Result |
| --- | --- |
| CORS allowlist + credentials for the Admin origin | Pass (204, `ACAO` exact origin, `ACAC=true`) |
| Unapproved origin | Pass (no `ACAO`) |
| Bad password | Pass (400 `Invalid credentials`, no session cookie) |
| Login `Set-Cookie` | Pass (`strapi_admin_refresh` + `.sig`; `path=/admin`; `samesite=none`; `secure`; `httponly`) |
| Login body | Pass (`data.token` short-lived access token) |
| `/admin/users/me` with `Authorization: Bearer <token>` | Pass (bearer-only is enough) |
| `POST /admin/access-token` with refresh cookie | Pass (new access token) |
| Dead token | Pass (401 `Missing or invalid credentials`) |
| Create / edit / publish Work | Pass |
| Upload image under 50 MiB + preview URL | Pass |
| Associate media with Work | Pass |
| Upload above 50 MiB | Pass (413 `FileTooBig`; media count unchanged) |
| Restart API process | Pass (SQLite + `public/uploads` survive; preview and Work still readable) |

`npm run probe` recorded **18/18** in `evidence/probe.json` (tokens redacted in git).

## Browser network evidence

Chrome loaded the prebuilt Admin from `https://127.0.0.1:8443` and called the API at `https://localhost:9443`. Login `POST /admin/login` returned 200 and the `SameSite=None; Secure; HttpOnly` refresh cookies. The SPA then called `/admin/users/me` with `Authorization: Bearer null` and no cookie. Refresh `POST /admin/access-token` was 401. The same pattern happened on the same-site Admin `https://localhost:8444`.

So:

1. Credentialed CORS is not the blocker. Preflights succeed.
2. Access tokens live in the JSON body. The refresh cookie is only required after reload / access-token expiry.
3. The stock Admin did not keep `data.token` after login in this lab, and Chrome did not store the refresh cookie (empty cookie jar for `localhost:9443/admin`). Self-signed TLS is a likely cause for `Secure` cookie storage; this must be re-checked on real certificates in #7.
4. Cookie-only `/admin/users/me` is 401. Bearer-only is 200. Reload therefore depends on the refresh cookie being stored.

## Production constraints for #7

1. **Trusted HTTPS on both origins.** Strapi 5.24+ marks admin cookies Secure in production. HTTP will fail. Self-signed lab certs are not evidence that real certificates fail.
2. **Do not use default `SameSite=Lax` across Vercel and the VPS.** Lax will not send the refresh cookie on cross-site XHR. Set `auth.cookie.sameSite` to `'none'` *or* put Admin and API on a shared eTLD+1 (`admin.example.com` + `api.example.com`) so Lax is first-party.
3. **Do not use the default `*.vercel.app` Admin hostname with an unrelated API hostname** if you want a first-party refresh cookie. Give Admin a custom domain on the same site as the API, or accept `SameSite=None` plus third-party cookie policy risk.
4. **Bake `STRAPI_ADMIN_BACKEND_URL` at Admin build time.** Rebuild Admin when the API origin changes.
5. **CORS:** exact Admin origin, `credentials: true`, no wildcard.
6. **Cookie path `/admin`** is correct for API admin routes even when the SPA is served at `/`.
7. **50 MiB product cap** in Strapi body/upload config. Reverse-proxy body limit must be higher (this lab used 52 MiB). Current OpenResty global 50m is not enough.
8. **Media on a host bind mount**, not the container writable layer. Process restart kept files here; that is not disaster recovery.
9. **Failure copy already exists:** 400 invalid login, 401 missing/invalid session, 413 oversize. Keep those visible in Admin.

## Known limits of this prototype

- Not deployed to real Vercel or VPS `louis`.
- SQLite scratch DB (`.tmp/prototype.db`), not 1Panel PostgreSQL.
- Self-signed TLS. Chrome cookie storage on trusted certs is unproven here.
- Stock Admin browser session did not stay logged in in this lab.
- No GHCR/webhook path (that is #10).
- Secrets in `strapi/.env` are throwaway and gitignored.

## Decision for the map

The Vercel Admin + VPS API split is implementable. #7 should use a custom Admin HTTPS origin that shares a site with the API **or** `SameSite=None; Secure` on a trusted cert, never a wildcard CORS origin, and a proxy body limit above 50 MiB. Do not treat this branch as production code.
