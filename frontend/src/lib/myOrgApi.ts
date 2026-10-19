/**
 * My Organization API（Early Access）を呼び出すクライアントサイド専用のフェッチユーティリティ。
 *
 * BFF（/api/*）を経由せず、Next.jsミドルウェア（src/proxy.ts）が提供する
 * SDK組み込みプロキシ（/my-org/*）に直接fetchする。アクセストークンの取得・
 * リフレッシュ・付与はミドルウェア側がaudience（https://{AUTH0_DOMAIN}/my-org/）に
 * 対して自動的に行うため、ここでは `scope` ヘッダーでリクエストごとに必要な
 * スコープを渡すだけでよい。
 * 参照: https://github.com/auth0/nextjs-auth0/blob/main/EXAMPLES.md
 *       ("Proxy Handler for My Account and My Organization APIs")
 */

import type {
  CreateIdentityProviderInput,
  IdentityProvider,
  OrganizationDomain,
  ProvisioningConfig,
  ScimToken,
  ScimTokenWithSecret,
  UpdateIdentityProviderInput,
} from '@/types/identityProvider';
import type {
  CreateMemberInvitationInput,
  MemberCandidate,
  MemberInvitation,
  MemberRole,
  OrganizationMember,
} from '@/types/member';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class MyOrgApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'MyOrgApiError';
  }
}

