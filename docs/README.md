# 项目迭代文档

以可验收的功能为单位拆分迭代：需求 → 技术决策 → 任务 → 验证与发布。任务编号保持稳定，完成后记录证据，不把未验证项目标记完成。

## 2026-10：账号与界面迭代

- [需求与验收标准](iterations/001-accounts/requirements.md)
- [架构与数据设计](iterations/001-accounts/design.md)
- [任务与执行记录](iterations/001-accounts/tasks.md)
- [测试与发布手册](iterations/001-accounts/release.md)
- [SQLite 技术决策](adr/0001-sqlite-accounts.md)

范围：账号注册、账号登录、持久会话、退出与密码修改，首页和账号界面调整，持久化部署。观看历史、收藏和源配置仍保留在当前浏览器，跨设备同步另立迭代。

## UI 设计评审

- [iOS/macOS 风格设计稿 V1](design/README.md)（用户已确认，按执行标准实现）
- 最新需求：邮箱直接注册，不发送验证码；管理员使用独立账号；浅色与深色可切换。

- [UI 全站改版执行标准与验收](iterations/002-ui/README.md)

- [本地验收记录与实际页面截图](design/verification/README.md)

- [003 · 幕间 Muu：游客、播放页与账号源同步](iterations/003-muu/README.md)

- [004 · 忘记密码恢复](iterations/004-password-recovery/README.md)
- [密码恢复运维指南](operations/password-recovery.md)

- [005 · 默认点播源扩充与逐源实测](iterations/005-vod-sources/README.md)
