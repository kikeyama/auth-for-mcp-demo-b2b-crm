import { Auth0Client, filterDefaultIdTokenClaims } from '@auth0/nextjs-auth0/server';
import { ROLES_CLAIM } from '@/lib/roles';
import { redisSessionStore } from '@/lib/redisSessionStore';

const myOrgAudience = `https://${process.env.AUTH0_DOMAIN}/my-org/`;

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
  secret: process.env.AUTH0_SECRET!,
  appBaseUrl: process.env.APP_BASE_URL!,
  // My Organization API（操作ごとに異なるscopeを要求する、/my-org/*の呼び出しパターン）は
  // audience+scopeごとにMRRTトークンがsession.accessTokensに積み上がり、Cookieベースの
  // セッションでは431 Request Header Fields Too Largeに至る（CLAUDE.md参照）。
  // REDIS_URL設定時はセッション本体をRedisに置き、Cookieにはセッション ID のみ乗せる。
  ...(process.env.REDIS_URL ? { sessionStore: redisSessionStore } : {}),
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    // scopeをMapにすると、SDKのMy Organization APIプロキシ（/my-org/*）が
    // audience別のアクセストークンを取得・リフレッシュできるようになる。
    // 既定audience分のscopeはAUTH0_SCOPEのまま維持する必要がある
    // （ensureDefaultScopeはMapに既定audienceのキーがない場合のみ補完するため）。
    scope: {
      [process.env.AUTH0_AUDIENCE!]: process.env.AUTH0_SCOPE ?? 'openid profile email',
      [myOrgAudience]: process.env.AUTH0_MY_ORG_SCOPE ?? '',
    },
  },
  // beforeSessionSaved未設定だと、SDKはID Tokenのクレームをデフォルト許可リスト
  // （DEFAULT_ID_TOKEN_CLAIMS。sub/name/email/org_id等）だけにフィルタしてsession.userへ
  // 格納する。ロールカスタムクレーム（ROLES_CLAIM、Auth0のPost-Login Actionで追加）は
  // このリストに含まれないため、何もしないと黒く削除されてしまう。
  // 参照: https://github.com/auth0/nextjs-auth0/blob/main/EXAMPLES.md#beforesessionsaved
  async beforeSessionSaved(session, _idToken) {
    return {
      ...session,
      user: {
        ...filterDefaultIdTokenClaims(session.user),
        ...(ROLES_CLAIM && session.user[ROLES_CLAIM] !== undefined
          ? { [ROLES_CLAIM]: session.user[ROLES_CLAIM] }
          : {}),
      },
    };
  },
});
