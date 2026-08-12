import {
  createProvisional, assignOrg, getUserOrgLess, patchUserOrgLess, getUserOrgScoped, patchUserOrgScoped,
  UserProfile, UserRecord,
} from './userServiceClient';

export interface Auth0Event {
  type: string;
  data?: { object?: Record<string, unknown> };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// イベントに実際に含まれているプロフィール系フィールドだけを返す。
// 無いフィールド（例: user.updated には email_verified が来ない）で既存値を消さないため、
// 存在するキーだけをマージ対象にする。
function presentProfileFields(obj: Record<string, unknown>): Partial<UserProfile> {
  const fields: Partial<UserProfile> = {};
  if ('name' in obj)           fields.name = str(obj.name) ?? null;
  if ('given_name' in obj)     fields.given_name = str(obj.given_name) ?? null;
  if ('family_name' in obj)    fields.family_name = str(obj.family_name) ?? null;
  if ('email' in obj)          fields.email = str(obj.email) ?? null;
  if ('email_verified' in obj) fields.email_verified = typeof obj.email_verified === 'boolean' ? obj.email_verified : null;
  if ('picture' in obj)        fields.picture = str(obj.picture) ?? null;
  if ('blocked' in obj)        fields.blocked = typeof obj.blocked === 'boolean' ? obj.blocked : null;
  return fields;
}

function existingProfile(existing: UserRecord): UserProfile {
  return {
    name: existing.name ?? null,
    given_name: existing.given_name ?? null,
    family_name: existing.family_name ?? null,
    email: existing.email ?? null,
    email_verified: existing.email_verified ?? null,
    picture: existing.picture ?? null,
    blocked: existing.blocked ?? null,
  };
}

function orgMember(obj: Record<string, unknown>): { userId?: string; orgId?: string } {
  const user = obj.user as Record<string, unknown> | undefined;
  const organization = obj.organization as Record<string, unknown> | undefined;
  return { userId: str(user?.user_id), orgId: str(organization?.id) };
}

export async function handleEvent(event: Auth0Event): Promise<void> {
  const obj = event.data?.object ?? {};

  switch (event.type) {
    case 'user.created': {
      const userId = str(obj.user_id);
      if (!userId) return;
      await createProvisional(userId, presentProfileFields(obj));
      return;
    }

    case 'organization.member.added': {
      const { userId, orgId } = orgMember(obj);
      if (!userId || !orgId) return;
      const assigned = await assignOrg(userId, orgId);
      if (!assigned) {
        // プレースホルダー行が無い（user.createdの取りこぼし・配信順序の入れ替わり）
        // → 空プロフィールで作成してから割当し直す
        await createProvisional(userId, {});
        await assignOrg(userId, orgId);
      }
      return;
    }

    // イベントに organization.id が含まれるため、通常のorg-scopedトークンで処理できる
    case 'organization.member.deleted': {
      const { userId, orgId } = orgMember(obj);
      if (!userId || !orgId) return;
      const existing = await getUserOrgScoped(userId, orgId);
      if (!existing) return;
      await patchUserOrgScoped(userId, orgId, { ...existingProfile(existing), blocked: true });
      return;
    }

    // org_idがペイロードに無いため、org無しトークン（信頼済みクライアント専用の例外経路）で処理する
    case 'user.updated': {
      const userId = str(obj.user_id);
      if (!userId) return;
      const existing = await getUserOrgLess(userId);
      if (!existing) return; // org未確定のユーザーは追わない
      await patchUserOrgLess(userId, { ...existingProfile(existing), ...presentProfileFields(obj) });
      return;
    }

    case 'user.deleted': {
      const userId = str(obj.user_id);
      if (!userId) return;
      const existing = await getUserOrgLess(userId);
      if (!existing) return;
      await patchUserOrgLess(userId, { ...existingProfile(existing), blocked: true });
      return;
    }

    default:
      return;
  }
}
