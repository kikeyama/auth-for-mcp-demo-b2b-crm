import { ApiClient } from '@auth0/auth0-api-js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { config } from '../config';

export const apiClient = new ApiClient({
  domain:       config.auth0.domain,
  audience:     config.auth0.audience,
  clientId:     config.auth0.clientId,
  clientSecret: config.auth0.clientSecret,
});

// AuthInfo (SDK標準) には org_id の概念が無いため、req.auth 経由で
// ツール呼び出し側まで運ぶための独自フィールドとして拡張する。
export interface MCPAuthInfo extends AuthInfo {
  sub:   string;
  orgId: string;
}

export class Auth0TokenVerifier implements OAuthTokenVerifier {
  constructor(private readonly client: ApiClient) {}

  async verifyAccessToken(token: string): Promise<MCPAuthInfo> {
    try {
      const claims = await this.client.verifyAccessToken({ accessToken: token });

      const orgId = claims['org_id'] as string | undefined;
      if (!orgId) throw new Error('Organization context required');

      const sub = claims.sub;
      if (!sub) throw new Error('Missing sub claim');

      return {
        token,
        clientId:  (claims.azp as string | undefined) ?? sub,
        scopes:    ((claims.scope as string | undefined) ?? '').split(' ').filter(Boolean),
        expiresAt: claims.exp,
        sub,
        orgId,
      };
    } catch (err) {
      // requireBearerAuth は InvalidTokenError のみ 401 + WWW-Authenticate に変換する。
      // 素の Error を投げると 500 になってしまうため、必ずラップして再投げする。
      const message = err instanceof Error ? err.message : 'Unauthorized';
      throw new InvalidTokenError(message);
    }
  }
}
