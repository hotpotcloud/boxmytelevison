# 技术与交互设计

## 数据

`users`：用户 ID、规范化邮箱（唯一）、可选管理员登录名（唯一）、用户角色、scrypt 密码摘要、创建时间。`sessions`：令牌摘要、用户 ID 外键、创建时间、过期时间。`schema_migrations`：已执行的迁移编号。

数据库默认 `data/accounts.sqlite`，生产为 `/opt/boxmytelevison/data/accounts.sqlite`，由 `DATABASE_PATH` 指定。仅在请求实际访问账号数据时初始化，不在构建期创建数据库。WAL 与 busy_timeout 限制写锁等待；不缓存会话查询结果，撤销立即生效。

## 接口

| 方法与路径 | 行为 |
| --- | --- |
| POST /api/account/register | 注册并建立会话 |
| POST /api/account/login | 账号密码登录 |
| GET /api/account/me | 当前账号资料 |
| POST /api/account/password | 验证旧密码、更新密码并撤销所有会话 |
| DELETE /api/auth | 撤销当前账号会话并清理两种 Cookie |
| GET /api/status | 当前认证状态、账号摘要、开放或关闭注册策略；不返回密码或令牌 |

新增 `ltv_account` Cookie，与旧 `ltv_session` 分开。所有受保护接口允许账号会话或原有访问密码会话。注册、登录和改密进行同源检查、请求大小检查、IP 限流；异步 scrypt 限制并发，避免小服务器被密码派生请求耗尽内存。账号登录不依赖邀请码和原有访问密码是否变化。

Cookie：HttpOnly、SameSite=Lax，Secure 根据实际协议或 COOKIE_SECURE 配置。状态和账号响应禁止缓存。新账号会话成功签发时清除旧访客 Cookie，避免退出后仍以访客身份访问。

## UI

最新界面方向以 [UI 设计稿](../../design/README.md) 为准，已获用户确认，按 UI 执行标准实现。

使用现有语义色 token。iOS/macOS 风格，保留浅色模式；首页用明确的主标题、说明和搜索操作，导航补充品牌与账号入口。登录注册共享弹窗，提供账号登录/注册/访问密码入口；注册清楚说明邮箱登录标识与密码保存要求。表单提供可见 label、错误关联、焦点管理与键盘关闭。

账号页显示邮箱或管理员登录名、创建时间、会话说明、改密与退出入口；不显示数据库细节。观看历史仍在当前浏览器的说明放在账号页，避免让用户误以为已支持跨设备同步。
