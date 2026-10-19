/**
 * デバッグ用: My Organization API向けアクセストークンをブラウザに返す。
 * curl等での手動検証を容易にするための開発用エンドポイント。
 * `/my-org/*`のSDK組み込みプロキシ自体はトークンをブラウザに渡さない設計だが、
 * ここでは意図的に例外として生トークンを返す。
 */

import { auth0 } from '@/lib/auth0';

const MY_ORG_AUDIENCE = `https://${process.env.AUTH0_DOMAIN}/my-org/`;

export async function GET() {
  try {
    const { token } = await auth0.getAccessToken({
      audience: MY_ORG_AUDIENCE,
      scope: process.env.AUTH0_MY_ORG_SCOPE ?? '',
    });
    return Response.json({ token });
  } catch (err) {
    console.error('[api/debug/my-org-token] failed to get access token:', err);
    return Response.json({ error: 'トークンの取得に失敗しました' }, { status: 401 });
  }
}
