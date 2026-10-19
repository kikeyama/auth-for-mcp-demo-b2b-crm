/**
 * メンバー承認候補の検索: テナント全体のユーザーのうち、Organizationで検証済みの
 * ドメインのメールアドレスを持つユーザーを、Management APIのLucene検索
 * （`email.domain:"..."`、完全一致）で探す。My Organization APIにはテナント全体の
 * ユーザー検索機能がないため、ここだけManagement APIを使う。
 * 参照: https://auth0.com/docs/manage-users/user-search/user-search-query-syntax
 *       （`email.domain:"example.com"` の例）
 */

import { auth0 } from '@/lib/auth0';
import { getManagementApiToken } from '@/lib/managementApiToken';
import type { NextRequest } from 'next/server';
import type { MemberCandidate } from '@/types/member';

interface ManagementApiUser {
  user_id: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export async function GET(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: '認証が必要です' }, { status: 401 });
  }

  const domainsParam = req.nextUrl.searchParams.get('domains');
  const domains = domainsParam ? domainsParam.split(',').map((d) => d.trim()).filter(Boolean) : [];
  if (domains.length === 0) {
    return Response.json({ candidates: [] });
  }

  let token: string;
  try {
    token = await getManagementApiToken();
  } catch (err) {
    console.error('[api/admin/members/candidates] failed to get Management API token:', err);
    return Response.json({ error: 'Management APIトークンの取得に失敗しました' }, { status: 500 });
  }

  try {
    const resultsByDomain = await Promise.all(
      domains.map(async (domain) => {
        const q = `email.domain:"${domain}"`;
        const url = new URL(`https://${process.env.AUTH0_DOMAIN}/api/v2/users`);
        url.searchParams.set('q', q);
        url.searchParams.set('search_engine', 'v3');
        url.searchParams.set('per_page', '100');
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`Management API error (${domain}): ${res.status} ${await res.text()}`);
        }
        const users = (await res.json()) as ManagementApiUser[];
        return users.map<MemberCandidate>((u) => ({
          user_id: u.user_id,
          email: u.email ?? '',
          name: u.name,
          picture: u.picture,
          email_verified: u.email_verified,
          matched_domain: domain,
        }));
      }),
    );

    // 同一ユーザーが複数ドメインに一致する場合は重複を除く。
    const candidatesById = new Map<string, MemberCandidate>();
    for (const candidate of resultsByDomain.flat()) {
      if (!candidatesById.has(candidate.user_id)) candidatesById.set(candidate.user_id, candidate);
    }

    return Response.json({ candidates: [...candidatesById.values()] });
  } catch (err) {
    console.error('[api/admin/members/candidates] search failed:', err);
    return Response.json({ error: '候補ユーザーの検索に失敗しました' }, { status: 500 });
  }
}
