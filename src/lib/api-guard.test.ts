import { describe, it, expect, vi, afterEach } from 'vitest';
import { guardRequest } from './api-guard';
afterEach(() => vi.unstubAllEnvs());
describe('guest API allowlist', () => {
  it('permits public browsing with no password and registration closed', () => {
    vi.stubEnv('PASSWORD', '');
    vi.stubEnv('REGISTRATION_MODE', 'closed');
    for (const [pathname, method] of [
      ['/api/search', 'POST'],
      ['/api/detail', 'GET'],
      ['/api/douban', 'GET'],
      ['/api/live/playlist', 'GET'],
      ['/api/proxy', 'GET'],
      ['/api/live/stream', 'GET'],
    ])
      expect(guardRequest(new Request('http://local.test' + pathname, { method }))).toBe(null);
  });
  it('keeps unknown paths, wrong methods, publishing and batch probes protected', () => {
    vi.stubEnv('PASSWORD', 'test-only-password');
    for (const [pathname, method] of [
      ['/api/unknown', 'GET'],
      ['/api/detail', 'POST'],
      ['/api/publish', 'POST'],
      ['/api/quality', 'POST'],
      ['/api/live/probe', 'POST'],
      ['/api/source/test', 'POST'],
    ])
      expect(guardRequest(new Request('http://local.test' + pathname, { method }))?.status).toBe(
        401,
      );
  });
});
