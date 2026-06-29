import { NextRequest } from 'next/server';
import { proxyToService } from '@/lib/serviceProxy';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return proxyToService(req, 'accounts', `/accounts/${params.id}`);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return proxyToService(req, 'accounts', `/accounts/${params.id}`);
}
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return proxyToService(req, 'accounts', `/accounts/${params.id}`);
}
