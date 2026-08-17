# 可登录生产基线

本页记录 [K4F7/cms#7](https://github.com/K4F7/cms/issues/7) 的生产配置与验证步骤。不要把 secret 写进仓库。

## 拓扑

```text
Vercel HTTPS Admin origin
        |
        | credentialed CORS, cookie path=/admin
        v
OpenResty on louis  →  Strapi API :1337
1Panel PostgreSQL（独立 database / user，只听 loopback）
```

Admin 与 API 来自同一提交。Vercel 只发布 `dist/build` 静态资源；不运行 API、不连接数据库、不保存媒体。

跨站 cookie 使用 `SameSite=None; Secure; HttpOnly`。若 Admin 与 API 共享 eTLD+1，可以把 `ADMIN_COOKIE_SAMESITE` 改成 `lax`。不要使用默认 `*.vercel.app` 再搭配无关 API 主机名，除非接受第三方 cookie 策略风险。见 `prototype/cross-origin-admin-upload/FINDINGS.md`。

## 1Panel PostgreSQL

不要新增 PostgreSQL 服务，不要把数据库端口暴露到公网。

在现有实例上创建独立 database 与 user（名称可改，与 `deploy/.env` 对齐）：

```sql
CREATE USER cms WITH PASSWORD '<from GitHub Environment production>';
CREATE DATABASE cms OWNER cms;
GRANT ALL PRIVILEGES ON DATABASE cms TO cms;
```

Strapi 容器使用 `network_mode: host`，因此 `DATABASE_HOST=127.0.0.1` 即可到达只听 loopback 的 1Panel Postgres。

## Vercel Admin

1. 将本仓库连到 Vercel 项目，Framework Preset 留空，Output Directory 为 `dist/build`。
2. 只配置公开构建变量 `STRAPI_ADMIN_BACKEND_URL`（API 的稳定 HTTPS origin）。
3. 不要配置 `DATABASE_*`。`npm run build:admin` 在这些变量存在时会失败。
4. 给 Admin 一个稳定 HTTPS 自定义域名，写入 API 的 `ADMIN_ORIGIN`。
5. API origin 变化后必须重新构建 Admin。

## louis 上的 API

1. 把 `deploy/openresty/cms-api.conf` 装进 1Panel/OpenResty，换成真实 `server_name` 与证书。
2. `client_max_body_size` 保持 52m，给 50 MiB 产品上限留 multipart 余量。
3. 访问日志不要记录请求体。
4. 复制 `deploy/.env.example` 为 `deploy/.env`，从 GitHub Environment `production` 填入运行时密钥。
5. `APP_VERSION` 设为当前 Git SHA。
6. 媒体目录使用宿主机 bind mount（默认 `/opt/cms/media`）。这只保证同机容器重建，不是容灾。
7. 启动：`docker compose -f deploy/compose.yml up -d --no-build`。日常镜像拉取与 webhook 由 #10 交付。

可选的首次登录种子：`ARCHIVE_ADMIN_EMAIL` 与 `ARCHIVE_ADMIN_PASSWORD`。第一次成功登录后清掉密码。

Archive Read Contract 机器凭证：`ARCHIVE_READ_TOKEN`。用于 `GET /api/archive/v1/works/:archiveId`；不要提交生产值。

## 验证

在已部署的 HTTPS origin 上：

```powershell
$env:CMS_API_ORIGIN="https://api.example.com"
$env:CMS_ADMIN_ORIGIN="https://admin.example.com"
$env:APP_VERSION="<git-sha>"
$env:ARCHIVE_ADMIN_EMAIL="<archive-administrator-email>"
$env:ARCHIVE_ADMIN_PASSWORD="<from GitHub Environment production>"
$env:ARCHIVE_READ_TOKEN="<archive-read-machine-credential>"
$env:CMS_REQUIRE_BROWSER_SESSION="1"
npm test
```

本地生产形态（自签证书，SQLite）完整跑通同一组 seam：

```powershell
npm run test:baseline
```

检查项：

- `GET /health` 在就绪时返回 `{"status":"ok","version":"<sha>"}`。
- 停掉 1Panel PostgreSQL 或在 API 尚未连上数据库时，同一 `GET /health` 返回 `503` 且 `status=not_ready`，仍带 `version`。
- 已配置 Admin origin 的 CORS 预检带精确 `Access-Control-Allow-Origin` 与 `credentials=true`。
- 未批准 origin 没有 `Access-Control-Allow-Origin`。
- Archive Administrator 能从 Admin origin 登录；错误密码返回明确失败且不发会话 cookie。
- 刷新 cookie 为 `SameSite=None; Secure; HttpOnly`，`POST /admin/access-token` 能换新 access token。
- 失效会话返回 401/403 与明确错误。
- 真实浏览器登录后刷新页面仍保持会话。自签证书不能证明生产证书下的 cookie 存储；生产必须用受信任证书再验一次。
- Archive Administrator 可在 Admin 中创建、重新打开、修改并发布 Work；缺必填字段时发布给出校验反馈且不进入已发布读取。
- 带 `ARCHIVE_READ_TOKEN` 的 `GET /api/archive/v1/works/:archiveId` 只返回已发布 Work 的 `{ data: { archiveId, title, summary } }`；草稿与未授权请求不可读。
- Archive Administrator 可上传受支持的图片或 PDF（产品上限 50 MiB），在 Admin / 预览 URL 中查看 Media Item，并通过 Work 的 `mediaItems`（WorkMedia Relationship）关联；超限上传失败且不留下 Media Item。
- 媒体落在宿主机 `CMS_MEDIA_PATH` bind mount；本地基线通过 control `POST /restart` 验证 API 进程重建后预览仍可用。

## 发布（K4F7/cms#10）

1. 在 louis 上安装 OpenResty 站点（含独立 `location = /deploy`），访问日志使用不含 body 的格式。
2. 安装并启用 `deploy/webhook/cms-deploy-webhook.service`（监听 `127.0.0.1:9100`）。
3. 在 GitHub Environment `production` 配置：
   - `CMS_DEPLOY_WEBHOOK_URL`（例如 `https://api.example.com/deploy`）
   - `CMS_DEPLOY_WEBHOOK_SECRET`
   - 可选 `CMS_RUNTIME_ENV_JSON`（写入 VPS `deploy/.env` 的运行时密钥 JSON）
4. `main` 推送由 `.github/workflows/publish.yml` 构建并推送 `ghcr.io/k4f7/cms:<git-sha>`，再 HMAC 调用 webhook。
5. 成功响应含 `gitSha` 与 `imageDigest`；健康失败不剪枝。回滚：对同一 webhook 发送 `{ "action": "redeploy-previous" }`。
6. Vercel Admin 由 Git Integration 随同一 `main` 提交发布；Admin 回退选择上一 Vercel deployment。
