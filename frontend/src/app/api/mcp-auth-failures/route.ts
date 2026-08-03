import { auth0 } from '@/lib/auth0';
import type { NextRequest } from 'next/server';

const MCP_SERVICE_URL = process.env.MCP_SERVICE_URL ?? 'http://localhost:3006';

export async function GET() {
  try { await auth0.getAccessToken(); } catch (err) {
    console.error('[api/mcp-auth-failures] getAccessToken failed:', err);
    return Response.json({ error: '認証が必要です' }, { status: 401 });
  }

  const res = await fetch(`${MCP_SERVICE_URL}/debug/auth-failures`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data);
}

export async function DELETE(req: NextRequest) {
  try { await auth0.getAccessToken(); } catch (err) {
    console.error('[api/mcp-auth-failures] getAccessToken failed:', err);
    return Response.json({ error: '認証が必要です' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  // id 無しは「全件削除」(クリア) を意味する
  const url = id
    ? `${MCP_SERVICE_URL}/debug/auth-failures/${encodeURIComponent(id)}`
    : `${MCP_SERVICE_URL}/debug/auth-failures`;

  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  return new Response(null, { status: 204 });
}
