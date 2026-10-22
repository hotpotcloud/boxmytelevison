'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { normalizeForSearch } from '@/lib/live-channel-filter';

/**
 * 直播「分组选择器」：替代通用下拉在窄侧栏里宽度不稳、238+ 分组难翻的问题。
 * - 面板宽度固定（不依赖 w-max），并按视口宽度收敛，名称超长省略 + 悬停全称；
 * - 面板内带分组搜索，分组按频道数量从多到少排序（大组在前）；
 * - 右侧显示每个分组的频道数量；当前选中分组打勾；
 * - 面板若右对齐会超出视口左侧，自动改为左对齐。
 */

const PANEL_WIDTH = 260;

export interface GroupCount {
  name: string;
  count: number;
}

interface GroupPickerProps {
  /** 分组及其频道数量（含全部频道） */
  groups: GroupCount[];
  /** 当前选中分组，'' 表示全部分组 */
  value: string;
  onChange: (group: string) => void;
}

export function GroupPicker({ groups, value, onChange }: GroupPickerProps) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('right');
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const total = useMemo(() => groups.reduce((s, g) => s + g.count, 0), [groups]);
  const selected = value || '全部分组';

  const normalizedQuery = useMemo(() => normalizeForSearch(query.trim()), [query]);
  const visibleGroups = useMemo(() => {
    const sorted = [...groups].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
    if (!normalizedQuery) return sorted;
    return sorted.filter((g) => normalizeForSearch(g.name).includes(normalizedQuery));
  }, [groups, normalizedQuery]);

  // 展开时：决定对齐方向并聚焦搜索框；收起时清空搜索
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (root) {
      const rect = root.getBoundingClientRect();
      const panelW = Math.min(PANEL_WIDTH, window.innerWidth - 24);
      setAlign(rect.right - panelW < 12 ? 'left' : 'right');
    }
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (g: string) => {
    onChange(g);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="分组筛选"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'input w-[104px] flex items-center justify-between gap-1 cursor-pointer !py-1.5 text-xs',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          open && 'border-accent'
        )}
      >
        <span className="truncate">{selected}</span>
        <svg
          className={cn('w-3.5 h-3.5 shrink-0 text-faint transition-transform duration-200', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute top-full z-50 mt-1.5 flex flex-col overflow-hidden rounded-xl border border-line bg-surface-raised shadow-xl animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          style={{ width: `min(${PANEL_WIDTH}px, calc(100vw - 24px))`, maxHeight: 340 }}
        >
          <div className="p-2 border-b border-line shrink-0">
            <input
              ref={searchRef}
              className="input w-full !py-1.5 text-xs"
              placeholder="搜索分组…"
              value={query}
              maxLength={30}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="flex-1 min-h-0 overflow-y-auto scrollbar-thin py-1">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                onClick={() => pick('')}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-hover',
                  value === '' && 'text-accent'
                )}
              >
                <span className="flex-1 truncate">全部分组</span>
                <span className="shrink-0 rounded-full bg-chip px-1.5 text-[10px] text-faint">{total}</span>
              </button>
            </li>
            {visibleGroups.map((g) => {
              const active = value === g.name;
              return (
                <li key={g.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    title={g.name}
                    onClick={() => pick(g.name)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-hover',
                      active ? 'text-accent' : 'text-content'
                    )}
                  >
                    <span className="flex-1 truncate">{g.name}</span>
                    <span className="shrink-0 rounded-full bg-chip px-1.5 text-[10px] text-faint">{g.count}</span>
                    {active && (
                      <svg className="w-3.5 h-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
            {visibleGroups.length === 0 && (
              <li className="px-3 py-4 text-center text-[11px] text-faint">没有匹配的分组</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
