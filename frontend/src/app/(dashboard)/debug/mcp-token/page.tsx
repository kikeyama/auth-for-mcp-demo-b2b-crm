'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { TokenExchangeSequenceDiagram } from '@/components/diagrams/TokenExchangeSequenceDiagram';
import { RefreshCw, Trash2, Copy, Check } from 'lucide-react';

interface DecodedToken {
  raw: string;
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
}

interface TokenExchangeRecord {
  id: string;
  timestamp: string;
  toolName: string;
  mcpToken: DecodedToken;
  apiToken: DecodedToken;
  fromCache: boolean;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ja-JP', { hour12: false }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
}

function shorten(raw: string) {
  if (raw.length <= 32) return raw;
  return `${raw.slice(0, 16)}…${raw.slice(-12)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では無視
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`flex-shrink-0 p-1 rounded transition-colors ${copied ? 'text-green-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
      title="生トークンをコピー"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function ClientIdBadge({ clientId }: { clientId: string }) {
  if (clientId.startsWith('https://') || clientId.startsWith('http://')) {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-sans font-semibold">CIMD</span>;
  }
  if (clientId.startsWith('tpc_')) {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-sans font-semibold">DCR (3rd party)</span>;
  }
  return null;
}

function TokenPanel({ label, token, accentClass, showAzp }: { label: string; token: DecodedToken; accentClass: string; showAzp?: boolean }) {
  const payload = token.payload ?? {};
  const scope = typeof payload.scope === 'string' ? payload.scope : '';
  const aud = payload.aud;
  const audStr = Array.isArray(aud) ? aud.join(', ') : String(aud ?? '-');
  const azp = typeof payload.azp === 'string' ? payload.azp : (typeof payload.client_id === 'string' ? payload.client_id : '');

  return (
    <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className={`text-xs font-bold mb-3 ${accentClass}`}>{label}</div>
      <dl className="text-xs space-y-1.5 font-mono">
        {showAzp && azp && (
          <div className="flex gap-2 items-start">
            <dt className="flex-shrink-0 text-gray-500">azp:</dt>
            <dd className="break-all text-gray-900 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>{azp}</span>
                <ClientIdBadge clientId={azp} />
              </div>
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="flex-shrink-0 text-gray-500">aud:</dt>
          <dd className="break-all text-gray-900">{audStr}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex-shrink-0 text-gray-500">sub:</dt>
          <dd className="break-all text-gray-900">{String(payload.sub ?? '-')}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex-shrink-0 text-gray-500">scope:</dt>
          <dd className="break-all text-gray-900">{scope || '(なし)'}</dd>
        </div>
        {payload.act != null && (
          <div className="flex gap-2">
            <dt className="flex-shrink-0 text-gray-500">act:</dt>
            <dd className="break-all text-green-700">{JSON.stringify(payload.act)}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="flex-shrink-0 text-gray-500">exp:</dt>
          <dd className="text-gray-900">
            {payload.exp ? new Date(Number(payload.exp) * 1000).toLocaleString('ja-JP') : '-'}
          </dd>
        </div>
      </dl>
      <details className="mt-3">
        <summary className="text-xs cursor-pointer text-gray-500">生トークン（JWT）</summary>
        <div className="mt-1 flex items-start gap-1.5">
          <p className="text-xs font-mono break-all flex-1 text-gray-500">{shorten(token.raw)}</p>
          <CopyButton text={token.raw} />
        </div>
      </details>
    </div>
  );
}

export default function McpDebugPage() {
  const [records, setRecords] = useState<TokenExchangeRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    fetch('/api/mcp-debug')
      .then((r) => r.json())
      .then((data: { records?: TokenExchangeRecord[]; error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setRecords(data.records ?? []);
        setError('');
      })
      .catch(() => setError('mcpサービスに接続できません'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load, autoRefresh]);

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClear(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    fetch(`/api/mcp-debug?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {
      // 削除に失敗しても次回ポーリングで実情が反映される
    });
  }

  return (
    <>
      <Header title="MCPトークンビューア" />
      <main className="flex-1 overflow-auto p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <TokenExchangeSequenceDiagram />
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">
            MCPクライアントから受け取ったトークンと、On-Behalf-Of (OBO) Token Exchangeで交換したAPIトークンを表示します（デモ用途）。
          </p>
          <div className="flex items-center gap-3 flex-shrink-0">
            <label className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              自動更新
            </label>
            <button onClick={load} className="btn-secondary text-xs px-3 py-1.5 gap-1.5 whitespace-nowrap">
              <RefreshCw className="w-3.5 h-3.5" /> 更新
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl p-4 mb-4 text-sm bg-red-50 text-red-700">
            {error}（mcpサービスが起動しているか確認してください）
          </div>
        )}

        {loading && !error && (
          <p className="text-sm text-gray-400">読み込み中...</p>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="rounded-xl p-8 text-center text-sm bg-white border border-gray-200 text-gray-400">
            まだトークン交換の履歴がありません。MCPクライアントからツールを呼び出すとここに表示されます。
          </div>
        )}

        <div className="space-y-4">
          {records.map((rec) => {
            const collapsed = collapsedIds.has(rec.id);
            return (
              <div key={rec.id} className="rounded-2xl p-4 bg-white border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => toggleCollapsed(rec.id)} className="flex items-center gap-2 flex-1 text-left">
                    <span className="text-gray-400 text-xs w-3">{collapsed ? '▶' : '▼'}</span>
                    <span className="text-sm font-bold font-mono text-brand-600">{rec.toolName}</span>
                    {rec.fromCache && (
                      <span className="text-xs px-2 py-0.5 rounded bg-brand-100 text-brand-700">キャッシュ済み</span>
                    )}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400">{fmtTime(rec.timestamp)}</span>
                    <button
                      onClick={() => handleClear(rec.id)}
                      className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="この記録を削除（画面とサーバーの両方から消去）"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {!collapsed && (
                  <div className="flex items-stretch gap-3">
                    <TokenPanel label="MCPトークン（MCP Client → MCP Server）" token={rec.mcpToken} accentClass="text-blue-600" showAzp />
                    <div className="flex items-center justify-center flex-shrink-0 text-gray-400">→</div>
                    <TokenPanel label="APIトークン（OBO交換後 → microservices）" token={rec.apiToken} accentClass="text-green-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
