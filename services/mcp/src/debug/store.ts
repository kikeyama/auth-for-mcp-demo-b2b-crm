import { randomUUID } from 'node:crypto';
import { decodeJwt } from './jwt';

export interface TokenExchangeRecord {
  id: string;
  timestamp: string;
  toolName: string;
  mcpToken: { raw: string; header: Record<string, unknown> | null; payload: Record<string, unknown> | null };
  apiToken: { raw: string; header: Record<string, unknown> | null; payload: Record<string, unknown> | null };
  fromCache: boolean;
}

const MAX_RECORDS = 30;
const records: TokenExchangeRecord[] = [];

export function recordExchange(toolName: string, mcpToken: string, apiToken: string, fromCache: boolean) {
  const mcpDecoded = decodeJwt(mcpToken);
  const apiDecoded = decodeJwt(apiToken);

  records.unshift({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    toolName,
    mcpToken: { raw: mcpToken, header: mcpDecoded?.header ?? null, payload: mcpDecoded?.payload ?? null },
    apiToken: { raw: apiToken, header: apiDecoded?.header ?? null, payload: apiDecoded?.payload ?? null },
    fromCache,
  });

  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
}

export function getRecords(): TokenExchangeRecord[] {
  return records;
}

export function removeRecord(id: string): boolean {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return false;
  records.splice(index, 1);
  return true;
}
