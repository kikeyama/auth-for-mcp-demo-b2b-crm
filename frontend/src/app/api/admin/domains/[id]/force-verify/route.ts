/**
 * デモ用: Organization Domain（My Organization APIの/domainsと同一リソース）を
 * 実際のDNS TXTレコード検証を経ずに強制的にverified扱いにする。
 *
 * My Organization API自体にはstatusを直接書き込む手段がないが、Management API
 * （/api/v2/organizations/{org_id}/discovery-domains/{id}）側では直接書き込める。
 * 詳細はCLAUDE.mdの「My Organization API — Identity Provider / Domain management」を参照。
 */

import { auth0 } from '@/lib/auth0';
import { getManagementApiToken } from '@/lib/managementApiToken';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: '認証が必要です' }, { status: 401 });
  }
  const orgId = session.user.org_id;
  if (!orgId) {
    return Response.json({ error: 'Organizationが特定できません' }, { status: 400 });
  }

  const { id } = await params;

  let token: string;
  try {
    token = await getManagementApiToken();
  } catch (err) {
    console.error('[api/admin/domains/force-verify] failed to get Management API token:', err);
    return Response.json({ error: 'Management APIトークンの取得に失敗しました' }, { status: 500 });
  }

  const res = await fetch(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/organizations/${orgId}/discovery-domains/${id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'verified' }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return Response.json(body, { status: res.status });
  }

  const data = await res.json();
  return Response.json(data);
}
