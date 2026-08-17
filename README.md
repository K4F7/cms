# cms

MemeBot Archive 的独立 Strapi 5 内容平台。本仓库不是 Koishi 插件仓库。

Archive Administrator 在这里录入、修改、发布 Work，并上传、预览 Media Item。
Koishi 主线 `K4F7/memebot` 只保留 QQ 读取插件；Archive Read Contract 尚未绑定。

## 首版拓扑

```text
Vercel: 预构建 Strapi Admin
              |
              | HTTPS + credentialed CORS
              v
VPS louis: OpenResty → Strapi API / 认证 / 本地上传
           现有 1Panel PostgreSQL（独立 database 与 user）
           宿主机媒体 bind mount
```

每次 `main` 推送两端都发：Vercel Git Integration 发布 Admin；GitHub Actions
构建 `ghcr.io/k4f7/cms:<git-sha>`，再通过带时间戳的 HMAC webhook 让 VPS
拉取镜像并重建容器。健康检查通过后才算发布成功。

## 边界

- 单应用树：标准 Strapi 5 根目录（`config/`、`src/`）加 `deploy/compose.yml`。
- Vercel 只托管 Admin 静态资源，不跑 API、不连数据库、不存媒体。
- 不在 VPS 上构建镜像，不增加第二套 PostgreSQL，不用 SSH 或 Watchtower 做日常发布。
- 产品文件上限 50 MiB。同机容器重建可保留数据库和媒体；这不是容灾。
- 不把 Koishi 插件、Payload 运行时或公开作品站放进本仓库。

领域词汇沿用 `K4F7/memebot` 的 `CONTEXT.md`：Work、Media Item、WorkMedia
Relationship、Archive Administrator、Archive Read Contract。

规格与决策见本仓库 Issues。Koishi 插件验证、Yakumo、以及 QQ 只读适配仍在
[`K4F7/memebot`](https://github.com/K4F7/memebot)。
