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

## 本地基线

```powershell
npm install
npm run test:baseline
```

这会拉起生产形态的分离 origin（预构建 Admin + TLS 代理 API），并检查公开健康检查与 Admin→API 登录。生产配置与验证步骤见 [docs/production-baseline.md](docs/production-baseline.md)。

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

## Issues

| 本仓库 | 原 `memebot` | 说明 |
| --- | --- | --- |
| [#1](https://github.com/K4F7/cms/issues/1) | #62 | 研究：Admin / API 分离边界 |
| [#2](https://github.com/K4F7/cms/issues/2) | #63 | VPS 运行与持久化约束 |
| [#3](https://github.com/K4F7/cms/issues/3) | #64 | 首版拓扑决策 |
| [#4](https://github.com/K4F7/cms/issues/4) | #65 | 仓库与 CI/CD 契约 |
| [#5](https://github.com/K4F7/cms/issues/5) | #69 | 跨域 Admin 与本地上传原型 |
| [#6](https://github.com/K4F7/cms/issues/6) | #75 | 首版运行链路规格 |
| [#7](https://github.com/K4F7/cms/issues/7) | #79 | 可登录生产基线 |
| [#8](https://github.com/K4F7/cms/issues/8) | #81 | Work 草稿、修改与发布 |
| [#9](https://github.com/K4F7/cms/issues/9) | #82 | Media Item 上传与关联 |
| [#10](https://github.com/K4F7/cms/issues/10) | #83 | GHCR webhook 发布 |
| [#11](https://github.com/K4F7/cms/issues/11) | #84 | 首版生产形态验收 |

留在 `memebot` 的相关票：[#61](https://github.com/K4F7/memebot/issues/61) 总地图，[#70](https://github.com/K4F7/memebot/issues/70) Koishi 只读适配，[#76](https://github.com/K4F7/memebot/issues/76) Yakumo / 插件发布。
