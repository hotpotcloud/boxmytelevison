'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth';
import { Pagination } from '@/components/pagination';
import { pageNumber, pageSize } from '@/lib/pagination';
import { Header } from '@/components/header';
import { RecommendSection } from '@/components/douban-section';
import { DetailModal } from '@/components/detail-modal';
import { AggregatedCard, aggregateResults } from '@/components/video-card';
import {
  useAppStore,
  resolveSource,
  isInDisabledSubscription,
  isSourceDisabled,
} from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SearchResultItem, SourceSearchOutcome } from '@/lib/types';
import { useSearchHistory } from '@/components/search-history';
import { formatDisableTtl, validateSourceUrl } from '@/lib/utils';
import { useToast } from '@/components/toast';
import { EmptyState } from '@/components/states';
import { Icon } from '@/components/icon';
import { SiteFooter } from '@/components/site-footer';

/**
 * 首页：搜索（URL ?s= 驱动，可后退/分享）+ 豆瓣推荐。
 * 搜索状态由 React Query 管理，失败源在结果区顶部以非阻塞方式展示。
 */
/** 搜索结果分批渲染的批大小：一次挂载上千张卡片会明显掉帧 */

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const { checked: verified, openLogin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const urlQuery = searchParams.get('s') || '';
  // 精确订阅所需字段（对齐 live 页的做法）：搜索流式期间逐源写健康度、
  // 打开设置抽屉/历史面板等无关 store 变化，都不应触发首页整树重渲染
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const [input, setInput] = useState(urlQuery);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);
  /** 流式搜索中已结算的源（data 就绪前用于增量渲染） */
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL 驱动搜索：?s= 变化时回填输入框
  useEffect(() => {
    if (urlQuery) setInput(urlQuery);
  }, [urlQuery]);

  // 源名回显：失败/停用提示里显示友好名称而非裸 key
  const sourceName = (key: string) =>
    customAPIs.find((a) => a.key === key)?.name ??
    envSources.find((a) => a.key === key)?.name ??
    key;

  const selectedSources = useMemo(() => {
    // selectedKeys 可能含历史残留的重复 key：按 key 去重，避免同源重复搜索
    const seen = new Set<string>();
    return (
      selectedKeys
        .map((key) => resolveSource({ customAPIs, envSources }, key))
        .filter((s): s is NonNullable<typeof s> => {
          if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
          seen.add(s.key);
          return true;
        })
        // 自动停用期内的源不参与搜索（到期自动恢复）
        .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
        // 所属订阅被整体停用的源同样跳过（无损：各源勾选状态保留，重新启用即恢复）
        .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key))
    );
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);
  const disabledSources = useMemo(
    () => selectedKeys.filter((key) => isSourceDisabled({ sourceHealth }, key)),
    [selectedKeys, sourceHealth],
  );
  // 来自已关闭订阅的源：勾选状态还在，但本次搜索用不到，必须明确告知
  const offSubscriptionSources = useMemo(
    () =>
      selectedKeys.filter(
        (key) =>
          !isSourceDisabled({ sourceHealth }, key) &&
          isInDisabledSubscription({ subscriptions }, key),
      ),
    [selectedKeys, sourceHealth, subscriptions],
  );

  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, selectedKeys, yellowFilter],
    // 与 runSearch 的截断规则保持一致：顶栏搜索 / 手动构造长链接不会绕过上限
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        // 逐源结算即更新：结果边搜边渲染，同时滚动健康度
        onSource: (outcome) => {
          setStreamedOutcomes((prev) => [...prev, outcome]);
          for (const ev of useAppStore.getState().recordSourceHealth([outcome])) {
            toast(
              ev.permanent
                ? `「${sourceName(ev.key)}」多次失败，已停止参与搜索，可在设置中恢复`
                : `「${sourceName(ev.key)}」连续超时/失败，已停用 ${formatDisableTtl(ev.ttlMs ?? 0)}`,
              'warning',
            );
          }
        },
      });
    },
    enabled: verified && Boolean(urlQuery) && selectedSources.length > 0,
    // 5 分钟内从播放页返回时直接使用缓存，不重新搜索（服务端另有 60s 结果缓存兜底）
    staleTime: 300_000,
  });

  // 最近搜索改为搜索框下拉（聚焦展开、按输入过滤），不再常驻首屏
  const searchHistory = useSearchHistory(input);

  const runSearch = (q: string) => {
    const query = q.trim().slice(0, 100);
    if (!query) {
      toast('请输入搜索内容', 'info');
      inputRef.current?.focus();
      return;
    }
    if (selectedSources.length === 0) {
      toast('请先在设置中添加并勾选点播源', 'warning');
      return;
    }
    router.push(`/?s=${encodeURIComponent(query)}`, { scroll: false });
    searchHistory.record(query);
  };

  const isSearching = Boolean(urlQuery) && searchQuery.isFetching && !searchQuery.data;
  // 聚合数据未就绪时，用已结算源的结果增量渲染（健康源不再等坏源超时）
  const streamedList = useMemo(() => streamedOutcomes.flatMap((o) => o.list), [streamedOutcomes]);
  const list = useMemo(
    () => searchQuery.data?.list ?? (isSearching ? streamedList : []),
    [searchQuery.data, isSearching, streamedList],
  );
  const failures =
    searchQuery.data?.failures ??
    streamedOutcomes
      .filter((o) => !o.ok)
      .map((o) => ({ sourceKey: o.sourceKey, error: o.error || '请求失败', timedOut: o.timedOut }));
  // 跨源同名聚合：同名影片合并为一张卡片，展开后可选择具体来源
  const groups = useMemo(() => aggregateResults(list), [list]);

  const size = pageSize(searchParams.get('size'));
  const typeFilter = searchParams.get('type') || '';
  const yearFilter = searchParams.get('year') || '';
  const areaFilter = searchParams.get('area') || '';
  const sort = searchParams.get('sort') || 'default';
  const filteredGroups = useMemo(() => {
    const filtered = groups.filter(
      (group) =>
        (!typeFilter || group.items.some((item) => item.typeName === typeFilter)) &&
        (!yearFilter || group.year === yearFilter) &&
        (!areaFilter || group.items.some((item) => item.area === areaFilter)),
    );
    if (sort === 'title') filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    if (sort === 'year') filtered.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    return filtered;
  }, [groups, typeFilter, yearFilter, areaFilter, sort]);
  const page = Math.min(
    pageNumber(searchParams.get('page')),
    Math.max(1, Math.ceil(filteredGroups.length / size)),
  );
  const visibleGroups = filteredGroups.slice((page - 1) * size, page * size);
  const filterOptions = {
    type: [...new Set(list.map((item) => item.typeName).filter(Boolean))] as string[],
    year: [...new Set(list.map((item) => item.year).filter(Boolean))].sort().reverse() as string[],
    area: [...new Set(list.map((item) => item.area).filter(Boolean))] as string[],
  };
  const changeResults = (patch: Record<string, string>, reset = true) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (reset) next.delete('page');
    router.push('/?' + next.toString(), { scroll: false });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header showSearch />

      <main className="app-content">
        <header className="discovery-heading">
          <h1>
            {urlQuery
              ? '查找你的下一部好故事'
              : searchParams.get('category') === 'movie'
                ? '把时间，留给好电影。'
                : searchParams.get('category') === 'tv'
                  ? '好故事，不止一集。'
                  : '今天，想看点什么？'}
          </h1>
          <p>{urlQuery ? '多源聚合搜索，选择适合你的播放来源。' : '好故事，随时开场。'}</p>
        </header>
        {urlQuery && (
          <form
            className="flex gap-3 mb-6 max-w-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch(input);
            }}
          >
            <input
              ref={inputRef}
              className="input flex-1 min-w-0 min-h-11"
              aria-label="修改搜索关键词"
              maxLength={100}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className="btn-primary px-5 min-h-11" type="submit">
              <Icon name="search" className="w-4 h-4" />
              搜索
            </button>
          </form>
        )}

        {/* 搜索结果 */}
        {urlQuery && (
          <section aria-label="搜索结果" className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm text-muted">
                “<span className="text-content">{urlQuery}</span>” 的搜索结果
                {isSearching ? (
                  <span className="text-faint">
                    （已就绪 {streamedOutcomes.length}/{selectedSources.length} 个源…）
                  </span>
                ) : (
                  searchQuery.data && (
                    <span className="text-faint">
                      （{groups.length} 部影片 · {list.length} 条结果
                      {failures.length > 0 && `，${failures.length} 个源失败`}）
                    </span>
                  )
                )}
              </h2>
            </div>

            {failures.length > 0 && (
              <div className="mb-3 text-xs bg-chip rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-faint">
                  {isSearching ? '以下源暂时无响应：' : '部分点播源请求失败：'}
                </span>
                {failures.map((f) => (
                  <span key={f.sourceKey} className={f.timedOut ? 'text-warning' : 'text-faint'}>
                    {f.timedOut ? '⏱' : '✗'} {sourceName(f.sourceKey)}
                    {f.timedOut ? ' 超时' : ''}
                  </span>
                ))}
              </div>
            )}

            {disabledSources.length > 0 && (
              <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
                {disabledSources.length} 个源因连续超时/失败已暂停参与搜索（临时停用的到期自动恢复，
                长期停用的需在设置中手动恢复）：
                {disabledSources.map((key) => sourceName(key)).join('、')}
              </div>
            )}

            {offSubscriptionSources.length > 0 && (
              <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
                {offSubscriptionSources.length} 个源所属的订阅已停用，未参与本次搜索（在设置 →
                数据源订阅中可重新启用）：
                {offSubscriptionSources.map((key) => sourceName(key)).join('、')}
              </div>
            )}

            <div className="search-filters" aria-label="搜索筛选">
              {(['type', 'year', 'area'] as const).map((key) => (
                <select
                  key={key}
                  aria-label={
                    key === 'type' ? '筛选类型' : key === 'year' ? '筛选年份' : '筛选地区'
                  }
                  value={searchParams.get(key) || ''}
                  onChange={(event) => changeResults({ [key]: event.target.value })}
                >
                  <option value="">
                    {key === 'type' ? '全部类型' : key === 'year' ? '全部年份' : '全部地区'}
                  </option>
                  {filterOptions[key].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ))}
              <select
                aria-label="搜索结果排序"
                value={sort}
                onChange={(event) => changeResults({ sort: event.target.value })}
              >
                <option value="default">默认排序</option>
                <option value="year">年份从新到旧</option>
                <option value="title">按片名排序</option>
              </select>
            </div>
            {!verified ? (
              <div className="library-state">
                <h2>登录后开始搜索</h2>
                <p>用个人账号登录，或使用站点访问密码进入。</p>
                <button className="btn-primary min-h-11" onClick={openLogin}>
                  登录 / 注册
                </button>
              </div>
            ) : selectedSources.length === 0 ? (
              <NoSourceGuide hasSources={customAPIs.length > 0 || envSources.length > 0} />
            ) : filteredGroups.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                  {visibleGroups.map((group) => (
                    <AggregatedCard
                      key={group.key}
                      group={group}
                      sources={selectedSources}
                      onOpen={(item) => setDetailItem(item)}
                    />
                  ))}
                </div>
                <Pagination
                  total={filteredGroups.length}
                  page={page}
                  size={size}
                  onPage={(next) => changeResults({ page: String(next) }, false)}
                  onSize={(next) => changeResults({ size: String(next) })}
                />
              </>
            ) : isSearching ? (
              <ResultsSkeleton />
            ) : (
              <EmptyState
                icon="search"
                title={list.length ? '当前筛选没有匹配结果' : '没有找到匹配的结果'}
                description="请尝试其他关键词或更换点播源"
                className="!py-16"
              />
            )}
          </section>
        )}

        {/* 首页推荐（有搜索时隐藏） */}
        {!urlQuery && (
          <RecommendSection
            onPick={(title) => {
              setInput(title);
              runSearch(title);
            }}
          />
        )}
      </main>

      <SiteFooter />

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        // 结构对齐真实结果卡（左侧缩略图 + 右侧文字块），避免占位与真实卡片形状不符
        <div key={i} className="card flex h-28 overflow-hidden">
          <div className="w-[105px] sm:w-[120px] shrink-0 bg-chip animate-pulse" />
          <div className="flex-1 p-2.5 space-y-2">
            <div className="h-4 w-3/4 rounded bg-chip animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-chip animate-pulse" />
            <div className="h-3 w-full rounded bg-chip animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 无点播源 / 未勾选点播源时的引导（替代旧版首屏静默空白） */
function NoSourceGuide({ hasSources = false }: { hasSources?: boolean }) {
  return (
    <div className="border border-dashed border-line rounded-xl p-10 text-center max-w-lg mx-auto">
      <h3 className="text-content font-medium mb-2">
        {hasSources ? '尚未勾选点播源' : '先添加一个点播源'}
      </h3>
      <p className="text-sm text-muted leading-relaxed">
        {hasSources ? (
          <>点击右上角「设置」，勾选要参与搜索的点播源后重新搜索。</>
        ) : (
          <>
            可使用站点提供的默认源，也可在「源管理与设置」添加 Apple CMS
            采集站地址（如{' '}
            <code className="text-accent text-xs">https://example.com/api.php/provide/vod</code>），
            勾选后即可开始搜索。
          </>
        )}
      </p>
    </div>
  );
}
