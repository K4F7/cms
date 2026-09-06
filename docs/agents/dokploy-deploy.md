# Dokploy release (CI-driven)

Production API releases are driven by `.github/workflows/publish.yml` via
`scripts/dokploy-compose-release.mjs`, not by Dokploy GitHub `autoDeploy`
(kept off).

## Flow

1. Push `ghcr.io/k4f7/cms:<full-sha>` (`:latest` debug only).
2. GET `compose.one` → merge `CMS_IMAGE_TAG=<full 40-char sha>` into existing
   env (keep `DATABASE_*`) → POST `compose.saveEnvironment` → POST
   `compose.deploy`.
3. Compose image: `ghcr.io/k4f7/cms:${CMS_IMAGE_TAG:?...}` + `pull_policy: always`.

## Secrets (names only)

- `DOKPLOY_URL` — `https://dokploy.sein.moe`
- `DOKPLOY_API_KEY`
- `DOKPLOY_COMPOSE_ID` — cms-api `DORSlxjq_1B7NNAwi2l6M`

Do not commit secret values. Auth: `x-api-key`.

## Tests

```powershell
node --test tests/dokploy-compose-release.test.mjs
```
