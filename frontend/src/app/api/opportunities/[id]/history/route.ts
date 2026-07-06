import { NextRequest } from 'next/server';
import { proxyToService } from '@/lib/serviceProxy';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToService(req, 'opportunities', `/opportunities/${id}/history`);
}
