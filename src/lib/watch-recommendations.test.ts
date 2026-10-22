import { describe, expect, it } from 'vitest';
import { recommendationPlan, selectRecommendations } from './watch-recommendations';
import type { VideoInfo } from './types';
const info = (typeName: string, area = ''): VideoInfo => ({
  typeName,
  area,
  sourceKey: 'test',
  sourceName: 'test',
});
describe('watch recommendations', () => {
  it('uses the appropriate category rather than episode count', () => {
    expect(recommendationPlan(info('国产剧')).list).toBe('douban_tv_chinese');
    expect(recommendationPlan(info('韩剧')).list).toBe('douban_tv_global');
    expect(recommendationPlan(info('综艺', '美国')).list).toBe('douban_show_global');
    expect(recommendationPlan(info('动画片')).tag).toBe('动画');
    expect(recommendationPlan(info('纪录片')).tag).toBe('纪录片');
    expect(recommendationPlan().list).toBe('douban_movie_weekly');
  });
  it('excludes current title and duplicate titles across punctuation and fullwidth text', () => {
    const items = ['八仙', ' 八仙！', 'ＡＢＣ', 'abc', '另一部', ''].map((title, i) => ({
      id: String(i),
      title,
      cover: '',
    }));
    expect(selectRecommendations(items, '八仙').map((item) => item.title)).toEqual([
      'ＡＢＣ',
      '另一部',
    ]);
  });
  it('bounds the recommendation pool', () => {
    expect(
      selectRecommendations(
        Array.from({ length: 50 }, (_, i) => ({ id: String(i), title: `影片${i}`, cover: '' })),
        '影片0',
      ),
    ).toHaveLength(24);
  });
});
