import { auth0 } from '@/lib/auth0';
import { NextRequest, NextResponse } from 'next/server';

const SERVICE_URLS: Record<string, string> = {
  accounts:      process.env.ACCOUNT_SERVICE_URL     ?? 'http://localhost:3001',
  opportunities: process.env.OPPORTUNITY_SERVICE_URL ?? 'http://localhost:3002',
  contacts:      process.env.CONTACT_SERVICE_URL     ?? 'http://localhost:3003',
  activities:    process.env.ACTIVITY_SERVICE_URL    ?? 'http://localhost:3004',
  users:         process.env.USER_SERVICE_URL        ?? 'http://localhost:3005',
};

export async function proxyToService(
  req: NextRequest,
  resource: keyof typeof SERVICE_URLS,
  upstreamPath: string,
): Promise<NextResponse> {
  let accessToken: string;
  try {
    const result = await auth0.getAccessToken();
    accessToken = result.token;
  } catch (err) {
    console.error('[serviceProxy] getAccessToken failed:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = SERVICE_URLS[resource];
  const url     = new URL(upstreamPath, baseUrl);

  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  let body: string | undefined;
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    body = await req.text();
  }

  const upstream = await fetch(url.toString(), {
    method:  req.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${accessToken}`,
    },
    body,
  });

  if (upstream.status === 204) return new NextResponse(null, { status: 204 });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
