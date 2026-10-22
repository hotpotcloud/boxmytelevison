import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { POST, GET } from './[action]/route';
import { DELETE } from '../auth/route';
import { closeAccountDatabase } from '@/lib/account-db';
import { accountFromCookie } from '@/lib/accounts';
import { clearRateLimit } from '@/lib/auth';
import { guardRequest } from '@/lib/api-guard';
let folder: string;
const context = (action: string) => ({ params: Promise.resolve({ action }) });
const request = (action: string, body: unknown, options: Record<string, string> = {}) =>
  new Request(`http://local.test/api/account/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': 'account-route-tests', ...options },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'libretv-account-routes-'));
  vi.stubEnv('DATABASE_PATH', path.join(folder, 'accounts.sqlite'));
  vi.stubEnv('REGISTRATION_MODE', 'open');
  vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', '');
  clearRateLimit('account:account-route-tests');
});
afterEach(() => {
  closeAccountDatabase();
  vi.unstubAllEnvs();
  if (
    path.dirname(folder) !== path.resolve(tmpdir()) ||
    !path.basename(folder).startsWith('libretv-account-routes-')
  )
    throw new Error('Unsafe cleanup path');
  rmSync(folder, { recursive: true, force: true });
});
async function registration(remember = true) {
  return POST(
    request('register', { email: 'reader@example.com', password: 'route-password-123', remember }),
    context('register'),
  );
}
describe('account API integration', () => {
  it('registers, signs a persistent cookie, enters guarded APIs and revokes on logout', async () => {
    const res = await registration();
    expect(res.status).toBe(201);
    const cookies = res.headers.getSetCookie();
    const session = cookies.find(
      (c) => c.startsWith('ltv_account=') && !c.startsWith('ltv_account=;'),
    )!;
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=lax');
    expect(session).toContain('Max-Age=');
    const cookie = session.split(';')[0];
    expect(guardRequest(new Request('http://local.test/api/publish', { headers: { cookie } }))).toBe(
      null,
    );
    const me = await GET(
      new Request('http://local.test/api/account/me', { headers: { cookie } }),
      context('me'),
    );
    expect((await me.json()).user.email).toBe('reader@example.com');
    expect(
      (
        await DELETE(
          new Request('http://local.test/api/auth', { method: 'DELETE', headers: { cookie } }),
        )
      ).status,
    ).toBe(200);
    expect(accountFromCookie(cookie)).toBe(null);
    expect(
      guardRequest(new Request('http://local.test/api/search', { headers: { cookie } }))?.status,
    ).toBe(401);
  });
  it('omits Max-Age for browser sessions and sets Secure for HTTPS', async () => {
    await registration();
    const res = await POST(
      request(
        'login',
        { identifier: 'reader@example.com', password: 'route-password-123', remember: false },
        { 'x-forwarded-proto': 'https' },
      ),
      context('login'),
    );
    const cookie = res.headers.getSetCookie().find((c) => /^ltv_account=[a-f0-9]{64}/.test(c))!;
    expect(cookie).not.toContain('Max-Age');
    expect(cookie).toContain('Secure');
  });
  it('rejects cross-origin mutations, invalid JSON, large bodies and unknown routes', async () => {
    expect(
      (await POST(request('register', {}, { Origin: 'https://evil.test' }), context('register')))
        .status,
    ).toBe(403);
    expect(
      (await POST(request('register', { email: 'x'.repeat(5000) }), context('register'))).status,
    ).toBe(413);
    expect((await POST(request('unknown', {}), context('unknown'))).status).toBe(404);
    expect((await GET(new Request('http://local.test/api/account/me'), context('me'))).status).toBe(
      401,
    );
  });
  it('rate-limits before performing expensive password verification', async () => {
    for (let i = 0; i < 10; i++) await POST(request('login', {}), context('login'));
    expect((await POST(request('login', {}), context('login'))).status).toBe(429);
  });
});
