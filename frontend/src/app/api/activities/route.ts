import { NextRequest, NextResponse } from 'next/server';
import { proxyToService } from '@/lib/serviceProxy';
import { auth0 } from '@/lib/auth0';
import { revalidatePath } from 'next/cache';

export async function GET(req: NextRequest) {
  return proxyToService(req, 'activities', '/activities');
}

export async function POST(req: NextRequest) {
  let accessToken: string;
  try {
    const result = await auth0.getAccessToken();
    accessToken = result.token;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const serviceUrl = process.env.ACTIVITY_SERVICE_URL ?? 'http://localhost:3004';

  const upstream = await fetch(`${serviceUrl}/activities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();

  if (upstream.ok) {
    revalidatePath('/activities');
    if (body.opportunity_id) revalidatePath(`/opportunities/${body.opportunity_id}`);
    if (body.account_id)     revalidatePath(`/accounts/${body.account_id}`);
  }

  return NextResponse.json(data, { status: upstream.status });
}
