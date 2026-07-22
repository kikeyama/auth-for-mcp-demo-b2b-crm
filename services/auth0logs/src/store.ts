import { randomUUID } from 'node:crypto';

export interface Auth0LogRecord {
  id: string;
  receivedAt: string;
  date: string | null;
  clientId: string | null;
  clientName: string | null;
  requestedClientId: string | null;
  userName: string | null;
  raw: Record<string, unknown>;
}

const MAX_RECORDS = 50;
const records: Auth0LogRecord[] = [];

// requested_client_id は details オブジェクトの下にネストされている
// （トップレベルの client_id は Auth0 が解決した内部ID、例: tpc_... プレフィックス）
export function extractRequestedClientId(raw: Record<string, unknown>): string | null {
  const details = raw.details;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const v = (details as Record<string, unknown>).requested_client_id;
    if (typeof v === 'string') return v;
  }
  return null;
}

export function recordEvent(raw: Record<string, unknown>) {
  records.unshift({
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    date: typeof raw.date === 'string' ? raw.date : null,
    clientId: typeof raw.client_id === 'string' ? raw.client_id : null,
    clientName: typeof raw.client_name === 'string' ? raw.client_name : null,
    requestedClientId: extractRequestedClientId(raw),
    userName: typeof raw.user_name === 'string' ? raw.user_name : null,
    raw,
  });

  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
}

export function getEvents(): Auth0LogRecord[] {
  return records;
}

export function removeEvent(id: string): boolean {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return false;
  records.splice(index, 1);
  return true;
}
