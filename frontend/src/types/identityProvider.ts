// My Organization API（Early Access）の Identity Provider リソース。
// 対象 strategy は Okta Workforce (`okta`) のみ。
// 参照: https://auth0.com/docs/oas/myorganization/myorganization-api-oas.json

export type OrganizationAccessLevel = 'none' | 'readonly' | 'limited' | 'full';

export interface IdpOktaOptions {
  domain: string;
  client_id: string;
  icon_url?: string;
  // client_secretはレスポンスに含まれない（書き込み専用）。
}

// Cross App Access（XAA、Early Access）。有効化にはIdPのOIDC issuerドメイン
// （Oktaの場合は`<tenant>.okta.com`）がOrganizationの検証済みドメインである必要がある
// （HRDドメインの検証とは別物）。顧客側のセルフサービスDNS検証では満たせないことが多い
// （Oktaが所有するドメインのため）。docs/known-issues.md参照。
export type CrossAppAccessStatus = 'enabled' | 'disabled';

export interface CrossAppAccessResourceApp {
  status: CrossAppAccessStatus;
}

export interface IdentityProvider {
  id: string;
  name: string;
  strategy: 'okta';
  display_name: string;
  domains: string[];
  show_as_button: boolean;
  assign_membership_on_login: boolean;
  is_enabled: boolean;
  access_level: OrganizationAccessLevel;
  options: IdpOktaOptions;
  // Connection ProfileでXAAが許可されていない場合はフィールド自体が存在しない。
  cross_app_access_resource_app?: CrossAppAccessResourceApp;
}

export interface CreateIdentityProviderInput {
  name: string;
  display_name: string;
  domains?: string[];
  show_as_button?: boolean;
  assign_membership_on_login?: boolean;
  is_enabled?: boolean;
  strategy: 'okta';
  options: {
    domain: string;
    client_id: string;
    client_secret: string;
    icon_url?: string;
  };
  cross_app_access_resource_app?: CrossAppAccessResourceApp;
}

export interface UpdateIdentityProviderInput {
  name?: string;
  display_name?: string;
  domains?: string[];
  show_as_button?: boolean;
  assign_membership_on_login?: boolean;
  is_enabled?: boolean;
  options?: {
    domain?: string;
    client_id?: string;
    client_secret?: string;
    icon_url?: string;
  };
  cross_app_access_resource_app?: CrossAppAccessResourceApp;
}

// Organization直下のドメイン（HRDでIdPに関連付ける前に、DNS TXTレコードで
// 所有権を検証する必要がある）。
export type OrganizationDomainStatus = 'pending' | 'verified' | 'failed';

export interface OrganizationDomain {
  id: string;
  org_id: string;
  domain: string;
  status: OrganizationDomainStatus;
  verification_txt: string;
  verification_host: string;
}

// SCIM Provisioning Configuration（IdPごとに1つ）。
export type ProvisioningMethod = 'none' | 'scim';

export interface ProvisioningAttributeMapItem {
  provisioning_field: string;
  user_attribute: string;
  description?: string;
  label?: string;
  is_required: boolean;
  is_extra: boolean;
  is_missing: boolean;
}

export interface ProvisioningConfig {
  identity_provider_id: string;
  identity_provider_name: string;
  strategy: 'okta';
  method: ProvisioningMethod;
  attributes: ProvisioningAttributeMapItem[];
  user_id_attribute: string;
  created_at: string;
  updated_on: string;
}

// SCIM Token。生のトークン文字列（token）は作成直後のレスポンスにのみ含まれ、
// 一覧取得時には含まれない（レスポンス専用で保存不可）。
export interface ScimToken {
  token_id: string;
  scopes?: string[];
  created_at: string;
  valid_until?: string;
}

export interface ScimTokenWithSecret extends ScimToken {
  token: string;
}

// strategyごとのユーザー向け表示名。IdpStrategyEnum（My Organization API）の7種類に加え、
// Management APIのenabled_connectionsが返す"auth0"（Database Connection = ユーザーストア）も
// ここでまとめて扱う。connection名（例: "Username-Password-Authentication"）はユーザーに
// とって意味が読み取れないため、strategyから機械的に意味のあるラベルに変換する。
const STRATEGY_LABELS: Record<string, string> = {
  auth0: 'パスワード',
  okta: 'Okta',
  adfs: 'ADFS',
  'google-apps': 'Google Workspace',
  oidc: 'OIDC',
  pingfederate: 'PingFederate',
  samlp: 'SAML',
  waad: 'Microsoft Entra ID',
};

export function strategyLabel(strategy: string): string {
  return STRATEGY_LABELS[strategy] ?? strategy;
}
