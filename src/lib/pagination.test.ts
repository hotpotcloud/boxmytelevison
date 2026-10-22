import { describe, expect, it } from 'vitest';
import { pageNumber, pageSize, paginationWindow } from './pagination';
describe('URL pagination boundaries', () => {
  it('rejects invalid page and size values', () => {
    for (const value of [null, '', '0', '-1', '1.5', 'Infinity', '999999999999999999999'])
      expect(pageNumber(value)).toBe(1);
    expect(pageNumber('3')).toBe(3);
    expect(pageSize('48')).toBe(48);
    expect(pageSize('99999')).toBe(12);
  });
  it('renders edges, nearby pages and stable gaps', () => {
    expect(paginationWindow(1, 1)).toEqual([1]);
    expect(paginationWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(paginationWindow(99, 5)).toEqual([1, 'gap', 4, 5]);
    expect(paginationWindow(1, 4)).toEqual([1, 2, 3, 4]);
  });
});
