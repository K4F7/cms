# Dokploy release (CI-driven)

Production API releases are driven by `.github/workflows/publish.yml` via
`scripts/dokploy-compose-release.mjs`, not by Dokploy GitHub `autoDeploy`
(kept off).

## Flow

1. Push `ghcr.io/k4f7/cms:<full-sha>` (`:latest` debug only).
2. GET `compose.one` → merge `CMS_IMAGE_TAG=<full 40-char sha>` and the same
   value into `APP_VERSION` (so `/health` version matches the pinned image);
   drop any stale `CMS_IMAGE_DIGEST` → POST `compose.saveEnvironment` → POST
   `compose.deploy`. Keep `DATABASE_*` and other peers.
3. Compose image: `ghcr.io/k4f7/cms:${CMS_IMAGE_TAG:?...}` + `pull_policy: always`.
   `api` healthcheck probes `http://127.0.0.1:1337/health` (host network) via Node `fetch`; `mem_limit: 1g`.

## Secrets (names only)

- `DOKPLOY_URL` — `https://dokploy.sein.moe`
- `DOKPLOY_API_KEY`
- `DOKPLOY_COMPOSE_ID` — cms-api `DORSlxjq_1B7NNAwi2l6M`

Do not commit secret values. Auth: `x-api-key`.

## Tests

```powershell
node --test tests/dokploy-compose-release.test.mjs
```
