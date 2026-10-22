import type { DoubanItem, VideoInfo } from './types';

export function recommendationPlan(info?: VideoInfo) {
  const type = info?.typeName || '';
  const area = info?.area || '';
  if (/综艺/.test(type))
    return {
      list: /欧美|美国|英国|韩国|日本/.test(area) ? 'douban_show_global' : 'douban_show_chinese',
      type: 'tv' as const,
      tag: '综艺',
      label: '综艺推荐',
    };
  if (/动漫|动画/.test(type))
    return {
      list: 'douban_movie_weekly',
      type: 'movie' as const,
      tag: '动画',
      label: '动画推荐',
      doubanFirst: true,
    };
  if (/纪录/.test(type))
    return {
      list: 'douban_movie_weekly',
      type: 'tv' as const,
      tag: '纪录片',
      label: '纪录片推荐',
      doubanFirst: true,
    };
  if (/剧|电视/.test(type))
    return {
      list: /欧美|美国|英国|韩国|日本|海外|美剧|英剧|韩剧|日剧|泰剧/.test(area + type)
        ? 'douban_tv_global'
        : 'douban_tv_chinese',
      type: 'tv' as const,
      tag: '热门',
      label: '剧集推荐',
    };
  return { list: 'douban_movie_weekly', type: 'movie' as const, tag: '热门', label: '电影推荐' };
}

const titleKey = (title: string) =>
  title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');

export function selectRecommendations(items: DoubanItem[], currentTitle: string): DoubanItem[] {
  const seen = new Set([titleKey(currentTitle)]);
  return items
    .filter((item) => {
      const key = titleKey(item.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}
