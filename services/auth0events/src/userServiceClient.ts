import { config } from './config';
import { getSyncToken, getOrgScopedSyncToken } from './tokenClient';

export interface UserProfile {
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  email?: string | null;
  email_verified?: boolean | null;
  picture?: string | null;
  blocked?: boolean | null;
}

export interface UserRecord extends UserProfile {
  id: string;
  org_id: string;
}

async function request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${config.userServiceUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function ensureOk(res: Response, action: string): Promise<void> {
  if (!res.ok) {
    throw new Error(`${action} failed: ${res.status} ${await res.text()}`);
  }
}

// user.created: プレースホルダー行を作成/upsert（org無しトークン）
export async function createProvisional(id: string, profile: UserProfile): Promise<void> {
  const token = await getSyncToken();
  const res = await request('/users/provisional', token, {
    method: 'POST',
    body: JSON.stringify({ id, ...profile }),
  });
  await ensureOk(res, 'createProvisional');
}

// organization.member.added: 未割当行への実org割当。404なら「まだ行が無い/既に割当済み」を意味する
export async function assignOrg(id: string, orgId: string): Promise<boolean> {
  const token = await getOrgScopedSyncToken(orgId);
  const res = await request(`/users/${encodeURIComponent(id)}/org`, token, { method: 'PATCH' });
  if (res.status === 404) return false;
  await ensureOk(res, 'assignOrg');
  return true;
}

// user.updated/user.deleted: org無しトークンでの取得・更新（信頼済みクライアント専用の例外経路）
export async function getUserOrgLess(id: string): Promise<UserRecord | null> {
  const token = await getSyncToken();
  const res = await request(`/users/${encodeURIComponent(id)}`, token);
  if (res.status === 404) return null;
  await ensureOk(res, 'getUserOrgLess');
  return res.json() as Promise<UserRecord>;
}

export async function patchUserOrgLess(id: string, profile: UserProfile): Promise<void> {
  const token = await getSyncToken();
  const res = await request(`/users/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });
  await ensureOk(res, 'patchUserOrgLess');
}

// organization.member.deleted: イベントにorg_idがあるため通常のorg-scopedトークンで取得・更新
export async function getUserOrgScoped(id: string, orgId: string): Promise<UserRecord | null> {
  const token = await getOrgScopedSyncToken(orgId);
  const res = await request(`/users/${encodeURIComponent(id)}`, token);
  if (res.status === 404) return null;
  await ensureOk(res, 'getUserOrgScoped');
  return res.json() as Promise<UserRecord>;
}

export async function patchUserOrgScoped(id: string, orgId: string, profile: UserProfile): Promise<void> {
  const token = await getOrgScopedSyncToken(orgId);
  const res = await request(`/users/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });
  await ensureOk(res, 'patchUserOrgScoped');
}
