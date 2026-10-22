import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { accountDatabase, closeAccountDatabase } from './account-db';
import {
  accountFromCookie,
  ACCOUNT_COOKIE,
  changeAccountPassword,
  createAccountSession,
  loginAccount,
  normalizeEmail,
  registerAccount,
  revokeAccountSession,
} from './accounts';
import { sessionFromCookieHeader } from './auth';

let folder: string;
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'libretv-accounts-'));
  vi.stubEnv('DATABASE_PATH', path.join(folder, 'accounts.sqlite'));
  vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', '');
  vi.stubEnv('REGISTRATION_MODE', 'open');
});
afterEach(() => {
  closeAccountDatabase();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  if (
    path.dirname(folder) !== path.resolve(tmpdir()) ||
    !path.basename(folder).startsWith('libretv-accounts-')
  )
    throw new Error('Unsafe cleanup path');
  rmSync(folder, { recursive: true, force: true });
});
const password = 'long-password-123';
const cookie = (token: string) => `${ACCOUNT_COOKIE}=${token}`;

describe('email accounts and stored sessions', () => {
  it('normalizes email, rejects invalid addresses and case-insensitive duplicates', async () => {
    expect(normalizeEmail('Person@Example.com')).toBe('person@example.com');
    expect(() => normalizeEmail('no-email')).toThrow();
    await registerAccount('Person@Example.com', password);
    await expect(registerAccount('person@example.com', password)).rejects.toMatchObject({
      status: 409,
    });
    await expect(registerAccount('other@example.com', 'short')).rejects.toMatchObject({
      status: 400,
    });
  });
  it('stores only a salted scrypt hash and never accepts a client-selected role', async () => {
    const user = await registerAccount('reader@example.com', password);
    expect(user.role).toBe('user');
    expect(user).not.toHaveProperty('password_hash');
    const row = accountDatabase()
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(user.id)!;
    expect(row.password_hash).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(row.password_hash).not.toContain(password);
    expect((await loginAccount('READER@EXAMPLE.COM', password)).id).toBe(user.id);
    await expect(loginAccount('reader@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
    });
    await expect(loginAccount('missing@example.com', password)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('persists sessions across reconnect and rejects tampering, expiry and logout', async () => {
    const user = await registerAccount('reader@example.com', password);
    const { token, expiresAt } = createAccountSession(user.id, true);
    const row = accountDatabase().prepare('SELECT token_hash FROM sessions').get()!;
    expect(row.token_hash).not.toBe(token);
    closeAccountDatabase();
    expect(accountFromCookie(cookie(token))?.id).toBe(user.id);
    expect(sessionFromCookieHeader(cookie(token))).toBe(true);
    expect(accountFromCookie(cookie('f'.repeat(64)))).toBe(null);
    expect(accountFromCookie(cookie('%bad'))).toBe(null);
    const now = vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1);
    expect(accountFromCookie(cookie(token))).toBe(null);
    now.mockRestore();
    revokeAccountSession(cookie(token));
    expect(accountFromCookie(cookie(token))).toBe(null);
  });
  it('revokes all devices after changing password and preserves exact password characters', async () => {
    const user = await registerAccount('reader@example.com', password);
    const first = createAccountSession(user.id, true),
      second = createAccountSession(user.id, false);
    await expect(changeAccountPassword(user.id, 'wrong', 'new-password-123')).rejects.toMatchObject(
      { status: 401 },
    );
    const next = ' space $ \\ 中文 password ';
    await changeAccountPassword(user.id, password, next);
    expect(accountFromCookie(cookie(first.token))).toBe(null);
    expect(accountFromCookie(cookie(second.token))).toBe(null);
    await expect(loginAccount(user.email, password)).rejects.toMatchObject({ status: 401 });
    expect((await loginAccount(user.email, next)).id).toBe(user.id);
  });
  it('uses fixed remember durations and bounds active device sessions', async () => {
    const user = await registerAccount('reader@example.com', password);
    const session = createAccountSession(user.id, false);
    expect(session.expiresAt - Date.now()).toBeLessThanOrEqual(86400000);
    for (let i = 0; i < 15; i++) createAccountSession(user.id, true);
    expect(accountDatabase().prepare('SELECT count(*) AS n FROM sessions').get()?.n).toBe(10);
  });
  it('allows login with registration closed and seeds the admin only once', async () => {
    vi.stubEnv('BOOTSTRAP_ADMIN_USERNAME', 'xbf');
    vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', 'test-admin-password');
    const admin = await loginAccount('xbf', 'test-admin-password');
    expect(admin.role).toBe('admin');
    expect(admin.email).toBe(null);
    vi.stubEnv('REGISTRATION_MODE', 'closed');
    await expect(registerAccount('reader@example.com', password)).rejects.toMatchObject({
      status: 403,
    });
    await changeAccountPassword(admin.id, 'test-admin-password', 'changed-admin-password');
    closeAccountDatabase();
    expect((await loginAccount('xbf', 'changed-admin-password')).role).toBe('admin');
    await expect(loginAccount('xbf', 'test-admin-password')).rejects.toMatchObject({ status: 401 });
  });
});
