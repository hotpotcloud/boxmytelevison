# 幕间 · Muu

基于 [LibreTV](https://github.com/LibreSpark/LibreTV) 改造的开源影视聚合搜索与观看平台。采用 Next.js 15、React 19、TypeScript、Tailwind CSS，播放器使用 ArtPlayer + hls.js，账号存储使用 Node.js 内置 SQLite。

当前版本 **2.21.5**，版本号以 [package.json](package.json) 为准；部署后可通过 `/api/status` 的 `version` 字段核对。

## 功能

- **聚合搜索**：多点播源并行搜索，同名影片合并展示，支持筛选、分组和分页，个别源失败不影响其他结果。
- **首页发现**：豆瓣电影/剧集、Bangumi 放送表及影视热榜，支持分类、排序和分页。
- **播放与选集**：HLS 播放、分组选集、自动连播、倍速、快捷键、移动端长按加速，以及换源、分片缓存和本集下载。
- **播放页推荐**：侧栏同时提供当前影片选集和其他影片推荐；根据类型、地区选择榜单，排除当前片名并去重，支持“相关推荐”“热门发现”和“换一批”。点击推荐进入站内搜索选源，推荐加载失败不会阻断播放。
- **直播 / IPTV**：M3U 订阅、频道分组与搜索、HLS / HTTP-FLV 播放、XMLTV 节目单、频道收藏及播放列表导出。
- **邮箱账号**：注册、登录、最长 90 天持久会话、密码修改及退出撤销；管理员账号首次启动时按部署机密初始化。
- **个人源同步**：默认源由站点统一提供，登录用户新增的点播源、直播订阅及相关选择随账号同步，支持跨设备恢复。
- **界面与移动端**：iOS/macOS 风格、浅色/深色/跟随系统主题、响应式导航与 PWA。手机推荐双列、平板三列；手机和平板关闭自动悬浮播放器，避免遮挡推荐与选集。

推荐依赖第三方榜单，可能限流或不可用；推荐出现不代表点播源一定收录该影片。

## 游客与账号

| 能力                       | 游客               | 登录用户                      |
| -------------------------- | ------------------ | ----------------------------- |
| 浏览、搜索、观看点播与直播 | 支持，无需访问密码 | 支持                          |
| 观看历史与续播进度         | 不保存             | 保存在当前浏览器              |
| 影片与频道收藏             | 不可用             | 保存在当前浏览器              |
| 自定义源与订阅             | 保存在本机         | 随账号同步至服务器            |
| 修改账号密码               | —                  | 在“个人账号 → 登录与安全”修改 |

SQLite 保存注册账号、会话和个人源配置；**观看历史、续播进度和收藏尚未跨设备同步**。

邮箱目前仅作为登录标识，未接入邮件验证或邮件自助找回。忘记密码请联系管理员，服务器恢复步骤见[密码恢复指南](docs/operations/password-recovery.md)。初始化密码仅用于首次创建管理员，重新部署不会覆盖已修改的密码。

## 快速开始

需要 **Node.js 22.13+，且低于 23**，与项目 `engines` 保持一致。

```bash
npm ci
npm run dev
```

打开 `http://localhost:8080`。默认允许邮箱注册；如需调整配置，在项目根目录创建 `.env.local`，变量见下表。管理员初始化密码不要写入代码或提交到仓库。

本地生产模式验证：

```bash
npm run build
npm start
```

开发服务与构建使用同一个 `.next` 目录，运行构建前先停止开发服务。

## 腾讯云部署（无 Docker）

当前方案为 **GitHub Actions + SSH / rsync + standalone + systemd**，面向现有 2GB 内存 Linux x86_64 服务器。

1. CI 安装依赖、执行类型检查和测试，再构建 standalone 应用；应用不在服务器上编译。
2. 仅通过 SSH 上传应用包，**不打包 Node 二进制、node_modules 或数据库**；传输支持断点续传及校验。
3. 服务器下载或复用 Node，安装生产依赖，按锁文件与 Node ABI 缓存。
4. 数据库存放在发布目录之外，更新前创建一致性备份，通过 systemd 切换应用并执行健康与账号集成检查；失败时恢复旧服务配置。

相关文件：[部署工作流](.github/workflows/deploy.yml)、[服务器部署脚本](deploy/deploy.sh)、[发布与恢复说明](docs/iterations/001-accounts/release.md)。

### GitHub Actions 配置

在仓库的 Actions Secrets 中设置：

| Secret                     | 用途                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `SSH_HOST`                 | 服务器地址                                                           |
| `SSH_USER`                 | SSH 用户；需要 root 或免交互 sudo 权限                               |
| `SSH_PRIVATE_KEY`          | 部署私钥                                                             |
| `SSH_KNOWN_HOSTS`          | 服务器主机公钥记录，建议配置                                         |
| `APP_PASSWORD`             | 兼容访问会话所用的服务端密码；现有部署流程要求配置，游客观看无需输入 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 首次初始化管理员的密码，当前工作流管理员名为 `xbf`                   |

服务器需具备 curl、sha256sum、tar、xz、rsync 和 systemd。预置源等非机密配置由 [deploy/server.env](deploy/server.env) 提供。

### 服务器目录与运维

| 项目         | 当前路径或名称                             |
| ------------ | ------------------------------------------ |
| 应用目录     | `/opt/boxmytelevison`                      |
| 账号数据库   | `/opt/boxmytelevison/data/accounts.sqlite` |
| systemd 服务 | `boxmytelevison`                           |
| HTTP 端口    | `8080`                                     |

```bash
sudo systemctl status boxmytelevison
sudo journalctl -u boxmytelevison -n 100 --no-pager
curl -fsS http://127.0.0.1:8080/api/status
```

发布不能覆盖 `data` 和备份目录。数据库采用 WAL；备份与恢复操作遵循[发布手册](docs/iterations/001-accounts/release.md)，不要在服务运行中直接覆盖数据库文件。

## 主要环境变量

| 变量                                 | 说明                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `DATABASE_PATH`                      | SQLite 路径；本地默认 `data/accounts.sqlite`，生产固定在发布目录之外               |
| `REGISTRATION_MODE`                  | `open` / `closed`，默认 `open`；关闭注册后已有账号仍可登录                         |
| `BOOTSTRAP_ADMIN_USERNAME`           | 管理员初始化用户名，默认 `xbf`                                                     |
| `BOOTSTRAP_ADMIN_PASSWORD`           | 管理员初始化密码，仅在账号不存在时使用                                             |
| `PASSWORD`                           | 兼容原访问会话，不作为邮箱账号密码或游客观看门槛                                   |
| `PROXY_SECRET`                       | 兼容会话/代理签名密钥，可显式配置                                                  |
| `COOKIE_SECURE`                      | `true` / `false`，默认按请求协议推导；HTTPS 反向代理应正确传递 `x-forwarded-proto` |
| `DEFAULT_SOURCES`                    | 默认点播源 JSON 数组，格式见下方示例                                               |
| `DEFAULT_LIVE_SOURCES`               | 默认直播源 JSON 数组，可包含 `name`、`url`、`epg`                                  |
| `DEFAULT_SUBSCRIPTIONS`              | 默认数据源订阅地址 JSON 数组                                                       |
| `DEFAULT_RECOMMEND_SOURCE`           | 首页推荐默认来源：`douban` / `bangumi` / `hot-list`；用户主动选择优先              |
| `DEFAULT_IMAGE_MODE`                 | 默认封面加载方式：`direct` / `proxy`                                               |
| `60S_API_BASE`                       | 影视热榜使用的 60s API 实例地址                                                    |
| `REQUEST_TIMEOUT` / `MAX_RETRIES`    | 上游请求超时及重试配置                                                             |
| `SEARCH_MAX_PAGES`                   | 单个搜索源最多请求页数，默认 5，范围 1–50                                          |
| `SEARCH_SOURCE_TIMEOUT_MS`           | 单源搜索总超时，默认 10000ms，范围 3000–60000ms                                    |
| `USER_AGENT` / `FALLBACK_CORS_PROXY` | 上游请求 UA / 豆瓣数据请求的备用代理                                               |
| `LIVE_ALLOW_PRIVATE`                 | 设为 `1` 允许自建内网 IPTV，默认关闭                                               |

HTTP / HTTPS Cookie 行为由实际配置和请求协议决定，当前版本不再要求必须用 HTTPS 才能登录。

## 数据源与使用

1. 在“源管理与设置”中管理点播源、直播源和订阅；部署者预置的默认源与个人新增源分开管理。
2. 点播源使用 Apple CMS JSON 接口，勾选后搜索片名，选择来源与剧集进入播放页。
3. 直播源填写 M3U 播放列表地址，可附加 XMLTV 节目单地址。
4. 数据源订阅支持 LibreTV-SourceList JSON，以及 TVBOX 配置中可直接使用的 JSON 接口和 M3U 列表；需要 Spider 引擎的条目不导入。
5. 登录用户的个人源配置自动同步；观看历史和收藏仍限当前浏览器。

订阅格式示例（也可将 `sources` 数组用于 `DEFAULT_SOURCES`）：

```json
{
  "name": "我的源列表",
  "version": 2,
  "sources": [
    { "name": "示例点播源", "url": "https://example.com/api.php/provide/vod" }
  ],
  "liveSources": [
    {
      "name": "示例直播源",
      "url": "https://example.com/list.m3u",
      "epg": "https://example.com/epg.xml.gz"
    }
  ]
}
```

地址仅为格式示例。当前部署预置 11 个点播源，添加前的连通与播放验证见[点播源验收记录](docs/iterations/005-vod-sources/README.md)，第三方源的后续可用性可能变化。点播源和订阅请求经过公网地址校验，内网直播仅在显式配置后放行。

## 开发与发布

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

2.21.5 的验收记录为 43 个测试文件、502 项测试通过，并完成桌面、平板、手机及公网推荐交互验证。

版本号维护在 `package.json` 与 `package-lock.json`。推送 `main` 会触发腾讯云部署，也可手动触发 Actions；仅修改 `README.md` 或 `docs/**` 不触发服务更新。当前部署流程不依赖镜像发布或 Git tag。

## 文档

- [迭代文档与执行标准总览](docs/README.md)
- [账号需求与验收](docs/iterations/001-accounts/requirements.md)
- [UI 改版执行标准](docs/iterations/002-ui/README.md)
- [游客模式、播放布局与个人源同步](docs/iterations/003-muu/README.md)
- [密码恢复运维指南](docs/operations/password-recovery.md)
- [默认点播源实测](docs/iterations/005-vod-sources/README.md)
- [播放页推荐与移动端适配、验收截图](docs/iterations/006-watch-recommendations/README.md)

## 开源与内容说明

本项目基于 LibreSpark / LibreTV，保留上游署名，采用 [AGPL-3.0](LICENSE) 开源许可；修改、分发及提供网络服务时应遵守许可证要求。

项目提供第三方接口的聚合、解析与播放能力，不制作或托管视频内容。默认源由部署者配置，第三方内容及其可用性由对应数据源提供。
