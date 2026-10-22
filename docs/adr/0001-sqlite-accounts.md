# ADR-0001：用 SQLite 保存用户与会话

- 状态：采用
- 日期：2026-10-22
- 约束：腾讯云 2G 内存、单实例 Node.js + systemd、不使用 Docker。

## 决策

使用 Node.js 22.13+ 内置 `node:sqlite`，不新增数据库进程或原生 npm 扩展。数据库采用 WAL、外键与有限锁等待，账户数据存于发布目录以外。Node 22 的此模块仍标记为 experimental，需要在后续 Node 升级时运行回归测试。

密码用随机盐和异步 scrypt 派生，不存明文。会话使用 32 字节随机令牌，数据库只存 SHA-256 摘要；HttpOnly Cookie 保存令牌。记住登录有效期 90 天，不勾选时为浏览器会话 Cookie、服务端最长 24 小时。退出、改密会撤销服务端会话。

注册策略可配置 `open` / `closed`，默认 `open`：邮箱与密码直接注册，不发送邮件验证码，不声称已验证邮箱归属。普通用户使用邮箱登录，管理员通过部署机密初始化独立登录名；账号登录不再要求访问密码。兼容原有访问密码登录，避免上线时阻断已有用户。旧会话有效期沿用旧实现。

## 替代方案

- MySQL/PostgreSQL：本轮没有多实例或复杂关系需求，独立服务增加运维和内存开销。
- Redis：不能替代用户主数据库，本轮不引入。
- better-sqlite3：可行，但需处理平台和 Node 原生 ABI；内置模块减少构建和部署依赖。

## 限制

SQLite 适合当前单机少量账号读写，不适合共享网络磁盘上的多机部署。当前站点是 HTTP，持久 Cookie 可用，但账号凭据缺少传输加密；正式公开注册前应配置域名与 HTTPS。备份必须使用 SQLite backup/VACUUM INTO 或停服后复制整个数据库，不能只在线复制主文件而忽略 WAL。

参考：[Node 22 SQLite 文档](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)。
