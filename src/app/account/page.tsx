'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Header } from '@/components/header';
import { accountRequest, useAuth } from '@/components/auth';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';

export default function AccountPage() {
  const { user, checked, verified, openLogin, logout } = useAuth();
  const { toast } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const signOut = async () => {
    setPending(true);
    setError('');
    try {
      await logout();
    } catch {
      setError('退出失败，请检查网络后重试');
    } finally {
      setPending(false);
    }
  };
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setError('两次输入的新密码不一致');
      return;
    }
    setPending(true);
    setError('');
    try {
      await accountRequest('password', { oldPassword, newPassword });
      setOldPassword('');
      setNewPassword('');
      setConfirmation('');
      await logout();
      toast('密码已更新，请重新登录；其他设备也已退出', 'success');
      openLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败，请稍后重试');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="min-h-screen">
      <Header />
      <main className="account-page">
        <Link href="/" className="account-back-link">
          ← 返回发现
        </Link>
        <p className="eyebrow mt-8">YOUR SPACE</p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 mb-8">我的账号</h1>
        {!checked ? (
          <div className="account-panel" role="status">
            正在读取账号…
          </div>
        ) : !user ? (
          <section className="account-panel">
            <h2 className="text-xl font-semibold">
              {verified ? '你正在以访客身份访问' : '登录你的个人账号'}
            </h2>
            <p className="text-muted mt-3 mb-6">使用邮箱注册和登录，下次打开即可继续访问。</p>
            <button className="account-submit" onClick={openLogin}>
              登录 / 注册<span aria-hidden="true">→</span>
            </button>
          </section>
        ) : (
          <div className="account-grid">
            <section className="account-panel self-start">
              <div className="account-profile-avatar">
                {(user.username || user.email || 'U')[0].toUpperCase()}
              </div>
              <h2 className="text-xl font-semibold mt-4 break-all">
                {user.username || user.email}
              </h2>
              <span className="account-role">{user.role === 'admin' ? '管理员' : '个人账号'}</span>
              <dl className="account-details">
                <dt>注册时间</dt>
                <dd>{new Date(user.createdAt).toLocaleDateString('zh-CN')}</dd>
                <dt>邮箱状态</dt>
                <dd>{user.email ? '未验证 · 用于登录' : '管理员账号'}</dd>
              </dl>
              <button className="btn-ghost w-full min-h-11" disabled={pending} onClick={signOut}>
                退出当前账号
              </button>
              <p className="account-footnote mt-4">
                观看历史、收藏和源设置目前保存在当前浏览器中，暂不支持跨设备同步。
              </p>
            </section>
            <section className="account-panel">
              <div className="flex items-center gap-3 mb-2">
                <Icon name="gear" className="w-5 h-5 text-accent" />
                <h2 className="text-xl font-semibold">登录与安全</h2>
              </div>
              <p className="text-muted text-sm mb-7">修改密码后，所有设备都需要重新登录。</p>
              <form className="account-form" onSubmit={changePassword}>
                <label className="account-field" htmlFor="current-password">
                  <span>当前密码</span>
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                  />
                </label>
                <label className="account-field" htmlFor="new-password">
                  <span>新密码</span>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    placeholder="至少 8 个字符"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </label>
                <label className="account-field" htmlFor="confirm-password">
                  <span>确认新密码</span>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
                <button className="account-submit mt-2" disabled={pending} type="submit">
                  {pending ? '正在保存…' : '更新密码'}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            </section>
          </div>
        )}
        {error && (
          <p className="account-error mt-4" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
