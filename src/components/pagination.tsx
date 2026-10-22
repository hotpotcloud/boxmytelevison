'use client';
import { paginationWindow } from '@/lib/pagination';
export function Pagination({
  total,
  page,
  size,
  onPage,
  onSize,
}: {
  total: number;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages, Math.max(1, page));
  return (
    <nav className="pagination" aria-label="内容分页">
      <p className="pagination-total" aria-live="polite">
        共 {total} 部 · 第 {current} / {pages} 页
      </p>
      <div className="pagination-pages">
        <button disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label="上一页">
          ‹<span className="page-edge-label"> 上一页</span>
        </button>
        {paginationWindow(current, pages).map((p, index) =>
          p === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-faint" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-label={`第 ${p} 页`}
              aria-current={p === current ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}
        <button disabled={current >= pages} onClick={() => onPage(current + 1)} aria-label="下一页">
          <span className="page-edge-label">下一页 </span>›
        </button>
      </div>
      <label className="text-xs text-muted">
        <span className="sr-only">每页数量</span>
        <select
          aria-label="每页数量"
          value={size}
          onChange={(event) => onSize(Number(event.target.value))}
        >
          {[12, 24, 48].map((n) => (
            <option key={n} value={n}>
              每页 {n} 部
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
