export function paginationWindow(current: number, totalPages: number): (number | 'gap')[] {
  const total = Math.max(1, Math.floor(totalPages));
  const page = Math.max(1, Math.min(total, Math.floor(current)));
  const pages = [
    ...new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total)),
  ].sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  pages.forEach((p, index) => {
    const previous = pages[index - 1];
    if (index && p - previous === 2) result.push(previous + 1);
    else if (index && p - previous > 2) result.push('gap');
    result.push(p);
  });
  return result;
}
export function pageNumber(value: string | null, fallback = 1): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}
export function pageSize(value: string | null): number {
  const parsed = Number(value);
  return [12, 24, 48].includes(parsed) ? parsed : 12;
}