async function request<T>(method: Method, path: string, scope: string, body?: unknown): Promise<T> {
  const res = await fetch(`/my-org${path}`, {
    method,
    headers: {
      scope,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  // SDK組み込みプロキシ（/my-org/*）は、アクセストークン取得自体に失敗した場合
  // （audienceへのscope未許可、client grant未設定など）、JSONではなくOAuth2Errorの
  // プレーンテキスト（またはメッセージのみ）を500で返す。My Org API自体が返す
  // エラーレスポンス（JSON、ValidationErrorBadRequestResponse等）とは形式が異なるため、
  // JSON.parseを無条件に投げず、まずJSONかどうかを判定する。
  let data: Record<string, unknown> | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    if (!res.ok) throw new MyOrgApiError(text || `HTTP ${res.status}`, res.status);
    throw new Error('予期しない形式のレスポンスを受信しました');
  }
  if (!res.ok) {
    // My Org API自体のエラーはRFC 9457形式（{status, type, title, detail}）。
    const message = (data?.detail ?? data?.message ?? data?.error ?? data?.error_description) as string | undefined;
    throw new MyOrgApiError(message ?? `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

interface ListIdentityProvidersResponse {
  identity_providers: IdentityProvider[];
}

interface ListOrganizationDomainsResponse {
  organization_domains: OrganizationDomain[];
  next?: string;
}

interface ListScimTokensResponse {
  scim_tokens: ScimToken[];
}

interface ListMembersResponse {
  members: OrganizationMember[];
  next?: string;
}

interface ListMemberInvitationsResponse {
  invitations: MemberInvitation[];
  next?: string;
}

interface ListRolesResponse {
  roles: MemberRole[];
  next?: string;
}

interface ListMemberRolesResponse {
  roles: MemberRole[];
  next?: string;
}

export const myOrgApi = {
  identityProviders: {
    list: () =>
      request<ListIdentityProvidersResponse>('GET', '/identity-providers', 'read:my_org:identity_providers'),
    get: (id: string) =>
      request<IdentityProvider>('GET', `/identity-providers/${id}`, 'read:my_org:identity_providers'),
    create: (body: CreateIdentityProviderInput) =>
      request<IdentityProvider>('POST', '/identity-providers', 'create:my_org:identity_providers', body),
    update: (id: string, body: UpdateIdentityProviderInput) => {
      // optionsの全フィールドが未入力（undefined）の場合、空オブジェクトとして
      // 送信するとAPI側が無意味な更新要求と見なす可能性があるため、キー自体を省く。
      const { options, ...rest } = body;
      const hasOptionsChange = options && Object.values(options).some((v) => v !== undefined);
      const payload = hasOptionsChange ? { ...rest, options } : rest;
      return request<IdentityProvider>('PATCH', `/identity-providers/${id}`, 'update:my_org:identity_providers', payload);
    },
    delete: (id: string) =>
      request<void>('DELETE', `/identity-providers/${id}`, 'delete:my_org:identity_providers'),
  },
  domains: {
    list: () =>
      request<ListOrganizationDomainsResponse>('GET', '/domains', 'read:my_org:domains'),
    create: (domain: string) =>
      request<OrganizationDomain>('POST', '/domains', 'create:my_org:domains', { domain }),
    delete: (id: string) =>
      request<void>('DELETE', `/domains/${id}`, 'delete:my_org:domains'),
    // DNS TXTレコードの検証を開始する（202、更新後のOrgDomainを返す）。
    // 検証完了を待たず即座に返るため、呼び出し側は一覧を再取得してstatusの変化を確認する。
    verify: (id: string) =>
      request<OrganizationDomain>('POST', `/domains/${id}/verify`, 'update:my_org:domains'),
    // デモ用: DNS検証を経ずに強制的にverified扱いにする。/my-org/*のSDKプロキシではなく、
    // サーバー専用のBFFルート（Management APIをclient_credentialsで呼ぶ）経由。
    forceVerify: async (id: string): Promise<void> => {
      const res = await fetch(`/api/admin/domains/${id}/force-verify`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
      }
    },
  },
  provisioning: {
    get: (idpId: string) =>
      request<ProvisioningConfig>(
        'GET',
        `/identity-providers/${idpId}/provisioning`,
        'read:my_org:identity_providers_provisioning',
      ),
    // SCIM Provisioningを有効化する。リクエストボディはなし（methodは常にscim固定）。
    create: (idpId: string) =>
      request<ProvisioningConfig>(
        'POST',
        `/identity-providers/${idpId}/provisioning`,
        'create:my_org:identity_providers_provisioning',
      ),
    delete: (idpId: string) =>
      request<void>(
        'DELETE',
        `/identity-providers/${idpId}/provisioning`,
        'delete:my_org:identity_providers_provisioning',
      ),
    // 属性マッピング（user_id_attributeを含む）をUser Attribute Profile（Applicationの
    // my_organization_configuration.user_attribute_profile_idが指すリソース）の定義に
    // 基づいて再計算・上書きする「リフレッシュ」専用の操作。OpenAPI仕様通りEmptyBody
    // （リクエストボディはAPI側で無視される）で、個別マッピングの自由編集はできない。
    // マッピング自体を変えるにはUser Attribute Profile側を変更する必要がある。
    resetAttributes: (idpId: string) =>
      request<ProvisioningConfig>(
        'PUT',
        `/identity-providers/${idpId}/provisioning/update-attributes`,
        'update:my_org:identity_providers_provisioning',
      ),
    scimTokens: {
      list: (idpId: string) =>
        request<ListScimTokensResponse>(
          'GET',
          `/identity-providers/${idpId}/provisioning/scim-tokens`,
          'read:my_org:identity_providers_scim_tokens',
        ),
      // 生のトークン文字列（token）はこのレスポンスにのみ含まれ、一覧取得時には含まれない。
      // token_lifetimeは任意だが、request()はbodyがundefinedだとボディ自体を送らない
      // （Content-Typeも付かない）ため、API側に「bodyがオブジェクトでない」と判定され
      // 400になる。未指定時も明示的に空オブジェクトを送る。
      create: (idpId: string, tokenLifetimeSeconds?: number) =>
        request<ScimTokenWithSecret>(
          'POST',
          `/identity-providers/${idpId}/provisioning/scim-tokens`,
          'create:my_org:identity_providers_scim_tokens',
          tokenLifetimeSeconds ? { token_lifetime: tokenLifetimeSeconds } : {},
        ),
      delete: (idpId: string, tokenId: string) =>
        request<void>(
          'DELETE',
          `/identity-providers/${idpId}/provisioning/scim-tokens/${tokenId}`,
          'delete:my_org:identity_providers_scim_tokens',
        ),
    },
  },
  members: {
    // read:my_org:member_rolesも併せて要求すると、各メンバーのrolesがレスポンスに含まれる
    // （read:my_org:membersのみだとrolesフィールド自体が省略される）。
    list: () => request<ListMembersResponse>('GET', '/members', 'read:my_org:members read:my_org:member_roles'),
    // DeleteOrganizationMembershipsRequestContentのmembers配列はmaxItems: 1固定
    // （「Remove one member from this Organization」が仕様上の操作単位）のため、
    // 複数人の一括削除はこの関数を呼び出し側でPromise.allするしかない。
    delete: (userId: string) =>
      request<void>('POST', '/delete-memberships', 'delete:my_org:memberships', { members: [userId] }),
    // 以下2つはMy Organization APIではなくManagement API経由（BFFルート）。
    // My Org APIには「検証済みドメインのメールを持つテナント内ユーザーを検索する」
    // 機能や「既存ユーザーを招待なしで直接追加する」機能が存在しないため。
    candidates: async (verifiedDomains: string[]): Promise<MemberCandidate[]> => {
      const res = await fetch(`/api/admin/members/candidates?domains=${encodeURIComponent(verifiedDomains.join(','))}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data.candidates ?? [];
    },
    approve: async (userIds: string[]): Promise<void> => {
      const res = await fetch('/api/admin/members/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: userIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
      }
    },
    roles: {
      list: (userId: string) =>
        request<ListMemberRolesResponse>('GET', `/members/${userId}/roles`, 'read:my_org:member_roles'),
      // role_ids配列はmaxItems: 10。アサイン・解除は別エンドポイント（差分ではなく
      // 「追加するロール」「外すロール」をそれぞれ明示的に呼び分ける必要がある）。
      assign: (userId: string, roleIds: string[]) =>
        request<void>('POST', `/members/${userId}/roles`, 'create:my_org:member_roles', { role_ids: roleIds }),
      unassign: (userId: string, roleIds: string[]) =>
        request<void>('POST', `/members/${userId}/unassign-roles`, 'delete:my_org:member_roles', { role_ids: roleIds }),
    },
  },
  roles: {
    // Organizationに紐づけ可能な（Tenant Adminが可視化した）ロール一覧。
    list: () => request<ListRolesResponse>('GET', '/roles', 'read:my_org:member_roles'),
  },
  memberInvitations: {
    list: () => request<ListMemberInvitationsResponse>('GET', '/member-invitations', 'read:my_org:member_invitations'),
    // レスポンスはラップされておらず、作成されたMemberInvitationの配列が直接返る。
    create: (body: CreateMemberInvitationInput) =>
      request<MemberInvitation[]>('POST', '/member-invitations', 'create:my_org:member_invitations', body),
    delete: (invitationId: string) =>
      request<void>(
        'POST',
        '/delete-member-invitations',
        'delete:my_org:member_invitations',
        { invitations: [invitationId] },
      ),
    // POST /member-invitationsはidentity_provider_idかuser_store_idのいずれかが必須
    // （My Organization APIの/identity-providersが返すのは外部IdP: okta等の
    // IdpStrategyEnumのみで、Auth0ネイティブのDatabase Connection（user_store_id）は
    // 対象外のため、別途Management API経由（BFFルート）で取得する）。
    userStores: async (): Promise<{ id: string; name: string; strategy: string }[]> => {
      const res = await fetch('/api/admin/members/connections');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data.userStores ?? [];
    },
  },
};
