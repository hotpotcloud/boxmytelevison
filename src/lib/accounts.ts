import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { accountDatabase } from './account-db';

export const ACCOUNT_COOKIE = 'ltv_account';
const DAY = 86400000;
export interface AccountUser {
  id: string;
  email: string | null;
  username: string | null;
  role: 'user' | 'admin';
  createdAt: number;
}
interface UserRow {
  id: string;
  email: string | null;
  username: string | null;
  role: 'user' | 'admin';
  password_hash: string;
  created_at: number;
}
export class AccountError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function registrationMode(): 'open' | 'closed' {
  return process.env.REGISTRATION_MODE === 'closed' ? 'closed' : 'open';
}
function publicUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}
export function accountCount(): number {
  return Number(accountDatabase().prepare('SELECT count(*) AS n FROM users').get()?.n || 0);
}
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254)
    throw new AccountError('请输入有效的邮箱地址');
  const email = value.trim().toLowerCase();
  if (
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
      email,
    )
  ) {
    throw new AccountError('请输入有效的邮箱地址');
  }
  return email;
}
function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new AccountError('密码长度需为 8–128 个字符');
  }
}
let activeDerivations = 0;
async function derive(password: string, salt: string): Promise<Buffer> {
  // Two 16MiB scrypt operations at most; reject rather than build an unbounded queue.
  if (activeDerivations >= 2) throw new AccountError('当前登录请求较多，请稍后重试', 429);
  activeDerivations++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
        err ? reject(err) : resolve(key),
      );
    });
  } finally {
    activeDerivations--;
  }
}
async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
async function passwordMatches(password: string, encoded?: string): Promise<boolean> {
  const parts = encoded?.split(':');
  const valid =
    parts?.length === 3 &&
    parts[0] === 'scrypt' &&
    /^[a-f0-9]{32}$/.test(parts[1]) &&
    /^[a-f0-9]{128}$/.test(parts[2]);
  const key = await derive(password, valid ? parts![1] : '00000000000000000000000000000000');
  const expected = valid ? Buffer.from(parts![2], 'hex') : Buffer.alloc(64);
  return timingSafeEqual(key, expected) && !!valid;
}
export async function registerAccount(
  emailValue: unknown,
  password: unknown,
): Promise<AccountUser> {
  if (registrationMode() === 'closed') throw new AccountError('目前暂停注册', 403);
  const email = normalizeEmail(emailValue);
  validatePassword(password);
  const hash = await passwordHash(password);
  const db = accountDatabase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    throw new AccountError('该邮箱已注册，请直接登录', 409);
  const id = randomBytes(16).toString('hex');
  const createdAt = Date.now();
  try {
    db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      email,
      hash,
      createdAt,
    );
  } catch (error) {
    if (String(error).includes('UNIQUE constraint'))
      throw new AccountError('该邮箱已注册，请直接登录', 409);
    throw error;
  }
  return { id, email, username: null, role: 'user', createdAt };
}
export async function loginAccount(identifier: unknown, password: unknown): Promise<AccountUser> {
  if (
    typeof identifier !== 'string' ||
    identifier.length > 254 ||
    typeof password !== 'string' ||
    password.length > 128
  ) {
    throw new AccountError('邮箱或密码不正确', 401);
  }
  const row = accountDatabase()
    .prepare('SELECT * FROM users WHERE email = ? OR username = ?')
    .get(identifier.trim().toLowerCase(), identifier.trim().toLowerCase()) as unknown as
    UserRow | undefined;
  if (!(await passwordMatches(password, row?.password_hash)) || !row)
    throw new AccountError('邮箱或密码不正确', 401);
  return publicUser(row);
}
function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function createAccountSession(userId: string, remember: boolean) {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + (remember ? 90 : 1) * DAY;
  const db = accountDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    db.prepare(
      'DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 9)',
    ).run(userId, userId);
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(
      tokenHash(token),
      userId,
      now,
      expiresAt,
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { token, expiresAt };
}
export function accountToken(cookieHeader: string | null): string | null {
  for (const part of (cookieHeader || '').split(';')) {
    const at = part.indexOf('=');
    if (part.slice(0, at).trim() === ACCOUNT_COOKIE) {
      const token = part.slice(at + 1).trim();
      return /^[a-f0-9]{64}$/.test(token) ? token : null;
    }
  }
  return null;
}
export function accountFromCookie(cookie: string | null): AccountUser | null {
  const token = accountToken(cookie);
  if (!token) return null;
  const row = accountDatabase()
    .prepare(
      'SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?',
    )
    .get(tokenHash(token), Date.now()) as unknown as UserRow | undefined;
  return row ? publicUser(row) : null;
}
export function revokeAccountSession(cookie: string | null) {
  const token = accountToken(cookie);
  if (token)
    accountDatabase().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}
export async function changeAccountPassword(
  userId: string,
  oldPassword: unknown,
  newPassword: unknown,
) {
  validatePassword(newPassword);
  if (typeof oldPassword !== 'string' || oldPassword.length > 128)
    throw new AccountError('当前密码不正确', 401);
  const db = accountDatabase();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as
    UserRow | undefined;
  if (!row || !(await passwordMatches(oldPassword, row.password_hash)))
    throw new AccountError('当前密码不正确', 401);
  const hash = await passwordHash(newPassword);
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?')
      .run(hash, userId, row.password_hash);
    if (Number(result.changes) !== 1) throw new AccountError('账号已更新，请重新登录', 409);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
