import { LRUCache } from 'lru-cache';
import { apiClient } from './auth/verifier';
import { config } from './config';
import type { MCPSession } from './session';
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

  // offline_access is valid on the incoming MCP client token (so mcp-remote can refresh
  // its own session) but Auth0 rejects it on the OBO exchange request itself:
  // "Refresh tokens (offline_access scope) are not supported for on-behalf-of token exchange".
  const scope = session.scopes.filter((s) => s !== 'offline_access').join(' ');

  const result = await apiClient.getTokenOnBehalfOf(session.token, {
    audience: config.auth0.apiAudience,
    scope,
  });

  // expiresAt is seconds since epoch; subtract 30s buffer before caching
  const ttlMs = Math.max(0, (result.expiresAt - 30) * 1000 - Date.now());
  cache.set(key, result.accessToken, { ttl: ttlMs });

  recordExchange(toolName, session.token, result.accessToken, false);
  return result.accessToken;
}
