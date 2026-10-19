// My Organization API（Early Access）のメンバー管理リソース。
// 参照: https://auth0.com/docs/oas/myorganization/myorganization-api-oas.json

export type OrganizationMemberAccessLevel = 'none' | 'readonly' | 'limited' | 'full';

export interface MemberRole {
  id: string;
  name: string;
  description?: string;
}

export interface OrganizationMember {
  user_id: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
  access_level: OrganizationMemberAccessLevel;
  phone_number?: string;
  email?: string;
  name?: string;
  picture?: string;
  // read:my_org:member_rolesスコープがない場合はレスポンスに含まれない。
  roles?: MemberRole[];
}

export interface MemberInvitation {
  id: string;
  organization_id: string;
  inviter?: { name?: string };
  invitee: { email: string };
  identity_provider_id?: string;
  user_store_id?: string;
  created_at: string;
  expires_at: string;
  roles?: string[];
  invitation_url?: string;
}

export interface CreateMemberInvitationInput {
  invitees: { email: string; roles?: string[] }[];
  inviter?: { name: string };
  identity_provider_id?: string;
  user_store_id?: string;
  ttl_sec?: number;
}

// Management APIの GET /users?q=email.domain:"..." で検索した、まだOrganizationの
// メンバーではないがOrganization検証済みドメインのメールアドレスを持つテナント内ユーザー。
export interface MemberCandidate {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  matched_domain: string;
}
