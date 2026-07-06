import { NextRequest } from 'next/server';
import { proxyToService } from '@/lib/serviceProxy';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToService(req, 'contacts', `/contacts/${id}`);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToService(req, 'contacts', `/contacts/${id}`);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToService(req, 'contacts', `/contacts/${id}`);
}
