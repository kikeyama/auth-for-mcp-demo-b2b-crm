import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function proxy(request: NextRequest) {
  const authRes = await auth0.middleware(request);

  if (request.nextUrl.pathname.startsWith('/auth')) {
    return authRes;
  }

  const session = await auth0.getSession(request);
  if (!session) {
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return authRes;
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
