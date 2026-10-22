import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHlsLoader } from './hls-loader';
import type Hls from 'hls.js';
const cache = vi.hoisted(() => ({ read: vi.fn(), touch: vi.fn(), network: vi.fn() }));
vi.mock('./video-cache', () => ({
  buildSegmentCacheKey: (url: string) => url,
  readCachedSegment: cache.read,
  touchMeta: cache.touch,
}));
class BaseLoader {
  stats = { loading: { start: 0, first: 0, end: 0 }, total: 0, loaded: 0 };
  load = cache.network;
  abort() {}
  destroy() {}
}
const HlsCtor = { DefaultConfig: { loader: BaseLoader } } as unknown as typeof Hls;
beforeEach(() => vi.clearAllMocks());
describe('cached fragment loader contract', () => {
  it('delivers cached payload to the transmuxer before completion, without a network request', async () => {
    const data = new Uint8Array([0x47, 0, 1, 2]).buffer;
    cache.read.mockResolvedValue({ data, costMs: 100 });
    const Loader = createHlsLoader(HlsCtor),
      loader = new Loader({}),
      order: string[] = [];
    const context = { url: 'https://media.example.com/segment.ts', type: 'fragment' };
    const progress = vi.fn(() => order.push('progress')),
      success = vi.fn(() => order.push('success'));
    loader.load(context, {}, { onProgress: progress, onSuccess: success });
    await vi.waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(order).toEqual(['progress', 'success']);
    expect(progress).toHaveBeenCalledWith(loader.stats, context, data, undefined);
    expect(loader.stats.loaded).toBe(4);
    expect(cache.network).not.toHaveBeenCalled();
  });
  it('does not deliver a cached fragment after the load has been aborted', async () => {
    let resolve!: (value: unknown) => void;
    cache.read.mockReturnValue(new Promise((r) => (resolve = r)));
    const Loader = createHlsLoader(HlsCtor),
      loader = new Loader({}),
      progress = vi.fn(),
      success = vi.fn();
    loader.load(
      { url: 'https://media.example.com/abort.ts', type: 'fragment' },
      {},
      { onProgress: progress, onSuccess: success },
    );
    loader.abort();
    resolve({ data: new ArrayBuffer(4), costMs: 100 });
    await Promise.resolve();
    await Promise.resolve();
    expect(progress).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
  it('retains the network loader path on a cache miss', async () => {
    cache.read.mockResolvedValue(null);
    const Loader = createHlsLoader(HlsCtor),
      loader = new Loader({});
    loader.load(
      { url: 'https://media.example.com/miss.ts', type: 'fragment' },
      {},
      { onSuccess: vi.fn() },
    );
    await vi.waitFor(() => expect(cache.network).toHaveBeenCalledOnce());
  });
});
