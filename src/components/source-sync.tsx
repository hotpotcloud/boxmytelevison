'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { useAppStore } from '@/lib/store';
import { emptySourceProfile, parseSourceProfile, type SourceProfile } from '@/lib/source-profile';

type SyncState = 'guest' | 'loading' | 'saved' | 'saving' | 'offline' | 'conflict';
const Context = createContext<{ state: SyncState; retry: () => void; loadCloud: () => void }>({
  state: 'guest',
  retry: () => {},
  loadCloud: () => {},
});
export const useSourceSync = () => useContext(Context);
function snapshot(): SourceProfile {
  const s = useAppStore.getState();
  return {
    customAPIs: s.customAPIs,
    subscriptions: s.subscriptions,
    liveSubscriptions: s.liveSubscriptions,
    selectedKeys: s.selectedKeys,
    liveSelectedUrls: s.liveSelectedUrls,
    envKeysSeen: s.envKeysSeen,
    liveEnvKeysSeen: s.liveEnvKeysSeen,
    envSubsSeen: s.envSubsSeen,
  };
}
function apply(config: SourceProfile) {
  const s = useAppStore.getState();
  useAppStore.setState(config);
  s.setEnvSources(s.envSources);
  s.setLiveEnvSources(s.liveEnvSources);
}
export function SourceSyncProvider({ children }: { children: ReactNode }) {
  const { user, checked } = useAuth();
  const [state, setState] = useState<SyncState>('guest');
  const actions = useRef({ retry: () => {}, loadCloud: () => {} });
  const guest = useRef<SourceProfile | null>(null);
  useEffect(() => {
    if (!checked) return;
    let disposed = false,
      unsubscribe = () => {},
      timer: ReturnType<typeof setTimeout> | undefined;
    let writing = false,
      revision = 0,
      dirty = false,
      blocked = false,
      serialized = '',
      initialized = false;
    const userId = user?.id;
    const cacheKey = userId ? `muu-source-profile:${userId}` : '';
    const cache = (config: SourceProfile, pending: boolean) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ config, revision, pending }));
      } catch {
        /* Storage may be unavailable. */
      }
    };
    const save = async () => {
      if (disposed || !initialized || writing || blocked || !dirty || !userId) return;
      writing = true;
      dirty = false;
      setState('saving');
      let failed = false;
      const config = snapshot();
      cache(config, true);
      try {
        const res = await fetch('/api/account/sources', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config, revision }),
        });
        const data = await res.json();
        if (disposed) return;
        if (res.status === 409) {
          blocked = true;
          dirty = true;
          setState('conflict');
          return;
        }
        if (!res.ok) throw new Error(data.error);
        revision = data.revision;
        cache(snapshot(), dirty);
        setState(dirty ? 'saving' : 'saved');
      } catch {
        failed = true;
        if (!disposed) {
          dirty = true;
          setState('offline');
        }
      } finally {
        writing = false;
      }
      if (!disposed && dirty && !blocked && !failed) {
        clearTimeout(timer);
        timer = setTimeout(() => void save(), 5000);
      }
    };
    const load = async (discard = false) => {
      if (writing || disposed || !userId) return;
      setState('loading');
      unsubscribe();
      initialized = false;
      try {
        const res = await fetch('/api/account/sources', { cache: 'no-store' });
        if (!res.ok) throw new Error('load');
        const data = await res.json();
        if (disposed) return;
        revision = data.revision;
        blocked = false;
        dirty = false;
        let config = parseSourceProfile(data.config);
        let raw: string | null = null;
        try {
          raw = localStorage.getItem(cacheKey);
        } catch {
          /* Storage may be unavailable. */
        }
        if (!discard && raw) {
          try {
            const cached = JSON.parse(raw);
            if (cached.pending) {
              config = parseSourceProfile(cached.config);
              dirty = true;
              if (cached.revision !== revision) {
                blocked = true;
                revision = cached.revision;
              }
            }
          } catch {
            /* Invalid cache is ignored. */
          }
        }
        apply(config);
        serialized = JSON.stringify(snapshot());
        initialized = true;
        cache(snapshot(), dirty);
        setState(blocked ? 'conflict' : dirty ? 'saving' : 'saved');
        unsubscribe = useAppStore.subscribe(() => {
          const next = JSON.stringify(snapshot());
          if (next === serialized) return;
          serialized = next;
          dirty = true;
          cache(snapshot(), true);
          if (!blocked) {
            setState('saving');
            clearTimeout(timer);
            timer = setTimeout(() => void save(), 600);
          }
        });
        if (dirty && !blocked) void save();
      } catch {
        if (disposed) return;
        // Offline cache belongs to this account only; never fall back to another account's current store.
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const cached = JSON.parse(raw);
            apply(parseSourceProfile(cached.config));
            revision = Number.isSafeInteger(cached.revision) ? cached.revision : 0;
          }
        } catch {
          /* Keep defaults. */
        }
        serialized = JSON.stringify(snapshot());
        unsubscribe = useAppStore.subscribe(() => {
          const next = JSON.stringify(snapshot());
          if (next === serialized) return;
          serialized = next;
          dirty = true;
          cache(snapshot(), true);
        });
        setState('offline');
      }
    };
    const start = () => {
      if (disposed) return;
      if (!guest.current) {
        try {
          const previousOwner = localStorage.getItem('muu-source-owner');
          const savedGuest = localStorage.getItem('muu-guest-sources');
          guest.current = previousOwner
            ? savedGuest
              ? parseSourceProfile(JSON.parse(savedGuest))
              : emptySourceProfile()
            : snapshot();
        } catch {
          guest.current = emptySourceProfile();
        }
      }
      try {
        localStorage.setItem('muu-guest-sources', JSON.stringify(guest.current));
        if (userId) localStorage.setItem('muu-source-owner', userId);
        else localStorage.removeItem('muu-source-owner');
      } catch {
        /* Privacy mode. */
      }
      if (!userId) {
        apply(guest.current);
        setState('guest');
        actions.current = { retry: () => {}, loadCloud: () => {} };
        return;
      }
      apply(emptySourceProfile());
      setState('loading');
      actions.current = {
        retry: () => {
          if (initialized && dirty && !blocked) void save();
          else void load();
        },
        loadCloud: () => void load(true),
      };
      void load();
    };
    if (useAppStore.persist.hasHydrated()) start();
    else unsubscribe = useAppStore.persist.onFinishHydration(start);
    const refresh = () => {
      if (initialized && !dirty && !writing) void load();
    };
    const interval = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      disposed = true;
      unsubscribe();
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      if (!userId) {
        guest.current = snapshot();
        try {
          localStorage.setItem('muu-guest-sources', JSON.stringify(guest.current));
        } catch {
          /* Privacy mode. */
        }
      }
    };
    // A sync lifecycle belongs to a single account identity.
  }, [checked, user?.id]);
  return (
    <Context.Provider
      value={{
        state,
        retry: () => actions.current.retry(),
        loadCloud: () => actions.current.loadCloud(),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function SourceSyncStatus() {
  const { state, retry, loadCloud } = useSourceSync();
  const labels: Record<SyncState, string> = {
    guest: '游客新增源仅保存在本机；登录后使用账号个人源。',
    loading: '正在恢复账号个人源…',
    saving: '正在保存个人源…',
    saved: '个人源已同步到账号，默认源由站点统一提供。',
    offline: '源同步暂不可用，待同步内容保留在本机。',
    conflict: '另一台设备更新了源配置，本机修改已保留，尚未覆盖云端。',
  };
  return (
    <div className="source-sync-status" role="status">
      <p>{labels[state]}</p>
      {state === 'offline' && (
        <button className="btn-ghost btn-sm" onClick={retry}>
          重试同步
        </button>
      )}
      {state === 'conflict' && (
        <>
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              if (window.confirm('载入云端版本将替换本机尚未同步的修改，是否继续？')) loadCloud();
            }}
          >
            载入云端版本
          </button>
          <p className="text-xs">可先在「数据」中导出本机配置备份。</p>
        </>
      )}
    </div>
  );
}
