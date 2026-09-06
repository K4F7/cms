# 首版生产形态验收

本页是 [K4F7/cms#11](https://github.com/K4F7/cms/issues/11) 的验收记录，覆盖父规格 [K4F7/cms#6](https://github.com/K4F7/cms/issues/6) 的首版边界。生产配置与部署步骤仍以 [production-baseline.md](production-baseline.md) 为准。不要把 secret 写进仓库。

## 保证范围

首版只保证**同一 VPS 上的 API 容器或进程重建**之后，已有 Work、Media Item、WorkMedia Relationship 和媒体预览仍然可用。

这不是备份，不是容灾，也不承诺下列情况后的恢复：

- VPS `louis` 丢失或无法启动
- 磁盘损坏或整盘删除
- 1Panel PostgreSQL 被删除或损坏
- 宿主机媒体目录被删除

本地生产形态使用 SQLite 与 `public/uploads`；生产使用 1Panel PostgreSQL 与 `CMS_MEDIA_PATH` bind mount。两者都只覆盖同机重建。

## 生产形态

本地验收栈（`npm run test:acceptance`）模拟已确定的分离拓扑：

```text
https://127.0.0.1:8443   预构建 Admin（Vercel 替身）
https://localhost:9443   TLS 代理 → Strapi API（OpenResty 替身）
http://127.0.0.1:1337    Strapi 进程（不对外）
http://127.0.0.1:1901    控制面 POST /restart（容器重建的本地替身）
```

Admin 与 API 来自同一提交。Vercel 只发布 `dist/build`；不运行 API、不连接数据库、不保存媒体。

生产再跑同一组 seam 时，把 origin 换成稳定 HTTPS：

```powershell
$env:CMS_API_ORIGIN="https://cms.sein.moe"
$env:CMS_ADMIN_ORIGIN="https://meme.sein.moe"
$env:APP_VERSION="<git-sha>"
$env:CMS_IMAGE_DIGEST="sha256:<digest>"
$env:ARCHIVE_ADMIN_EMAIL="<archive-administrator-email>"
$env:ARCHIVE_ADMIN_PASSWORD="<from GitHub Environment production>"
$env:ARCHIVE_READ_TOKEN="<archive-read-machine-credential>"
$env:CMS_REQUIRE_BROWSER_SESSION="1"
npm test
```

自签证书不能证明生产证书下的 cookie 存储。生产必须用受信任证书并设置 `CMS_REQUIRE_BROWSER_SESSION=1`。

## 重复执行

| 环境 | 命令 | 说明 |
| --- | --- | --- |
| 本地生产形态 | `npm run test:acceptance` | 拉起分离 origin，跑全部 seam，写入已脱敏证据 |
| 本地不写证据 | `npm run test:baseline` | CI 使用的同一套检查 |
| 已部署生产 origin | 上面的 `npm test` | 不启动本地栈；不触发真实发布 |

日常发布路径是 `.github/workflows/publish.yml`：构建并推送 `ghcr.io/k4f7/cms:<git-sha>` 与 `:latest`；运行时由 Dokploy 按 `CMS_IMAGE_TAG` 拉取。自建 HMAC `/deploy` 路径已退役。验收不在本地对生产机发起真实发布。

## 验收对照

| #11 标准 | 本地生产形态 seam | 结果 |
| --- | --- | --- |
| Vercel 形态 Admin 登录、刷新、失效会话反馈 | `tests/login.test.mjs` | HTTP 登录 / 刷新 / 401 通过；浏览器刷新会话在自签 TLS 下跳过 |
| 真实 Admin 创建、重新打开、修改并发布 Work | `tests/work-authoring.test.mjs` | 见下方运行记录 |
| 上传图片或 PDF，预览并建立 WorkMedia Relationship | `tests/media-upload.test.mjs` | 见下方运行记录 |
| 小于 50 MiB 成功；超过上限失败且不留下 Media Item | `tests/media-upload.test.mjs` | 见下方运行记录 |
| 未批准 origin CORS 失败；配置 Admin origin 带 credentials 成功 | `tests/login.test.mjs` | 见下方运行记录 |
| GHCR 镜像 tag 为已知 SHA；健康响应含 SHA 与 digest | `GET /health` + `publish.yml` build/push | 本地 `/health` 通过；镜像推送由 CI 承担，Dokploy 拉取 |
| 重建 API 后 Work、Media Item、WorkMedia、预览仍可用 | `tests/media-upload.test.mjs` 进程重启 | 本地 `POST /restart` 通过（容器重建的同机替身） |
| 自建 deploy webhook 已退役 | — | 见发布说明；不再验收 HMAC `/deploy` |
| 健康失败不得当作发布成功 | `GET /health` | 本地 `/health`；运行时由 Dokploy 侧处理 |
| 可复现配置、步骤、网络与部署证据，不含 secret | [acceptance/evidence.json](acceptance/evidence.json) | 已脱敏 |
| 构建、类型检查与适用测试通过 | `npm run typecheck` + `npm run test:acceptance` | 见下方运行记录 |

浏览器级检查断言可见的 Admin / 公开 API 行为，不断言 Strapi React 内部实现。部署检查关注 GHCR 镜像与 `/health`，不断言 Dokploy 或主机 shell 结构。

## 浏览器与部署证据

已脱敏记录在 [acceptance/evidence.json](acceptance/evidence.json)。其中：

- 登录响应只保留 cookie **属性**（`HttpOnly` / `Secure` / `SameSite=None` / `Path=/admin`），不含 cookie 值或 JWT。
- 浏览器网络记录只保留 method、origin+path、status。
- 自建 deploy webhook 已退役；证据不再记录 HMAC `/deploy` 契约。镜像由 Actions 推 GHCR，Dokploy 拉取。

跨站 cookie 的已知限制见 `prototype/cross-origin-admin-upload/FINDINGS.md`。本验收沿用该结论：自签 TLS 下 Admin SPA 可能无法保存 refresh cookie；这不能当作生产证书失败的证据。

## 已知限制

- 本记录针对仓库内的生产形态栈，不是一次已接线的 louis / Vercel 人工值班记录。生产 origin 需要 GitHub Environment `production` 中的密钥与稳定证书后再跑上一节的 `npm test`。
- 本地数据库是 SQLite（`.tmp/baseline.db`），不是 1Panel PostgreSQL。数据库私有性与独立 user 仍按 `docs/production-baseline.md` 在 louis 上落实。
- 本地媒体在 `public/uploads`；生产媒体在宿主机 bind mount。控制面 `POST /restart` 只重建 API 进程，等价于“同机重建后文件还在”，不是 `docker compose` 本身。
- 真实 GHCR 推送由 `publish.yml` 覆盖；运行时拉取与重建由 Dokploy 负责。本验收不在开发机上 pull 生产镜像。
- 不覆盖备份、R2、Payload 迁移、Koishi Archive Read 绑定、公开作品站。

## 本次运行

在 `issue/11-first-version-acceptance` 上执行：

```powershell
npm run typecheck
npm run test:acceptance
```

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| 生产构建 | `ensureProductionBuild` 复用已有 `dist/build` + Work `mediaItems` schema（Admin 与 API 同一提交） |
| `npm run test:acceptance` | 29 tests：28 通过，1 跳过 |
| 跳过项 | 真实 Admin SPA 刷新后保持会话：自签 TLS 下 Chrome 未保存 refresh cookie，与 `FINDINGS.md` 一致。生产必须用受信任证书并设置 `CMS_REQUIRE_BROWSER_SESSION=1` 再验。 |
| `GET /health` | `200 {"status":"ok","version":"baseline-test","imageDigest":"sha256:baseline-acceptance"}` |
| 超限上传 | `POST /upload` → `413`，Media Item 数量不变 |
| API 进程重建 | 已发布 Work、WorkMedia Relationship、预览 URL 仍可用（约 4.9s） |
| 证据 | [acceptance/evidence.json](acceptance/evidence.json)，HTTP 检查通过；webhook 相关项已标为退役；不含 JWT / cookie 值 / 密码 |
