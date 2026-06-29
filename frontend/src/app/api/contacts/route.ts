import { NextRequest } from 'next/server';
import { proxyToService } from '@/lib/serviceProxy';

export async function GET(req: NextRequest) {
  return proxyToService(req, 'contacts', '/contacts');
}
export async function POST(req: NextRequest) {
  return proxyToService(req, 'contacts', '/contacts');
}
