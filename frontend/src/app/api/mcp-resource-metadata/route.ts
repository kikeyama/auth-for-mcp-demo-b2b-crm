import { auth0 } from '@/lib/auth0';
import type { NextRequest } from 'next/server';

// url は実際に発生した 401 レスポンスの WWW-Authenticate ヘッダーに含まれていた
// resource_metadata の値そのもの（クライアントが実際にディスカバリーするURL）をそのまま受け取る。
// 401の記録が無い状態でこのURLを推測・ハードコードすることはしない。
export async function GET(req: NextRequest) {
  try { await auth0.getAccessToken(); } catch (err) {
    console.error('[api/mcp-resource-metadata] getAccessToken failed:', err);
    return Response.json({ error: '認証が必要です' }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) return Response.json({ error: 'url is required' }, { status: 400 });

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  const data = await res.json();
  return Response.json({ url, data });
}
