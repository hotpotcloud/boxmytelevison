'use client';
import { useState } from 'react';
import type { DoubanItem } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { SmartImage } from './smart-image';
import { Icon } from './icon';
import { favoriteId, useFavorites } from './favorites';
export function PosterCard({
  item,
  onPick,
  subtitle,
}: {
  item: DoubanItem;
  onPick: (title: string) => void;
  subtitle?: string;
}) {
  const mode = useAppStore((s) => s.imageProxyMode);
  const customProxy = useAppStore((s) => s.customImageProxy);
  const [failedCover, setFailedCover] = useState('');
  const { ids, toggle } = useFavorites();
  const saved = ids.has(favoriteId(item));
  return (
    <article className="poster-card">
      <button
        className="poster-action"
        onClick={() => onPick(item.title)}
        aria-label={`搜索 ${item.title} 的播放源`}
      >
        <div className="poster-art">
          {item.cover && failedCover !== item.cover ? (
            <SmartImage
              url={item.cover}
              mode={mode}
              customProxy={customProxy}
              alt={item.title}
              className="h-full w-full object-cover"
              onExhausted={() => setFailedCover(item.cover)}
            />
          ) : (
            <span className="poster-placeholder">{item.title}</span>
          )}
          {item.rating && <span className="poster-rating">{item.rating}</span>}
        </div>
        <h3 className="poster-title" title={item.title}>
          {item.title}
        </h3>
        <p className="poster-subtitle">
          {subtitle || (item.isTv ? '剧集 · 点击查找片源' : '电影 · 点击查找片源')}
        </p>
      </button>
      <button
        className="poster-save"
        aria-label={`${saved ? '取消收藏' : '收藏'} ${item.title}`}
        aria-pressed={saved}
        onClick={() => void toggle(item)}
      >
        <Icon name="heart" className="w-4 h-4" />
      </button>
    </article>
  );
}
