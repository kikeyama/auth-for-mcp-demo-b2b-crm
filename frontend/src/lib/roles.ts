/**
 * ID TokenのカスタムクレームにセットされたOrganizationロール（Admin/Dev）を読み取る。
 * クレーム自体はAuth0側のPost-Login Action（event.authorization.rolesをnamespaced
 * custom claimとしてID Tokenにセットする）で付与される。namespace（例: https://nexuscrm.com）は
 * テナントごとに異なり得るため環境変数で指定するが、クレームのパス部分（/roles）は固定。
 * 参照: https://support.auth0.com/center/s/article/add-roles-and-permissions-to-the-id-token-using-actions
 */

// next.config.jsのenvでNEXT_PUBLIC_AUTH0_ROLES_NAMESPACEとして公開しているため、
// サーバー・クライアントどちらからも同じ値を参照できる。
const ROLES_NAMESPACE = process.env.NEXT_PUBLIC_AUTH0_ROLES_NAMESPACE;
export const ROLES_CLAIM = ROLES_NAMESPACE ? `${ROLES_NAMESPACE}/roles` : undefined;

export const TENANT_ADMIN_ROLE = 'Admin';
export const DEV_ROLE = 'Dev';

export function getRolesFromUser(user: Record<string, unknown> | null | undefined): string[] {
  if (!user || !ROLES_CLAIM) return [];
  const value = user[ROLES_CLAIM];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

export function hasRole(user: Record<string, unknown> | null | undefined, role: string): boolean {
  return getRolesFromUser(user).includes(role);
}
