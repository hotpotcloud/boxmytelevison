'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FavoriteEntry } from '@/lib/db';
import type { DoubanItem } from '@/lib/types';
import { useToast } from './toast';
const EMPTY: FavoriteEntry[] = [];
const Context = createContext<{
  items: FavoriteEntry[];
  ids: Set<string>;
  toggle: (item: DoubanItem) => Promise<void>;
}>({ items: [], ids: new Set(), toggle: async () => {} });
export const favoriteId = (item: { title: string }) => item.title.trim().toLowerCase();
export const useFavorites = () => useContext(Context);
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const items = useLiveQuery(() => db.favorites.orderBy('createdAt').reverse().toArray()) || EMPTY;
  const ids = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const { toast } = useToast();
  const toggle = async (item: DoubanItem) => {
    const id = favoriteId(item);
    try {
      if (ids.has(id)) {
        await db.favorites.delete(id);
        toast('已取消收藏', 'info');
      } else {
        if (items.length >= 500) {
          toast('最多收藏 500 部，请先移除一些收藏', 'warning');
          return;
        }
        await db.favorites.put({
          id,
          title: item.title,
          cover: item.cover,
          rating: item.rating,
          isTv: item.isTv,
          createdAt: Date.now(),
        });
        toast('已加入我的收藏', 'success');
      }
    } catch {
      toast('无法保存收藏，请检查浏览器存储权限', 'error');
    }
  };
  return <Context.Provider value={{ items, ids, toggle }}>{children}</Context.Provider>;
}
