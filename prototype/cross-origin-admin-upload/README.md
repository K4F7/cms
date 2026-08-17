# PROTOTYPE — wipe me

Answers [K4F7/cms#5](https://github.com/K4F7/cms/issues/5):

> In a temporary deployment, can a Vercel-hosted Strapi Admin and a
> VPS-hosted Strapi API stably complete login, session refresh, local
> media upload/preview, and Work create/edit/publish? Do proxy / CORS /
> cookie / upload-size settings, failure feedback, retry, and recovery
> meet the first-version bar?

This is not production. Secrets are throwaway. The SQLite file is
`.tmp/prototype.db` (PROTOTYPE — wipe me).

## One command

```powershell
cd prototype/cross-origin-admin-upload
npm start
```

Then in another terminal:

```powershell
npm run probe
```

Admin login: `archive.admin@example.test` / `ArchiveAdmin!proto1`

The answer is in [FINDINGS.md](./FINDINGS.md).

## Topology

```text
https://127.0.0.1:8443   prebuilt Admin static   (Vercel stand-in)
https://localhost:9443   TLS proxy → Strapi API  (OpenResty stand-in)
http://127.0.0.1:1337    Strapi process          (not public)
https://127.0.0.1:8844   unapproved origin
```

`127.0.0.1` and `localhost` are different sites, so Admin→API traffic is
cross-site the same way `*.vercel.app` → a VPS hostname is.

TLS uses a local self-signed cert (`npm run certs`). Browsers will warn.
The probe accepts the cert and writes `evidence/probe.json`.

## Assumed production mapping

| Prototype | Production |
| --- | --- |
| Admin origin `https://127.0.0.1:8443` | Vercel HTTPS origin |
| API origin `https://localhost:9443` | OpenResty on `louis` |
| Cookie `SameSite=None; Secure; HttpOnly` | required for that split |
| Upload product cap 50 MiB | Strapi middleware/provider |
| Proxy body cap 52 MiB | OpenResty must exceed 50 MiB |
