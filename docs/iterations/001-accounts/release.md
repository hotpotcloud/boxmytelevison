# 测试与发布

## 配置

| 变量 | 默认 / 生产值 | 说明 |
| --- | --- | --- |
| DATABASE_PATH | 本地 data/accounts.sqlite | 生产固定为 /opt/boxmytelevison/data/accounts.sqlite |
| REGISTRATION_MODE | open | open / closed |
| PASSWORD | 已有部署密码 | 兼容访客访问，不用于邮箱注册 |
| BOOTSTRAP_ADMIN_USERNAME | xbf | 仅在管理员不存在时初始化 |
| BOOTSTRAP_ADMIN_PASSWORD | GitHub Actions Secret | 初始管理员密码；不写入代码，也不覆盖已修改密码 |
| COOKIE_SECURE | 按请求协议 | HTTPS 反向代理正确传递 x-forwarded-proto；必要时设 true |

Node.js 最低 22.13。数据库目录不能放进 public、.next 或 releases 子目录。部署时仅更新应用，不能覆盖 data 和 backups。

## 发布顺序

1. 本地运行账号测试、原有测试、类型检查与构建。
2. 通过 SSH + rsync 上传应用包；60 秒无 I/O 即终止重试，保留部分文件并校验断点续传，最终再核对 SHA-256 与 gzip 完整性。Node 在服务器安装或复用；应用包不包含 node_modules，生产依赖由服务器从国内 npm 镜像安装，按锁文件 SHA-256 和 Node ABI 缓存，不在服务器编译应用。
3. 若已有数据库，部署前执行 `VACUUM INTO` 生成一致性备份。
4. 新应用首次访问时执行幂等迁移；启动失败恢复旧服务配置，数据库备份保留。
5. 验证 /api/status、账号注册/登录/退出、未认证请求拦截。

## 回滚与恢复

本轮为新增表，不修改旧功能的数据。旧代码可直接回滚，新增数据库文件保留。恢复数据库时先停服务，保留当前数据库以及 -wal / -shm 文件的完整副本，再用一致性备份恢复；确保服务停止后清理旧 WAL/SHM，最后重启。不要在运行中直接覆盖数据库文件。

## 验证记录

本地 485 项测试、类型检查、ESLint、生产构建和桌面/手机交互验证通过。公网部署结果待 CI 完成后补充。公网当前使用 HTTP；本轮不自动变更域名、证书或腾讯云安全组。
