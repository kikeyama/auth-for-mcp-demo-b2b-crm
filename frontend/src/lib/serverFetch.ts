import { auth0 } from './auth0';

const SERVICE_URLS: Record<string, string> = {
  accounts:      process.env.ACCOUNT_SERVICE_URL     ?? 'http://localhost:3001',
  opportunities: process.env.OPPORTUNITY_SERVICE_URL ?? 'http://localhost:3002',
  contacts:      process.env.CONTACT_SERVICE_URL     ?? 'http://localhost:3003',
  activities:    process.env.ACTIVITY_SERVICE_URL    ?? 'http://localhost:3004',
  users:         process.env.USER_SERVICE_URL        ?? 'http://localhost:3005',
};

export async function serverGet(service: string, path: string): Promise<any> {
  const { token } = await auth0.getAccessToken();
  const baseUrl = SERVICE_URLS[service as keyof typeof SERVICE_URLS];
  const url = new URL(path, baseUrl);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Service error: ${res.status}`);
  return res.json();
}

export async function serverPost(service: string, path: string, body: unknown): Promise<any> {
  const { token } = await auth0.getAccessToken();
  const baseUrl = SERVICE_URLS[service as keyof typeof SERVICE_URLS];
  const url = new URL(path, baseUrl);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Service error: ${res.status}`);
  return res.json();
}

export async function serverPatch(service: string, path: string, body: unknown): Promise<any> {
  const { token } = await auth0.getAccessToken();
  const baseUrl = SERVICE_URLS[service as keyof typeof SERVICE_URLS];
  const url = new URL(path, baseUrl);
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Service error: ${res.status}`);
  return res.json();
}
