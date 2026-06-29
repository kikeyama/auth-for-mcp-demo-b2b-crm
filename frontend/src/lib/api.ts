/**
 * クライアントサイドから Next.js BFF API ルートへのフェッチユーティリティ。
 * アクセストークンは Next.js API ルート（サーバーサイド）で付与するため、
 * クライアントはシンプルに /api/* を呼ぶだけでよい。
 */

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// Accounts
export const api = {
  accounts: {
    list:   ()                 => request('GET',    '/api/accounts'),
    get:    (id: string)       => request('GET',    `/api/accounts/${id}`),
    create: (body: unknown)    => request('POST',   '/api/accounts', body),
    update: (id: string, body: unknown) => request('PATCH', `/api/accounts/${id}`, body),
    delete: (id: string)       => request('DELETE', `/api/accounts/${id}`),
  },
  opportunities: {
    list:   (params?: { account_id?: string }) =>
      request('GET', `/api/opportunities${params?.account_id ? `?account_id=${params.account_id}` : ''}`),
    get:    (id: string)       => request('GET',    `/api/opportunities/${id}`),
    create: (body: unknown)    => request('POST',   '/api/opportunities', body),
    update: (id: string, body: unknown) => request('PATCH', `/api/opportunities/${id}`, body),
    delete: (id: string)       => request('DELETE', `/api/opportunities/${id}`),
  },
  contacts: {
    list:   (params?: { account_id?: string }) =>
      request('GET', `/api/contacts${params?.account_id ? `?account_id=${params.account_id}` : ''}`),
    get:    (id: string)       => request('GET',    `/api/contacts/${id}`),
    create: (body: unknown)    => request('POST',   '/api/contacts', body),
    update: (id: string, body: unknown) => request('PATCH', `/api/contacts/${id}`, body),
    delete: (id: string)       => request('DELETE', `/api/contacts/${id}`),
  },
  activities: {
    list:   (params?: { account_id?: string; opportunity_id?: string; contact_id?: string }) => {
      const qs = new URLSearchParams();
      if (params?.account_id) qs.set('account_id', params.account_id);
      if (params?.opportunity_id)    qs.set('opportunity_id',    params.opportunity_id);
      if (params?.contact_id) qs.set('contact_id', params.contact_id);
      const query = qs.toString();
      return request('GET', `/api/activities${query ? `?${query}` : ''}`);
    },
    get:    (id: string)       => request('GET',    `/api/activities/${id}`),
    create: (body: unknown)    => request('POST',   '/api/activities', body),
    update: (id: string, body: unknown) => request('PATCH', `/api/activities/${id}`, body),
    delete: (id: string)       => request('DELETE', `/api/activities/${id}`),
  },
};
