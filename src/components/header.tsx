'use client';
import Link from 'next/link';
import { Brand } from './brand';
import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useAuth } from './auth';
import { ThemeToggle } from './theme';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';
import { Icon, type IconName } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { useToast } from './toast';

const BROWSE: { label: string; href: string; icon: IconName; category?: string }[] = [
  { label: '发现', href: '/', icon: 'compass' },
  { label: '电影', href: '/?category=movie', icon: 'film', category: 'movie' },
  { label: '剧集', href: '/?category=tv', icon: 'tv', category: 'tv' },
  { label: '直播', href: '/live', icon: 'broadcast' },
];
export function Header({ showSearch = false }: { showSearch?: boolean }) {
  return (
    <Suspense fallback={<div className="h-16" />}>
      <HeaderContent showSearch={showSearch} />
    </Suspense>
  );
}
function HeaderContent({ showSearch }: { showSearch: boolean }) {
  const { user, verified, openLogin, logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const category = params.get('category') || 'all';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const history = useSearchHistory(query);
  const submit = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    history.close();
    history.record(q);
    router.push(`/?s=${encodeURIComponent(q)}`);
  };
  const active = (item: (typeof BROWSE)[number]) =>
    item.href === '/live'
      ? pathname === '/live'
      : pathname === '/' && !params.get('s') && (item.category || 'all') === category;
  const name = user?.username || user?.email?.split('@')[0] || '我的账号';
  return (
    <>
      <aside className="app-sidebar" aria-label="主导航">
        <Link href="/" className="app-brand">
          <Brand />
        </Link>
        <div className="sidebar-section-label">探索内容</div>
        <nav className="sidebar-group">
          {BROWSE.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`sidebar-link ${active(item) ? 'is-active' : ''}`}
              aria-current={active(item) ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-section-label">个人资料库</div>
        <nav className="sidebar-group">
          <button className="sidebar-link" onClick={() => setHistoryOpen(true)}>
            <Icon name="clock" />
            观看历史
          </button>
          <Link
            className={`sidebar-link ${pathname === '/favorites' ? 'is-active' : ''}`}
            href="/favorites"
          >
            <Icon name="heart" />
            我的收藏
          </Link>
          <Link
            className={`sidebar-link ${pathname === '/account' ? 'is-active' : ''}`}
            href="/account"
          >
            <Icon name="user" />
            个人账号
          </Link>
        </nav>
        <div className="sidebar-account-card">
          <Icon name="user" className="w-5 h-5" />
          <div>
            <strong>{user ? name : '自由观看，无需登录'}</strong>
            <p>{user ? '个人源随账号同步' : '登录可使用收藏与历史'}</p>
          </div>
          {!user && (
            <button className="btn-ghost btn-sm" onClick={openLogin}>
              登录 / 注册
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-rule" />
          <button className="sidebar-link" onClick={() => setSettingsOpen(true)}>
            <Icon name="database" />
            源管理与设置
          </button>
          <button className="sidebar-link" onClick={requestShowDownloadManager}>
            <Icon name="download" />
            下载管理
          </button>
          <Link className="sidebar-link" href="/about">
            <Icon name="info" />
            关于幕间
          </Link>
          <p className="sidebar-caption">好故事，随时开场。</p>
        </div>
      </aside>
      <header className="site-toolbar">
        <div className="toolbar-inner">
          <Link href="/" className="mobile-brand" aria-label="幕间首页">
            <Brand />
          </Link>
          <div className="toolbar-breadcrumb">
            <Icon
              name={
                pathname === '/live' ? 'broadcast' : pathname === '/account' ? 'user' : 'compass'
              }
              className="w-4 h-4"
            />
            <span>
              {pathname === '/live'
                ? '直播'
                : pathname === '/account'
                  ? '我的账号'
                  : pathname === '/favorites'
                    ? '我的收藏'
                    : params.get('s')
                      ? '搜索'
                      : category === 'movie'
                        ? '电影'
                        : category === 'tv'
                          ? '剧集'
                          : '发现'}
            </span>
          </div>
          <form
            className={`toolbar-search ${showSearch ? 'with-search' : ''}`}
            onSubmit={(event) => {
              event.preventDefault();
              submit(query);
            }}
          >
            <div ref={history.containerRef} className="relative">
              <Icon name="search" className="toolbar-search-icon" />
              <input
                aria-label="全局搜索影片"
                placeholder="搜索影片、剧集，发现你的下一部"
                maxLength={100}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  history.resetActive();
                }}
                onFocus={history.onFocus}
                onKeyDown={(event) =>
                  history.onKeyDown(event, (text) => {
                    setQuery(text);
                    submit(text);
                  })
                }
                role="combobox"
                aria-expanded={history.visible}
                aria-controls="toolbar-history"
                aria-autocomplete="list"
                aria-activedescendant={
                  history.visible && history.activeIndex >= 0
                    ? `toolbar-history-${history.activeIndex}`
                    : undefined
                }
              />
              {history.visible && (
                <SearchHistoryDropdown
                  id="toolbar-history"
                  matches={history.matches}
                  activeIndex={history.activeIndex}
                  onPick={submit}
                  onRemove={history.remove}
                  onClearAll={history.clearAll}
                />
              )}
            </div>
          </form>
          <div className="toolbar-actions">
            <ThemeToggle />
            <Menu.Root>
              <Menu.Trigger asChild>
                <button className="toolbar-icon mobile-settings" aria-label="更多功能">
                  <Icon name="gear" />
                </button>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className="app-menu" align="end" sideOffset={10}>
                  <Menu.Label className="menu-label">常用功能</Menu.Label>
                  <Menu.Item className="menu-item" onSelect={() => setHistoryOpen(true)}>
                    <Icon name="clock" />
                    观看历史
                  </Menu.Item>
                  <Menu.Item className="menu-item" onSelect={() => router.push('/favorites')}>
                    <Icon name="heart" />
                    我的收藏
                  </Menu.Item>
                  <Menu.Item className="menu-item" onSelect={requestShowDownloadManager}>
                    <Icon name="download" />
                    下载管理
                  </Menu.Item>
                  <Menu.Separator className="menu-separator" />
                  <Menu.Item className="menu-item" onSelect={() => setSettingsOpen(true)}>
                    <Icon name="gear" />
                    源管理与设置
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
            {user ? (
              <Menu.Root>
                <Menu.Trigger asChild>
                  <button className="account-nav" aria-label="打开账号菜单">
                    <span className="account-avatar">{name[0].toUpperCase()}</span>
                    <span className="account-name">{name}</span>
                    <Icon name="chevronDown" className="w-3 h-3 account-name" />
                  </button>
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content className="app-menu" align="end" sideOffset={10}>
                    <Menu.Label className="menu-label">
                      {user.role === 'admin' ? '管理员' : '个人账号'}
                      <span>{user.email || user.username}</span>
                    </Menu.Label>
                    <Menu.Separator className="menu-separator" />
                    <Menu.Item className="menu-item" onSelect={() => router.push('/account')}>
                      <Icon name="user" />
                      账号与安全
                    </Menu.Item>
                    <Menu.Item className="menu-item" onSelect={() => router.push('/favorites')}>
                      <Icon name="heart" />
                      我的收藏
                    </Menu.Item>
                    <Menu.Separator className="menu-separator" />
                    <Menu.Item
                      className="menu-item text-danger"
                      onSelect={() => {
                        void logout().catch(() => toast('退出失败，请稍后重试', 'error'));
                      }}
                    >
                      退出登录
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
            ) : (
              <button className="account-nav" onClick={openLogin}>
                <Icon name="user" className="w-4 h-4" />
                <span>{verified ? '登录账号' : '登录'}</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <nav className="mobile-tabbar" aria-label="移动端主导航">
        <Link href="/" aria-current={active(BROWSE[0]) ? 'page' : undefined}>
          <Icon name="compass" />
          <span>发现</span>
        </Link>
        <Link
          href="/?category=movie"
          aria-current={category !== 'all' && pathname === '/' ? 'page' : undefined}
        >
          <Icon name="film" />
          <span>分类</span>
        </Link>
        <Link href="/live" aria-current={pathname === '/live' ? 'page' : undefined}>
          <Icon name="broadcast" />
          <span>直播</span>
        </Link>
        <Link href="/account" aria-current={pathname === '/account' ? 'page' : undefined}>
          <Icon name="user" />
          <span>我的</span>
        </Link>
      </nav>
      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
