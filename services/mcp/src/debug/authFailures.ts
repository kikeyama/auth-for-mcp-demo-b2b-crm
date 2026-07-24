import { randomUUID } from 'node:crypto';

export interface AuthFailureRecord {
  id: string;
  timestamp: string;
  reason: string;
  wwwAuthenticateHeader: string;
}

const MAX_RECORDS = 30;
// mcp-remote は接続試行ごとに、未認証の探索用プローブ（discoverOAuthServerInfo の GET）と
// 実際のクライアントトランスポートの接続試行の、2つの別リクエストを /mcp へ送る。両方とも
// 同じ理由で 401 になるため、同一内容が数百ms差で2件記録される。デモ画面が壊れて見えるのを
// 避けるため、直前の記録と同一内容かつこの時間内であれば重複として記録しない。
const DEDUPE_WINDOW_MS = 2000;
const records: AuthFailureRecord[] = [];

function extractErrorDescription(header: string): string {
  const match = header.match(/error_description="([^"]*)"/);
  return match ? match[1] : header;
}

// wwwAuthenticateHeader は requireBearerAuth (公式SDK) が実際にレスポンスへ設定した
// 生のヘッダー文字列そのもの（index.ts のキャプチャ用ミドルウェアから渡される）。
export function recordAuthFailure(wwwAuthenticateHeader: string) {
  const now = Date.now();
  const last = records[0];
  if (last && last.wwwAuthenticateHeader === wwwAuthenticateHeader && now - Date.parse(last.timestamp) < DEDUPE_WINDOW_MS) {
    return;
  }

  records.unshift({
    id: randomUUID(),
    timestamp: new Date(now).toISOString(),
    reason: extractErrorDescription(wwwAuthenticateHeader),
    wwwAuthenticateHeader,
  });

  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
}

export function getAuthFailures(): AuthFailureRecord[] {
  return records;
}

export function removeAuthFailure(id: string): boolean {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return false;
  records.splice(index, 1);
  return true;
}
