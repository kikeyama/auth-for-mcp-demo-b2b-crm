import { NextRequest } from 'next/server';
import { proxyToService } from '@/lib/serviceProxy';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return proxyToService(req, 'opportunities', `/opportunities/${params.id}/history`);
}
