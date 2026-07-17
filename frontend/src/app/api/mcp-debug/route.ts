import { auth0 } from '@/lib/auth0';
import type { NextRequest } from 'next/server';

const MCP_SERVICE_URL = process.env.MCP_SERVICE_URL ?? 'http://localhost:3006';

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: '認証が必要です' }, { status: 401 });

  const res = await fetch(`${MCP_SERVICE_URL}/debug/tokens`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: '認証が必要です' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const res = await fetch(`${MCP_SERVICE_URL}/debug/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  return new Response(null, { status: 204 });
}
