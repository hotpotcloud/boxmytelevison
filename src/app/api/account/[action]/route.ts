import {
  accountFromCookie,
  AccountError,
  ACCOUNT_COOKIE,
  registerAccount,
  loginAccount,
  createAccountSession,
  changeAccountPassword,
} from '@/lib/accounts';
import { checkRateLimit } from '@/lib/auth';
import {
  accountErrorResponse,
  assertSameOrigin,
  authJson,
  clearAuthCookies,
  cookieOptions,
  readAccountBody,
} from '@/lib/account-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ action: string }> };

export async function GET(req: Request, context: Context) {
  try {
    if ((await context.params).action !== 'me') return authJson({ error: '接口不存在' }, 404);
    const user = accountFromCookie(req.headers.get('cookie'));
    if (!user) throw new AccountError('请先登录账号', 401);
    return authJson({ user });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
export async function POST(req: Request, context: Context) {
  try {
    const { action } = await context.params;
    if (!['register', 'login', 'password'].includes(action))
      return authJson({ error: '接口不存在' }, 404);
    assertSameOrigin(req);
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (!checkRateLimit(`account:${ip}`))
      throw new AccountError('操作过于频繁，请 10 分钟后再试', 429);
    const body = await readAccountBody(req);
    if (action === 'password') {
      const user = accountFromCookie(req.headers.get('cookie'));
      if (!user) throw new AccountError('请先登录账号', 401);
      await changeAccountPassword(user.id, body.oldPassword, body.newPassword);
      const res = authJson({ success: true });
      clearAuthCookies(res, req);
      return res;
    }
    const user =
      action === 'register'
        ? await registerAccount(body.email, body.password)
        : await loginAccount(body.identifier, body.password);
    const remember = body.remember !== false;
    const session = createAccountSession(user.id, remember);
    const res = authJson({ success: true, user }, action === 'register' ? 201 : 200);
    clearAuthCookies(res, req);
    res.cookies.set(ACCOUNT_COOKIE, session.token, {
      ...cookieOptions(req),
      ...(remember ? { maxAge: Math.floor((session.expiresAt - Date.now()) / 1000) } : {}),
    });
    return res;
  } catch (error) {
    return accountErrorResponse(error);
  }
}
