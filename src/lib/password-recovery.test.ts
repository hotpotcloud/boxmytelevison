import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { accountDatabase, closeAccountDatabase } from './account-db';
import { registerAccount, loginAccount, createAccountSession, accountFromCookie } from './accounts';
const { resetAccountPassword } = createRequire(import.meta.url)(
  '../../deploy/reset-password.cjs',
) as {
  resetAccountPassword: (input: {
    databasePath: string;
    identifier: string;
    password: string;
  }) => void;
};
let folder: string, filename: string;
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'muu-recovery-'));
  filename = path.join(folder, 'accounts.sqlite');
  vi.stubEnv('DATABASE_PATH', filename);
  vi.stubEnv('REGISTRATION_MODE', 'open');
  vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', '');
});
afterEach(() => {
  closeAccountDatabase();
  vi.unstubAllEnvs();
  if (
    path.dirname(folder) !== path.resolve(tmpdir()) ||
    !path.basename(folder).startsWith('muu-recovery-')
  )
    throw new Error('Unsafe cleanup');
  rmSync(folder, { recursive: true, force: true });
});
describe('server password recovery', () => {
  it('changes the password, revokes all devices and preserves profile and unrelated accounts', async () => {
    const user = await registerAccount('recover@example.com', 'old-test-password');
    const other = await registerAccount('other@example.com', 'other-test-password');
    const one = createAccountSession(user.id, true),
      two = createAccountSession(user.id, false),
      unrelated = createAccountSession(other.id, true);
    accountDatabase()
      .prepare('INSERT INTO user_source_profiles VALUES (?, ?, 1, ?)')
      .run(user.id, '{"customAPIs":[]}', Date.now());
    const before = accountDatabase()
      .prepare('SELECT id,email,role,created_at FROM users WHERE id=?')
      .get(user.id);
    resetAccountPassword({
      databasePath: filename,
      identifier: 'RECOVER@example.com',
      password: '  new-test-password..  ',
    });
    await expect(loginAccount(user.email, 'old-test-password')).rejects.toMatchObject({
      status: 401,
    });
    expect((await loginAccount(user.email, '  new-test-password..  ')).id).toBe(user.id);
    expect(accountFromCookie('ltv_account=' + one.token)).toBe(null);
    expect(accountFromCookie('ltv_account=' + two.token)).toBe(null);
    expect(accountFromCookie('ltv_account=' + unrelated.token)?.id).toBe(other.id);
    expect(
      accountDatabase()
        .prepare('SELECT id,email,role,created_at FROM users WHERE id=?')
        .get(user.id),
    ).toEqual(before);
    expect(
      accountDatabase()
        .prepare('SELECT config_json FROM user_source_profiles WHERE user_id=?')
        .get(user.id)?.config_json,
    ).toBe('{"customAPIs":[]}');
  });
  it('can recover the seeded administrator without resetting it again on app startup', async () => {
    vi.stubEnv('BOOTSTRAP_ADMIN_USERNAME', 'qa-recovery-admin');
    vi.stubEnv('BOOTSTRAP_ADMIN_PASSWORD', 'test-bootstrap-password');
    accountDatabase();
    resetAccountPassword({
      databasePath: filename,
      identifier: 'qa-recovery-admin',
      password: 'test-recovered-admin',
    });
    closeAccountDatabase();
    expect((await loginAccount('qa-recovery-admin', 'test-recovered-admin')).role).toBe('admin');
    await expect(
      loginAccount('qa-recovery-admin', 'test-bootstrap-password'),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('rejects missing accounts, short passwords, absent databases and noninteractive CLI', async () => {
    const user = await registerAccount('safe@example.com', 'old-test-password'),
      token = createAccountSession(user.id, true).token;
    expect(() =>
      resetAccountPassword({
        databasePath: filename,
        identifier: 'missing@example.com',
        password: 'new-test-password',
      }),
    ).toThrow('账号不存在');
    expect(() =>
      resetAccountPassword({ databasePath: filename, identifier: user.email!, password: 'short' }),
    ).toThrow('8–128');
    const missing = path.join(folder, 'missing.sqlite');
    expect(() =>
      resetAccountPassword({
        databasePath: missing,
        identifier: user.email!,
        password: 'new-test-password',
      }),
    ).toThrow('数据库不存在');
    expect(existsSync(missing)).toBe(false);
    const cli = spawnSync(
      process.execPath,
      [path.resolve('deploy/reset-password.cjs'), user.email!],
      { input: 'ignored-password\n', encoding: 'utf8' },
    );
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('交互式 SSH');
    expect(accountFromCookie('ltv_account=' + token)?.id).toBe(user.id);
    expect((await loginAccount(user.email, 'old-test-password')).id).toBe(user.id);
  });
});
