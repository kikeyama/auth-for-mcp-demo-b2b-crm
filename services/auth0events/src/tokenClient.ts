import { LRUCache } from 'lru-cache';
import { config } from './config';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

async function fetchToken(organization?: string): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'client_credentials',
    client_id: config.auth0.clientId,
    client_secret: config.auth0.clientSecret,
    audience: config.auth0.audience,
  };
  if (organization) body.organization = organization;

  const res = await fetch(`https://${config.auth0.domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to obtain M2M token (organization=${organization ?? 'none'}): ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<TokenResponse>;
}

// キーは "" (org無し) または org_id。org無しトークンは user.created/user.updated/user.deleted 用、
// org_id単位のトークンは organization.member.added/deleted 用。
const cache = new LRUCache<string, string>({ max: 1000, ttl: 0 });

async function getCachedToken(cacheKey: string, organization?: string): Promise<string> {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { access_token, expires_in } = await fetchToken(organization);
  const ttlMs = Math.max(0, (expires_in - 30) * 1000);
  cache.set(cacheKey, access_token, { ttl: ttlMs });
  return access_token;
}

// org無しトークン: /users/provisional、GET・PATCH /users/:id (信頼済みクライアント向けの例外経路) 用
export const getSyncToken = (): Promise<string> => getCachedToken('');

// org-scopedトークン: PATCH /users/:id/org、organization.member.added/deleted の通常経路用
export const getOrgScopedSyncToken = (orgId: string): Promise<string> => getCachedToken(orgId, orgId);
