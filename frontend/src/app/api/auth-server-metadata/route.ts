import { auth0 } from '@/lib/auth0';
import type { NextRequest } from 'next/server';

// issuer は Protected Resource Metadata の authorization_servers[0]
// （クライアントが実際に発見した認可サーバーの URL）をそのまま受け取る。
export async function GET(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: '認証が必要です' }, { status: 401 });

  const issuer = req.nextUrl.searchParams.get('issuer');
  if (!issuer || !issuer.startsWith('https://')) {
    return Response.json({ error: 'issuer (https URL) is required' }, { status: 400 });
  }

  const base = issuer.endsWith('/') ? issuer : `${issuer}/`;
  const url = `${base}.well-known/oauth-authorization-server`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  const data = await res.json();
  return Response.json({ url, data });
}
