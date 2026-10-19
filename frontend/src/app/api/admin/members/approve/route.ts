/**
 * メンバー承認: Management APIの POST /organizations/{org_id}/members で、
 * テナント内に既に存在するユーザーを招待フローなしで直接メンバーに追加する。
 * 参照: https://auth0.com/docs/api/management/v2/organizations/post-members
 * （My Organization APIにはこの操作に対応するエンドポイントがない。
 *   既存ユーザーの直接追加はManagement API専用の機能。）
 */

import { auth0 } from '@/lib/auth0';
import { getManagementApiToken } from '@/lib/managementApiToken';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: '認証が必要です' }, { status: 401 });
  }
  const orgId = session.user.org_id;
  if (!orgId) {
    return Response.json({ error: 'Organizationが特定できません' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const userIds: unknown = body?.user_ids;
  if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every((id) => typeof id === 'string')) {
    return Response.json({ error: 'user_ids（文字列配列）が必要です' }, { status: 400 });
  }

  let token: string;
  try {
    token = await getManagementApiToken();
  } catch (err) {
    console.error('[api/admin/members/approve] failed to get Management API token:', err);
    return Response.json({ error: 'Management APIトークンの取得に失敗しました' }, { status: 500 });
  }

  const res = await fetch(`https://${process.env.AUTH0_DOMAIN}/api/v2/organizations/${orgId}/members`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ members: userIds }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(data, { status: res.status });
  }

  return new Response(null, { status: 204 });
}
