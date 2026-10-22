export function PasswordRecoveryHelp() {
  return (
    <details className="account-recovery">
      <summary>忘记密码？</summary>
      <p>请联系站点管理员重置密码。当前邮箱尚未验证，暂不支持邮件自助找回。</p>
      <p>如果你是服务器管理员，可通过服务器恢复工具设置新密码，无需原密码。</p>
      <a
        href="https://github.com/hotpotcloud/boxmytelevison/blob/main/docs/operations/password-recovery.md"
        target="_blank"
        rel="noreferrer"
      >
        查看管理员恢复指南 →
      </a>
    </details>
  );
}
