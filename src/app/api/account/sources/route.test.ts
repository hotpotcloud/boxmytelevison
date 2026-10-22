import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET, PUT } from './route';
import { registerAccount, createAccountSession } from '@/lib/accounts';
import { closeAccountDatabase, accountDatabase } from '@/lib/account-db';
import { emptySourceProfile } from '@/lib/source-profile';
let folder: string;
let a: string, b: string;
const get = (cookie = '') =>
  GET(new Request('http://local.test/api/account/sources', { headers: { cookie } }));
const put = (cookie: string, config: unknown, revision = 0, extra: Record<string, string> = {}) =>
  PUT(
    new Request('http://local.test/api/account/sources', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie, ...extra },
      body: JSON.stringify({ config, revision }),
    }),
  );
beforeEach(async () => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'muu-source-tests-'));
  vi.stubEnv('DATABASE_PATH', path.join(folder, 'accounts.sqlite'));
  vi.stubEnv('REGISTRATION_MODE', 'open');
  vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', '');
  const one = await registerAccount('one@example.com', 'test-only-password'),
    two = await registerAccount('two@example.com', 'test-only-password');
  a = 'ltv_account=' + createAccountSession(one.id, true).token;
  b = 'ltv_account=' + createAccountSession(two.id, true).token;
});
afterEach(() => {
  closeAccountDatabase();
  vi.unstubAllEnvs();
  if (
    path.dirname(folder) !== path.resolve(os.tmpdir()) ||
    !path.basename(folder).startsWith('muu-source-tests-')
  )
    throw new Error('Unsafe cleanup');
  rmSync(folder, { recursive: true, force: true });
});
const config = () => ({
  ...emptySourceProfile(),
  customAPIs: [{ key: 'personal_1', name: '我的源', url: 'https://video.example.com/api' }],
  selectedKeys: ['personal_1'],
});
describe('account source profiles', () => {
  it('requires real accounts, including when a legacy visitor cookie exists', async () => {
    expect((await get()).status).toBe(401);
    expect((await put('', config())).status).toBe(401);
    expect((await get('ltv_session=invalid')).status).toBe(401);
  });
  it('persists sources across sessions and database reopen, isolated from another account', async () => {
    expect((await get(a)).status).toBe(200);
    expect((await put(a, config())).status).toBe(200);
    closeAccountDatabase();
    expect((await (await get(a)).json()).config.customAPIs[0].name).toBe('我的源');
    expect((await (await get(b)).json()).config.customAPIs).toEqual([]);
    const userId = accountDatabase()
      .prepare('SELECT id FROM users WHERE email=?')
      .get('one@example.com')!.id as string;
    const fresh = 'ltv_account=' + createAccountSession(userId, true).token;
    expect((await (await get(fresh)).json()).revision).toBe(1);
  });
  it('rejects stale writers without changing the newer configuration', async () => {
    expect((await put(a, config())).status).toBe(200);
    expect((await put(a, emptySourceProfile(), 0)).status).toBe(409);
    expect((await put(a, { ...config(), selectedKeys: [] }, 1)).status).toBe(200);
    expect((await put(a, emptySourceProfile(), 1)).status).toBe(409);
    expect((await (await get(a)).json()).revision).toBe(2);
  });
  it('blocks cross-site requests and oversized payloads', async () => {
    expect((await put(a, config(), 0, { Origin: 'https://evil.test' })).status).toBe(403);
    expect((await put(a, { ...config(), padding: 'x'.repeat(262144) })).status).toBe(413);
  });
  it('validates URL schemes, duplicate keys, array counts and versions', async () => {
    expect(
      (
        await put(a, {
          ...config(),
          customAPIs: [{ key: 'x', name: 'x', url: 'javascript:alert(1)' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (await put(a, { ...config(), customAPIs: [...config().customAPIs, ...config().customAPIs] }))
        .status,
    ).toBe(400);
    expect(
      (
        await put(a, {
          ...config(),
          subscriptions: Array(101).fill({ url: 'https://example.com' }),
        })
      ).status,
    ).toBe(400);
    expect((await put(a, config(), -1)).status).toBe(400);
  });
  it('strips unknown data and cascades only deleted account profiles', async () => {
    await put(a, {
      ...config(),
      user_id: 'other',
      password: 'never-store',
      defaultSources: [{ key: 'site' }],
    });
    await put(b, emptySourceProfile());
    const row = accountDatabase()
      .prepare(
        'SELECT config_json FROM user_source_profiles WHERE user_id=(SELECT id FROM users WHERE email=?)',
      )
      .get('one@example.com')!;
    expect(row.config_json).not.toContain('never-store');
    expect(row.config_json).not.toContain('defaultSources');
    accountDatabase().prepare('DELETE FROM users WHERE email=?').run('one@example.com');
    expect(
      accountDatabase().prepare('SELECT count(*) AS n FROM user_source_profiles').get()!.n,
    ).toBe(1);
  });
});
