import { auth0 } from '@/lib/auth0';

const MCP_SERVICE_URL = process.env.MCP_SERVICE_URL ?? 'http://localhost:3006';

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: '認証が必要です' }, { status: 401 });

  const res = await fetch(`${MCP_SERVICE_URL}/.well-known/oauth-protected-resource/mcp`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  const data = await res.json();

  // data.resource には MCP サーバー自身の正規URL（実際のクライアントが使う公開URL）が入っている。
  // BFF が内部的にアクセスする MCP_SERVICE_URL（クラスタ内DNS）とは異なる場合があるため、
  // 画面に表示する「実際にフェッチしたURL」は resource から組み立てる。
  let url = `${MCP_SERVICE_URL}/.well-known/oauth-protected-resource/mcp`;
  if (typeof data.resource === 'string') {
    try {
      const resourceUrl = new URL(data.resource);
      url = `${resourceUrl.origin}/.well-known/oauth-protected-resource${resourceUrl.pathname}`;
    } catch {
      // resource がURLとして無効な場合は MCP_SERVICE_URL ベースの値のままにする
    }
  }

  return Response.json({ url, data });
}
