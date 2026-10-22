import type { SourceConfig } from './types';
import type { SourceSubscription, LiveSubscription } from './store';
export interface SourceProfile {
  customAPIs: SourceConfig[];
  subscriptions: SourceSubscription[];
  liveSubscriptions: LiveSubscription[];
  selectedKeys: string[];
  liveSelectedUrls: string[];
  envKeysSeen: string[];
  liveEnvKeysSeen: string[];
  envSubsSeen: string[];
}
export const emptySourceProfile = (): SourceProfile => ({
  customAPIs: [],
  subscriptions: [],
  liveSubscriptions: [],
  selectedKeys: [],
  liveSelectedUrls: [],
  envKeysSeen: [],
  liveEnvKeysSeen: [],
  envSubsSeen: [],
});
/** Stored URLs are inert configuration; actual fetches retain their SSRF checks. */
export function parseSourceProfile(raw: unknown): SourceProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('源配置格式错误');
  const o = raw as Record<string, unknown>;
  const text = (v: unknown, max = 2048): string => {
    if (typeof v !== 'string' || v.length > max) throw new Error('源配置字段无效');
    return v;
  };
  const url = (v: unknown) => {
    const s = text(v);
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw new Error('源地址无效');
    }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
      throw new Error('源地址仅支持 HTTP(S)');
    return s;
  };
  const list = <T>(v: unknown, fn: (x: Record<string, unknown>) => T, max = 300): T[] => {
    if (!Array.isArray(v) || v.length > max) throw new Error('源配置数量超出限制');
    return v.map((x) => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('源配置条目无效');
      return fn(x);
    });
  };
  const strings = (v: unknown, max = 1000): string[] => {
    if (!Array.isArray(v) || v.length > max) throw new Error('源配置列表无效');
    return [...new Set(v.map((x) => text(x)))];
  };
  const optionalText = (v: unknown, max = 2048) => (v === undefined ? undefined : text(v, max));
  const optionalUrl = (v: unknown) => (v === undefined || v === '' ? undefined : url(v));
  const optionalNumber = (v: unknown) => {
    if (v === undefined) return undefined;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new Error('同步时间无效');
    return v;
  };
  const result: SourceProfile = {
    customAPIs: list(o.customAPIs, (x) => ({
      key: text(x.key, 256),
      name: text(x.name, 128),
      url: url(x.url),
      detail: optionalUrl(x.detail),
      isAdult: x.isAdult === true,
    })),
    subscriptions: list(
      o.subscriptions,
      (x) => ({
        url: url(x.url),
        name: optionalText(x.name, 128),
        enabled: x.enabled !== false,
        lastSync: optionalNumber(x.lastSync),
        lastStatus: x.lastStatus === 'ok' ? 'ok' : x.lastStatus === 'error' ? 'error' : undefined,
        lastError: optionalText(x.lastError, 4096),
      }),
      100,
    ),
    liveSubscriptions: list(o.liveSubscriptions, (x) => ({
      url: url(x.url),
      name: optionalText(x.name, 128),
      epg: optionalUrl(x.epg),
      lastSync: optionalNumber(x.lastSync),
      fromSubscriptions: strings(x.fromSubscriptions ?? [], 100).map(url),
    })),
    selectedKeys: strings(o.selectedKeys),
    liveSelectedUrls: strings(o.liveSelectedUrls),
    envKeysSeen: strings(o.envKeysSeen),
    liveEnvKeysSeen: strings(o.liveEnvKeysSeen),
    envSubsSeen: strings(o.envSubsSeen, 100),
  };
  if (new Set(result.customAPIs.map((x) => x.key)).size !== result.customAPIs.length)
    throw new Error('源标识重复');
  return result;
}
