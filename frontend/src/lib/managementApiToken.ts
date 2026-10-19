/**
 * Auth0 Management API（/api/v2/*）用のアクセストークン取得（サーバー専用）。
 *
 * ユーザーのログインセッションとは無関係なclient_credentials（M2M）トークンであり、
 * MRRT（ユーザーのリフレッシュトークンから複数audience分のアクセストークンを得る仕組み）
 * とは別物。専用のMachine to Machine Applicationの資格情報（AUTH0_MGMT_CLIENT_ID/SECRET）を使う。
 * 参照: https://auth0.com/docs/secure/tokens/access-tokens/get-management-api-access-tokens-for-production
 *
 * services/auth0events/src/tokenClient.ts と同じ、LRUキャッシュでトークンを
 * 有効期限いっぱい再利用するパターンを採用。
 */

import { LRUCache } from 'lru-cache';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

async function fetchManagementApiToken(): Promise<TokenResponse> {
  const res = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.AUTH0_MGMT_CLIENT_ID,
      client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET,
      audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to obtain Management API token: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<TokenResponse>;
}

const cache = new LRUCache<string, string>({ max: 1, ttl: 0 });
const CACHE_KEY = 'management-api-token';

export async function getManagementApiToken(): Promise<string> {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const { access_token, expires_in } = await fetchManagementApiToken();
  const ttlMs = Math.max(0, (expires_in - 30) * 1000);
  cache.set(CACHE_KEY, access_token, { ttl: ttlMs });
  return access_token;
}
