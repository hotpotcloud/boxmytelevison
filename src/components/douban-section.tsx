'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { pageNumber, pageSize } from '@/lib/pagination';
import type { DoubanItem } from '@/lib/types';
import { useAuth } from './auth';
import { Pagination } from './pagination';
import { PosterCard } from './poster-card';
import { SmartImage } from './smart-image';
import { Icon } from './icon';
import { favoriteId, useFavorites } from './favorites';

const MOVIE_TAGS = [
  '热门',
  '最新',
  '经典',
  '豆瓣高分',
  '冷门佳片',
  '华语',
  '欧美',
  '韩国',
  '日本',
  '动画',
];
const TV_TAGS = [
  '热门',
  '美剧',
  '英剧',
  '韩剧',
  '日剧',
  '国产剧',
  '港剧',
  '日本动画',
  '综艺',
  '纪录片',
];
const LISTS = [
  { id: 'douban_movie_weekly', label: '电影周榜', tv: false },
  { id: 'douban_tv_chinese', label: '国产剧周榜', tv: true },
  { id: 'douban_tv_global', label: '海外剧周榜', tv: true },
  { id: 'douban_show_chinese', label: '国内综艺', tv: true },
  { id: 'douban_show_global', label: '海外综艺', tv: true },
  { id: 'baidu_teleplay', label: '百度热播剧', tv: true },
];
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const { checked: verified, openLogin } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const enabled = useAppStore((s) => s.doubanEnabled);
  const source = useAppStore((s) => s.recommendSource);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const category = ['movie', 'tv'].includes(params.get('category') || '')
    ? params.get('category')!
    : 'all';
  const tags = category === 'tv' ? TV_TAGS : MOVIE_TAGS;
  const tag = tags.includes(params.get('tag') || '') ? params.get('tag')! : '热门';
  const lists = LISTS.filter((list) => category === 'all' || list.tv === (category === 'tv'));
  const listId = lists.some((list) => list.id === params.get('list')) ? params.get('list')! : 'all';
  const weekday = Math.min(7, Math.max(0, Number(params.get('day')) || 0));
  const size = pageSize(params.get('size'));
  const sort = ['rating', 'title'].includes(params.get('sort') || '')
    ? params.get('sort')!
    : 'default';
  const change = (patch: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.delete('page');
    router.push(`/?${next.toString()}`, { scroll: false });
  };
  const query = useQuery({
    queryKey: ['discovery-v3', source, category, tag, listId, weekday],
    enabled: enabled && verified,
    staleTime: 300000,
    queryFn: async ({ signal }) => {
      let jobs: Promise<DoubanItem[]>[];
      if (source === 'bangumi') {
        const data = await api.bangumiCalendar(signal);
        const items = data.days
          .filter((day) => !weekday || day.weekday === weekday)
          .flatMap((day) => day.items)
          .map((item) => ({ ...item, isTv: true }));
        return { items: category === 'movie' ? [] : items, partial: false };
      } else if (source === 'hot-list') {
        const selected =
          listId !== 'all'
            ? [listId]
            : category === 'movie'
              ? ['douban_movie_weekly']
              : category === 'tv'
                ? LISTS.filter((list) => list.tv).map((list) => list.id)
                : LISTS.map((list) => list.id);
        jobs = selected.map((id) => api.hotList(id, signal).then((data) => data.items));
      } else {
        const types: ('movie' | 'tv')[] =
          category === 'all' ? ['movie', 'tv'] : [category as 'movie' | 'tv'];
        jobs = types.map((type) =>
          api
            .douban(type, tag, 0, 50, signal)
            .then((data) => data.items.map((item) => ({ ...item, isTv: type === 'tv' }))),
        );
      }
      const results = await Promise.allSettled(jobs);
      const successes = results.filter(
        (result): result is PromiseFulfilledResult<DoubanItem[]> => result.status === 'fulfilled',
      );
      if (!successes.length) throw new Error('推荐暂时无法加载');
      const seen = new Set<string>();
      return {
        items: successes
          .flatMap((result) => result.value)
          .filter((item) => {
            const key = `${item.title}:${item.isTv}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
        partial: successes.length < results.length,
      };
    },
  });
  // Popular titles can render while the slower weekly lists are still refreshing.
  const catalog = useQuery({
    queryKey: ['discovery-catalog', category],
    enabled: enabled && verified && source === 'hot-list' && listId === 'all',
    staleTime: 300000,
    queryFn: async ({ signal }) => {
      const types: ('movie' | 'tv')[] =
        category === 'all' ? ['movie', 'tv'] : [category as 'movie' | 'tv'];
      const results = await Promise.allSettled(
        types.map((type) =>
          api
            .douban(type, '热门', 0, 50, signal)
            .then((data) => data.items.map((item) => ({ ...item, isTv: type === 'tv' }))),
        ),
      );
      const good = results.filter(
        (r): r is PromiseFulfilledResult<(DoubanItem & { isTv: boolean })[]> =>
          r.status === 'fulfilled',
      );
      if (!good.length) throw new Error('热门片单暂不可用');
      return good.flatMap((r) => r.value);
    },
  });
  const popular = source === 'hot-list' && listId === 'all' ? catalog.data || [] : [];
  const seenTitles = new Set<string>();
  const items = [...popular, ...(query.data?.items || [])].filter((item) => {
    const key = item.title + ':' + item.isTv;
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  const loading =
    items.length === 0 &&
    (query.isLoading || (source === 'hot-list' && listId === 'all' && catalog.isLoading));
  if (sort === 'rating') items.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
  if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  const page = Math.min(
    pageNumber(params.get('page')),
    Math.max(1, Math.ceil(items.length / size)),
  );
  const visible = items.slice((page - 1) * size, page * size);
  if (!enabled)
    return (
      <section className="library-state">
        <h2>首页推荐已关闭</h2>
        <p>你仍然可以使用顶部搜索，也可以在源管理与设置中重新启用推荐。</p>
        <button
          className="btn-primary min-h-11"
          onClick={() => updateSettings({ doubanEnabled: true })}
        >
          开启推荐
        </button>
      </section>
    );
  return (
    <>
      {verified && loading && (
        <div className="featured-grid" aria-hidden>
          <div className="featured-card featured-main animate-pulse bg-chip" />
          <div className="featured-card animate-pulse bg-chip" />
          <div className="featured-card animate-pulse bg-chip" />
        </div>
      )}
      {verified && items.length > 0 && (
        <div className="featured-grid" aria-label="本期精选">
          {items.slice(0, 3).map((item, index) => (
            <FeaturedCard
              key={`${item.id}:${item.isTv}`}
              item={item}
              main={index === 0}
              onPick={onPick}
            />
          ))}
        </div>
      )}
      <section aria-label="精选片单">
        <div className="library-toolbar">
          <h2>精选片单</h2>
          <div className="segmented-control" aria-label="片单类型">
            {[
              ['all', '全部'],
              ['movie', '电影'],
              ['tv', '剧集'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={category === value}
                onClick={() =>
                  change({ category: value === 'all' ? '' : value, list: '', tag: '', day: '' })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="library-filters">
            <select
              aria-label="推荐来源"
              value={source}
              onChange={(event) => {
                updateSettings({ recommendSource: event.target.value as typeof source });
                change({ list: '', tag: '', day: '' });
              }}
            >
              <option value="hot-list">影视热榜</option>
              <option value="douban">豆瓣推荐</option>
              <option value="bangumi">新番放送</option>
            </select>
            <select
              aria-label="推荐排序"
              value={sort}
              onChange={(event) => change({ sort: event.target.value })}
            >
              <option value="default">榜单顺序</option>
              <option value="rating">评分优先</option>
              <option value="title">按片名排序</option>
            </select>
          </div>
        </div>
        {source === 'hot-list' && (
          <div className="library-tags">
            <button
              className="library-tag"
              aria-pressed={listId === 'all'}
              onClick={() => change({ list: '' })}
            >
              综合精选
            </button>
            {lists.map((list) => (
              <button
                key={list.id}
                className="library-tag"
                aria-pressed={listId === list.id}
                onClick={() => change({ list: list.id })}
              >
                {list.label}
              </button>
            ))}
          </div>
        )}
        {source === 'douban' && (
          <div className="library-tags">
            {tags.map((name) => (
              <button
                key={name}
                className="library-tag"
                aria-pressed={tag === name}
                onClick={() => change({ tag: name })}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {source === 'bangumi' && (
          <div className="library-tags">
            {['全部日期', '周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(
              (label, index) => (
                <button
                  key={label}
                  className="library-tag"
                  aria-pressed={weekday === index}
                  onClick={() => change({ day: String(index) })}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        )}
        {!verified ? (
          <div className="library-state">
            <Icon name="play" className="w-8 h-8 text-accent" />
            <h3>你的观影空间，准备就绪</h3>
            <p>登录个人账号后浏览精选片单、搜索播放源，下次回来无需再输入访问密码。</p>
            <button className="btn-primary min-h-11 px-6" onClick={openLogin}>
              登录 / 注册
            </button>
          </div>
        ) : loading ? (
          <GridSkeleton />
        ) : query.isError && items.length === 0 ? (
          <div className="library-state">
            <h3>片单暂时无法加载</h3>
            <p>推荐源可能暂时不可用。可以点击重试、切换推荐来源，或直接搜索片名。</p>
            <button
              className="btn-ghost min-h-11"
              onClick={() => {
                void query.refetch();
                if (source === 'hot-list') void catalog.refetch();
              }}
            >
              重新加载
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="library-state">
            <h3>这个分类暂时没有内容</h3>
            <p>
              {source === 'bangumi' && category === 'movie'
                ? '新番放送只提供动画剧集，请切换推荐来源或选择剧集。'
                : '试试其他分类或推荐来源。'}
            </p>
          </div>
        ) : (
          <>
            {query.data?.partial && (
              <p role="status" className="text-xs text-muted mb-4">
                部分榜单暂时不可用，已展示其余可用内容。
              </p>
            )}
            <div className="poster-grid">
              {visible.map((item) => (
                <PosterCard
                  key={`${item.id}:${item.title}:${item.isTv}`}
                  item={item}
                  onPick={onPick}
                />
              ))}
            </div>
            <Pagination
              total={items.length}
              page={page}
              size={size}
              onPage={(next) => {
                change({ page: String(next) }, false);
                document
                  .querySelector('[aria-label="精选片单"]')
                  ?.scrollIntoView({ block: 'start' });
              }}
              onSize={(next) => change({ size: String(next) })}
            />
          </>
        )}
      </section>
    </>
  );
}
function FeaturedCard({
  item,
  main,
  onPick,
}: {
  item: DoubanItem;
  main: boolean;
  onPick: (title: string) => void;
}) {
  const mode = useAppStore((s) => s.imageProxyMode),
    customProxy = useAppStore((s) => s.customImageProxy);
  const { ids, toggle } = useFavorites();
  const image = (
    <SmartImage
      url={item.cover}
      mode={mode}
      customProxy={customProxy}
      alt=""
      className="featured-image"
      loading="eager"
    />
  );
  if (!main)
    return (
      <button
        className="featured-card featured-side"
        onClick={() => onPick(item.title)}
        aria-label={`查找 ${item.title} 的片源`}
      >
        {image}
        <div>
          <h2>{item.title}</h2>
          <p className="featured-meta">
            {item.isTv ? '剧集精选' : '电影精选'}
            {item.rating ? ` · ${item.rating} 分` : ''}
          </p>
        </div>
        <span className="featured-play">
          <Icon name="play" className="w-3 h-3" />
        </span>
      </button>
    );
  const saved = ids.has(favoriteId(item));
  return (
    <article className="featured-card featured-main">
      {image}
      <div>
        <span className="featured-label">本期精选</span>
        <h2>{item.title}</h2>
        <p className="featured-meta">
          {item.isTv ? '剧集' : '电影'}
          {item.rating ? ` · 豆瓣 ${item.rating} 分` : ''} · 发现值得一看的好故事
        </p>
        <div className="featured-actions">
          <button onClick={() => onPick(item.title)}>
            <Icon name="play" className="w-4 h-4" />
            查看片源
          </button>
          <button aria-pressed={saved} onClick={() => void toggle(item)}>
            <Icon name="heart" className="w-4 h-4" />
            {saved ? '已收藏' : '收藏'}
          </button>
        </div>
      </div>
    </article>
  );
}
export function GridSkeleton() {
  return (
    <div className="poster-grid" aria-label="正在加载影片" role="status">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] rounded-xl bg-chip animate-pulse" />
          <div className="h-3 mt-3 rounded bg-chip animate-pulse w-3/4" />
          <div className="h-2 mt-2 rounded bg-chip animate-pulse w-1/2" />
        </div>
      ))}
    </div>
  );
}
