import { registrationMode } from './accounts';
import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader } from './auth';

/** Explicit media routes are public; unknown and mutation routes retain authentication. */
export function guardRequest(req: Request): NextResponse | null {
  // Only audited, read-oriented browsing operations are public. Unknown routes stay protected.
  const publicRoutes: Record<string, string> = {
    '/api/search': 'POST',
    '/api/detail': 'GET',
    '/api/douban': 'GET',
    '/api/hot-list': 'GET',
    '/api/bangumi/calendar': 'GET',
    '/api/source-list': 'GET',
    '/api/live/playlist': 'GET',
    '/api/live/epg': 'GET',
    '/api/proxy': 'GET',
    '/api/live/stream': 'GET',
  };
  if (publicRoutes[new URL(req.url).pathname] === req.method) return null;
  if (sessionFromCookieHeader(req.headers.get('cookie'))) return null;
  if (!isPasswordConfigured() && registrationMode() === 'closed') {
    return NextResponse.json({ error: '服务器未设置 PASSWORD 环境变量' }, { status: 503 });
  }
  return NextResponse.json({ error: '未登录' }, { status: 401 });
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
