import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { hasRole, TENANT_ADMIN_ROLE, DEV_ROLE } from '@/lib/roles';

export async function proxy(request: NextRequest) {
  const authRes = await auth0.middleware(request);

  // /auth/* はSDKのログイン/ログアウト/コールバックハンドラ、/me/* と /my-org/* は
  // My Account / My Organization APIへのSDK組み込みプロキシ（本文を含む完結したレスポンス）。
  // いずれもauth0.middleware()がリクエストボディを読み切った上でレスポンスを返しているため、
  // 以下のgetSession/getAccessTokenで同じrequestに再度触ると
  // "Response body object should not be disturbed or locked" になる。素通しする。
  if (
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname.startsWith('/me/') ||
    request.nextUrl.pathname.startsWith('/my-org/')
  ) {
    return authRes;
  }

  const session = await auth0.getSession(request);
  if (!session) {
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return authRes;
  }

  // /settings/* はテナント管理（Identity Provider / ドメイン / メンバー管理）、
  // /debug/* はMCP関連のデバッグ画面。どちらもサイドバーのメニュー表示と対になる
  // 権限チェックで、ロールを持たないユーザーがURLを直接叩いてもアクセスできないようにする。
  if (request.nextUrl.pathname.startsWith('/settings') && !hasRole(session.user, TENANT_ADMIN_ROLE)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  if (request.nextUrl.pathname.startsWith('/debug') && !hasRole(session.user, DEV_ROLE)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Server Components cannot persist cookies, so if the access token expires and
  // gets refreshed there, the newly-rotated refresh token is silently dropped —
  // Auth0 has already invalidated the old one, so every subsequent request
  // permanently fails with invalid_grant until the user logs out and back in.
  // Proactively refresh here in middleware instead, where the response CAN carry
  // the updated Set-Cookie, so Server Components always see an already-fresh token.
  // https://github.com/auth0/nextjs-auth0/blob/main/EXAMPLES.md ("Refreshing an Access Token" > "In middleware")
  try {
    await auth0.getAccessToken(request, authRes);
  } catch {
    // Refresh token itself is invalid/expired — nothing more middleware can do here;
    // downstream pages/routes surface their own 401/redirect.
  }

  return authRes;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
