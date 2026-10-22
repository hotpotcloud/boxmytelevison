'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import type { VideoInfo } from '@/lib/types';
import { recommendationPlan, selectRecommendations } from '@/lib/watch-recommendations';
import { PosterCard } from './poster-card';
import { useRouter } from 'next/navigation';

export function WatchRecommendations({
  info,
  title,
  ready,
}: {
  info?: VideoInfo;
  title: string;
  ready: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'related' | 'popular'>('related');
  const [page, setPage] = useState(0);
  const plan = recommendationPlan(mode === 'related' ? info : undefined);
  const query = useQuery({
    queryKey: ['watch-recommendations', plan.list, plan.type, plan.tag, Boolean(plan.doubanFirst)],
    enabled: ready,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const primary = () =>
        plan.doubanFirst
          ? api.douban(plan.type, plan.tag, 0, 24, signal)
          : api.hotList(plan.list, signal);
      const fallback = () =>
        plan.doubanFirst
          ? api.hotList(plan.list, signal)
          : api.douban(plan.type, plan.tag, 0, 24, signal);
      try {
        const result = await primary();
        if (result.items.length) return { items: result.items, fallback: false };
      } catch (error) {
        if (signal.aborted) throw error;
      }
      return { items: (await fallback()).items, fallback: true };
    },
  });
  const items = selectRecommendations(query.data?.items || [], title);
  const pageCount = Math.ceil(items.length / 6);
  const activePage = Math.min(page, Math.max(0, pageCount - 1));
  const visible = items.slice(activePage * 6, (activePage + 1) * 6);
  return (
    <section id="watch-recommendations" className="watch-recommendations" aria-label="影片推荐">
      <div className="watch-recommendation-heading">
        <h2>接着发现</h2>
        {pageCount > 1 && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => setPage((activePage + 1) % pageCount)}
            aria-label="换一批推荐影片"
          >
            换一批{' '}
            <span className="text-faint">
              {activePage + 1}/{pageCount}
            </span>
          </button>
        )}
      </div>
      <div className="watch-recommendation-tabs" role="group" aria-label="推荐类型">
        {(['related', 'popular'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setPage(0);
            }}
          >
            {value === 'related' ? '相关推荐' : '热门发现'}
          </button>
        ))}
      </div>
      <p className="watch-recommendation-caption">
        {query.data?.fallback && plan.doubanFirst
          ? '热门榜单'
          : mode === 'related'
            ? plan.label
            : '热门电影'}{' '}
        · 点击查找片源
      </p>
      {!ready || query.isPending ? (
        <div className="watch-recommendation-grid" aria-label="推荐加载中" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="watch-recommendation-skeleton animate-pulse" />
          ))}
        </div>
      ) : query.isError || !visible.length ? (
        <div className="watch-recommendation-empty">
          <p>{query.isError ? '推荐暂时无法加载' : '暂无更多推荐'}</p>
          <button className="btn-ghost btn-sm" onClick={() => void query.refetch()}>
            重新加载
          </button>
          <Link href="/" className="btn-ghost btn-sm">
            去首页发现
          </Link>
        </div>
      ) : (
        <div className="watch-recommendation-grid">
          {visible.map((item) => (
            <PosterCard
              key={item.id + item.title}
              item={item}
              onPick={(name) => router.push(`/?s=${encodeURIComponent(name)}`)}
              subtitle={item.isTv ? '剧集' : '电影'}
            />
          ))}
        </div>
      )}
    </section>
  );
}
