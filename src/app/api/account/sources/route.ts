import { accountFromCookie, AccountError } from '@/lib/accounts';
import { accountDatabase } from '@/lib/account-db';
import {
  accountErrorResponse,
  assertSameOrigin,
  authJson,
  readAccountBody,
} from '@/lib/account-http';
import { emptySourceProfile, parseSourceProfile } from '@/lib/source-profile';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function requireUser(req: Request) {
  const user = accountFromCookie(req.headers.get('cookie'));
  if (!user) throw new AccountError('请先登录账号', 401);
  return user;
}
export async function GET(req: Request) {
  try {
    const user = requireUser(req);
    const row = accountDatabase()
      .prepare(
        'SELECT config_json, revision, updated_at FROM user_source_profiles WHERE user_id = ?',
      )
      .get(user.id) as { config_json: string; revision: number; updated_at: number } | undefined;
    return authJson(
      row
        ? { config: JSON.parse(row.config_json), revision: row.revision, updatedAt: row.updated_at }
        : { config: emptySourceProfile(), revision: 0, updatedAt: null },
    );
  } catch (error) {
    return accountErrorResponse(error);
  }
}
export async function PUT(req: Request) {
  try {
    const user = requireUser(req);
    assertSameOrigin(req);
    const body = await readAccountBody(req, 262144);
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0)
      throw new AccountError('配置版本无效');
    let config;
    try {
      config = parseSourceProfile(body.config);
    } catch (error) {
      throw new AccountError(error instanceof Error ? error.message : '源配置无效');
    }
    const db = accountDatabase(),
      revision = Number(body.revision),
      now = Date.now(),
      json = JSON.stringify(config);
    const result =
      revision === 0
        ? db
            .prepare(
              'INSERT OR IGNORE INTO user_source_profiles(user_id, config_json, revision, updated_at) VALUES (?, ?, 1, ?)',
            )
            .run(user.id, json, now)
        : db
            .prepare(
              'UPDATE user_source_profiles SET config_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?',
            )
            .run(json, now, user.id, revision);
    if (!result.changes)
      return authJson({ error: '另一台设备已更新源配置，请先载入云端版本', conflict: true }, 409);
    return authJson({ config, revision: revision + 1, updatedAt: now });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
