import { LRUCache } from 'lru-cache';
import { apiClient } from './auth';
import { config } from './config';
import type { MCPSession } from './auth';
import { recordExchange } from './debug/store';

// Cache keyed by "sub:orgId"; TTL is derived from the exchanged token's expiresAt.
// Auth0 docs recommend caching exchanged tokens for their full lifetime.
const cache = new LRUCache<string, string>({ max: 1000, ttl: 0 });

export async function getOboToken(session: MCPSession, toolName: string): Promise<string> {
  const key = `${session.sub}:${session.orgId}`;
  const cached = cache.get(key);
  if (cached) {
    recordExchange(toolName, session.token, cached, true);
    return cached;
  }

  const result = await apiClient.getTokenOnBehalfOf(session.token, {
    audience: config.auth0.apiAudience,
    scope: session.scopes.join(' '),
  });

  // expiresAt is seconds since epoch; subtract 30s buffer before caching
  const ttlMs = Math.max(0, (result.expiresAt - 30) * 1000 - Date.now());
  cache.set(key, result.accessToken, { ttl: ttlMs });

  recordExchange(toolName, session.token, result.accessToken, false);
  return result.accessToken;
}
