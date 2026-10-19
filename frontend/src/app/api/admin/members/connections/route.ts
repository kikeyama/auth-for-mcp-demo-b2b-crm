/**
 * Organizationに有効化されているDatabase Connection（ユーザーストア）一覧を取得する。
 *
 * POST /my-org/member-invitations は identity_provider_id（外部IdP、My Organization
 * APIの/identity-providersで取得可能）か user_store_id のいずれかを必須とするが、
 * user_store_id（Database Connectionの接続ID）を返すMy Organization APIのエンドポイントは
 * 存在しない。Management APIの GET /api/v2/organizations/{org_id}/enabled_connections
 * （strategy: "auth0" がDatabase Connection）側だけがこの情報を持つため、ここだけ
 * Management APIを使う。
 * 参照: https://auth0.com/docs/api/management/v2/organizations/get-enabled-connections
 */

import { auth0 } from '@/lib/auth0';
import { getManagementApiToken } from '@/lib/managementApiToken';

interface EnabledConnection {
  connection_id: string;
  connection: { name: string; strategy: string };
}

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: '認証が必要です' }, { status: 401 });
  }
  const orgId = session.user.org_id;
  if (!orgId) {
    return Response.json({ error: 'Organizationが特定できません' }, { status: 400 });
  }

  let token: string;
  try {
    token = await getManagementApiToken();
  } catch (err) {
    console.error('[api/admin/members/connections] failed to get Management API token:', err);
    return Response.json({ error: 'Management APIトークンの取得に失敗しました' }, { status: 500 });
  }

  const res = await fetch(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/organizations/${orgId}/enabled_connections`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  const connections = (await res.json()) as EnabledConnection[];
  // strategyは常に"auth0"（Database Connection = ユーザーストア）に絞っているため、
  // ここでは個々の実装名（例: "Username-Password-Authentication"）をnameとして返し、
  // ユーザー向けの"パスワード"ラベルへの変換はクライアント側（strategyLabel）に委ねる。
  const userStores = connections
    .filter((c) => c.connection.strategy === 'auth0')
    .map((c) => ({ id: c.connection_id, name: c.connection.name, strategy: c.connection.strategy }));

  return Response.json({ userStores });
}
