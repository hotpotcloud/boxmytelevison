import { registrationMode } from './accounts';
import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader } from './auth';

/** API Route 共享守卫：未配置密码返回 503，未登录返回 401 */
export function guardRequest(req: Request): NextResponse | null {
  if (sessionFromCookieHeader(req.headers.get('cookie'))) return null;
  if (!isPasswordConfigured() && registrationMode() === 'closed') {
    return NextResponse.json({ error: '服务器未设置 PASSWORD 环境变量' }, { status: 503 });
  }
  return NextResponse.json({ error: '未登录' }, { status: 401 });
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
