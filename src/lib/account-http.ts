import { NextResponse } from 'next/server';
import { AccountError, ACCOUNT_COOKIE } from './accounts';

export function assertSameOrigin(req: Request) {
  if (req.headers.get('sec-fetch-site') === 'cross-site')
    throw new AccountError('不允许跨站请求', 403);
  const origin = req.headers.get('origin');
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw new AccountError('请求来源无效', 403);
    }
    if (host !== (req.headers.get('host') || new URL(req.url).host))
      throw new AccountError('不允许跨站请求', 403);
  }
}
export async function readAccountBody(req: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.startsWith('application/json'))
    throw new AccountError('请使用 JSON 提交', 415);
  const reader = req.body?.getReader();
  if (!reader) throw new AccountError('请求内容不能为空');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new AccountError('请求内容过大', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('Invalid JSON object');
    return body;
  } catch {
    throw new AccountError('请求格式错误');
  }
}
export function authJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function cookieOptions(req: Request) {
  const secure =
    process.env.COOKIE_SECURE === 'true'
      ? true
      : process.env.COOKIE_SECURE === 'false'
        ? false
        : (req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
            new URL(req.url).protocol.replace(':', '')) === 'https';
  return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
}
export function clearAuthCookies(res: NextResponse, req: Request) {
  for (const name of [ACCOUNT_COOKIE, 'ltv_session'])
    res.cookies.set(name, '', { ...cookieOptions(req), maxAge: 0 });
}
export function accountErrorResponse(error: unknown) {
  if (error instanceof AccountError) return authJson({ error: error.message }, error.status);
  console.error('Account operation failed', error);
  return authJson({ error: '账号服务暂时不可用，请稍后重试' }, 503);
}
