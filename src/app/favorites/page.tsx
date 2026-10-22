'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { useFavorites } from '@/components/favorites';
import { PosterCard } from '@/components/poster-card';
import { Pagination } from '@/components/pagination';
import { pageNumber, pageSize } from '@/lib/pagination';
import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth';
export default function FavoritesPage() {
  return (
    <Suspense>
      <FavoritesContent />
    </Suspense>
  );
}
function FavoritesContent() {
  const { items } = useFavorites();
  const { user, openLogin } = useAuth();
  const params = useSearchParams(),
    router = useRouter();
  const keyword = params.get('q') || '';
  const size = pageSize(params.get('size'));
  const filtered = items.filter((item) => item.title.toLowerCase().includes(keyword.toLowerCase()));
  const page = Math.min(
    pageNumber(params.get('page')),
    Math.max(1, Math.ceil(filtered.length / size)),
  );
  const update = (patch: Record<string, string>, reset = true) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([key, value]) => next.set(key, value));
    if (reset) next.delete('page');
    router.replace(`/favorites?${next}`, { scroll: false });
  };
  return (
    <div className="min-h-screen flex flex-col">
      <Header showSearch />
      <main className="app-content">
        <header className="discovery-heading">
          <p className="eyebrow mb-2">YOUR COLLECTION</p>
          <h1>我的收藏</h1>
          <p>喜欢的故事，留到有空的时候。收藏保存在当前浏览器。</p>
        </header>
        {!user ? (
          <section className="library-state">
            <Icon name="heart" className="w-8 h-8 text-accent" />
            <h2>登录后开启收藏</h2>
            <p>游客可以自由搜索和观看，收藏仅向登录用户开放。</p>
            <button className="btn-primary" onClick={openLogin}>
              登录 / 注册
            </button>
          </section>
        ) : (
          <>
            <div className="library-toolbar">
              <h2>{items.length} 部收藏</h2>
              <label className="library-filters">
                <span className="sr-only">搜索收藏</span>
                <input
                  className="input min-h-11"
                  placeholder="搜索收藏中的影片"
                  aria-label="搜索收藏"
                  maxLength={100}
                  value={keyword}
                  onChange={(event) => update({ q: event.target.value })}
                />
              </label>
            </div>
            {!filtered.length ? (
              <section className="library-state">
                <Icon name="heart" className="w-8 h-8 text-accent" />
                <h2>{keyword ? '没有找到匹配的收藏' : '把喜欢的故事留在这里'}</h2>
                <p>在精选片单中点击爱心即可收藏，再次点击可取消。</p>
                <Link href="/" className="btn-primary min-h-11 px-6">
                  去发现好故事
                </Link>
              </section>
            ) : (
              <>
                <div className="poster-grid">
                  {filtered.slice((page - 1) * size, page * size).map((item) => (
                    <PosterCard
                      key={item.id}
                      item={item}
                      onPick={(title) => router.push(`/?s=${encodeURIComponent(title)}`)}
                    />
                  ))}
                </div>
                <Pagination
                  total={filtered.length}
                  page={page}
                  size={size}
                  onPage={(next) => update({ page: String(next) }, false)}
                  onSize={(next) => update({ size: String(next) })}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
