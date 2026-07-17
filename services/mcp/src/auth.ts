import { ApiClient, getToken } from '@auth0/auth0-api-js';
import type http from 'http';
import { config } from './config';

export const apiClient = new ApiClient({
  domain:       config.auth0.domain,
  audience:     config.auth0.audience,
  clientId:     config.auth0.clientId,
  clientSecret: config.auth0.clientSecret,
});

export type MCPSession = {
  token:  string;
  sub:    string;
  orgId:  string;
  scopes: string[];
};

export async function authenticate(request: http.IncomingMessage): Promise<MCPSession> {
  const token = getToken(request.headers as Record<string, string | string[] | undefined>);
  const claims = await apiClient.verifyAccessToken({ accessToken: token });

  const orgId = claims['org_id'] as string | undefined;
  if (!orgId) throw new Error('Organization context required');

  const sub = claims.sub;
  if (!sub) throw new Error('Missing sub claim');

  return {
    token,
    sub,
    orgId,
    scopes: ((claims.scope as string) ?? '').split(' ').filter(Boolean),
  };
}
