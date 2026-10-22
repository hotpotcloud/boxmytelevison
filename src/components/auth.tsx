'use client';
import * as Dialog from '@radix-ui/react-dialog';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized, STATUS_QUERY_KEY } from '@/lib/client-api';
import { applyEnvPresets } from '@/lib/subscription-sync';
import type { AccountUser, AuthStatusResponse } from '@/lib/types';
import { useToast } from './toast';
import { Icon } from './icon';

interface AuthContextValue {
  checked: boolean;
  verified: boolean;
  setupRequired: boolean;
  version: string | null;
  user: AccountUser | null;
  openLogin: () => void;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue>({
  checked: false,
  verified: false,
  setupRequired: false,
  version: null,
  user: null,
  openLogin: () => {},
  logout: async () => {},
});
export function useAuth() {
  return useContext(AuthContext);
}

/** Authentication errors stay inside forms instead of reopening the global dialog. */
export async function accountRequest(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/account/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败，请稍后重试');
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [verified, setVerified] = useState(false);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [visitorEnabled, setVisitorEnabled] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const applyStatus = useCallback((status: AuthStatusResponse) => {
    setVerified(status.verified);
    setUser(status.user || null);
    setSetupRequired(!status.passwordRequired);
    setVersion(status.version);
    setRegistrationOpen(status.registrationMode !== 'closed');
    setVisitorEnabled(status.visitorEnabled !== false);
    setChecked(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queryClient
      .fetchQuery({ queryKey: STATUS_QUERY_KEY, queryFn: () => api.status() })
      .then((status) => {
        if (cancelled) return;
        applyStatus(status);
        if (!status.verified) setModalOpen(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient, applyStatus]);
  useEffect(
    () =>
      onUnauthorized((event) => {
        setSetupRequired((event as CustomEvent).detail === 'setup');
        setVerified(false);
        setUser(null);
        setModalOpen(true);
      }),
    [],
  );

  const openLogin = useCallback(() => setModalOpen(true), []);
  const logout = useCallback(async () => {
    await api.logout();
    await queryClient.cancelQueries();
    queryClient.clear();
    setVerified(false);
    setUser(null);
    toast('已退出登录', 'info');
  }, [toast, queryClient]);
  const handleLoginSuccess = useCallback(async () => {
    const status = await api.status();
    applyStatus(status);
    queryClient.setQueryData(STATUS_QUERY_KEY, status);
    setModalOpen(false);
    void queryClient.invalidateQueries();
    toast(status.user ? '欢迎回来' : '访问验证成功', 'success');
    try {
      await applyEnvPresets(status);
    } catch {
      /* Source availability does not affect authentication. */
    }
  }, [applyStatus, queryClient, toast]);

  return (
    <AuthContext.Provider
      value={{ checked, verified, setupRequired, version, user, openLogin, logout }}
    >
      {children}
      {modalOpen && (
        <LoginModal
          setupRequired={setupRequired}
          registrationOpen={registrationOpen}
          visitorEnabled={visitorEnabled}
          onSuccess={handleLoginSuccess}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AuthContext.Provider>
  );
}

function LoginModal({
  setupRequired,
  registrationOpen,
  visitorEnabled,
  onSuccess,
  onClose,
}: {
  setupRequired: boolean;
  registrationOpen: boolean;
  visitorEnabled: boolean;
  onSuccess: () => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'visitor'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [remember, setRemember] = useState(true);
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const switchMode = (next: typeof mode) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmation('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    if (mode === 'register' && password !== confirmation) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mode === 'visitor') await api.login(password);
      else await accountRequest(mode, { identifier, email: identifier, password, remember });
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="account-backdrop" />
        <Dialog.Content
          className="account-sheet"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (loading) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (loading) event.preventDefault();
          }}
        >
          <button
            className="account-close"
            aria-label="关闭登录窗口"
            onClick={onClose}
            disabled={loading}
          >
            <Icon name="close" />
          </button>
          <div className="account-mark" aria-hidden="true">
            <Icon name="play" className="h-7 w-7" />
          </div>
          <p className="eyebrow">LIBRETV ACCOUNT</p>
          <Dialog.Title className="account-title">
            {mode === 'register' ? '创建你的账号' : mode === 'visitor' ? '访客访问' : '欢迎回来'}
          </Dialog.Title>
          <Dialog.Description className="account-description">
            {mode === 'register'
              ? '用常用邮箱注册，让好故事随时继续。'
              : mode === 'visitor'
                ? '使用站点访问密码，临时进入观影空间。'
                : '登录一次，下次打开即可继续观看。'}
          </Dialog.Description>
          {setupRequired ? (
            <p className="account-notice">站点尚未完成初始化，请联系管理员。</p>
          ) : (
            <>
              {mode !== 'visitor' && (
                <div className="account-segments" aria-label="账号操作">
                  <button
                    type="button"
                    aria-pressed={mode === 'login'}
                    onClick={() => switchMode('login')}
                    disabled={loading}
                  >
                    登录
                  </button>
                  {registrationOpen && (
                    <button
                      type="button"
                      aria-pressed={mode === 'register'}
                      onClick={() => switchMode('register')}
                      disabled={loading}
                    >
                      注册
                    </button>
                  )}
                </div>
              )}
              <form onSubmit={submit} className="account-form">
                {mode !== 'visitor' && (
                  <label className="account-field" htmlFor="auth-identifier">
                    <span>{mode === 'register' ? '邮箱地址' : '邮箱或管理员账号'}</span>
                    <input
                      ref={inputRef}
                      id="auth-identifier"
                      type={mode === 'register' ? 'email' : 'text'}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={254}
                      required
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      placeholder={mode === 'register' ? 'you@example.com' : '邮箱地址或账号'}
                      aria-describedby={error ? 'auth-error' : undefined}
                    />
                  </label>
                )}
                <label className="account-field" htmlFor="auth-password">
                  <span>{mode === 'visitor' ? '访问密码' : '密码'}</span>
                  <input
                    ref={mode === 'visitor' ? inputRef : undefined}
                    id="auth-password"
                    type={visiblePassword ? 'text' : 'password'}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    minLength={mode === 'register' ? 8 : undefined}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === 'register' ? '至少 8 个字符' : '请输入密码'}
                    aria-describedby={error ? 'auth-error' : undefined}
                  />
                </label>
                {mode === 'register' && (
                  <label className="account-field" htmlFor="auth-confirmation">
                    <span>确认密码</span>
                    <input
                      id="auth-confirmation"
                      type={visiblePassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      maxLength={128}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder="再次输入密码"
                    />
                  </label>
                )}
                <div className="account-options">
                  {mode !== 'visitor' && (
                    <label>
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                      />
                      保持登录
                    </label>
                  )}
                  <label className="ml-auto">
                    <input
                      type="checkbox"
                      checked={visiblePassword}
                      onChange={(event) => setVisiblePassword(event.target.checked)}
                    />
                    显示密码
                  </label>
                </div>
                {error && (
                  <p id="auth-error" className="account-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="account-submit" type="submit" disabled={loading}>
                  {loading
                    ? '正在处理…'
                    : mode === 'register'
                      ? '创建账号并登录'
                      : mode === 'visitor'
                        ? '验证并进入'
                        : '登录'}
                  <span aria-hidden="true">→</span>
                </button>
                {mode === 'register' && (
                  <p className="account-footnote">
                    邮箱仅用于登录，暂不支持邮件找回密码，请妥善保存密码。
                  </p>
                )}
              </form>
              {visitorEnabled && (
                <button
                  className="account-alternative"
                  onClick={() => switchMode(mode === 'visitor' ? 'login' : 'visitor')}
                  disabled={loading}
                >
                  {mode === 'visitor' ? '返回账号登录' : '使用访问密码进入'}
                </button>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
