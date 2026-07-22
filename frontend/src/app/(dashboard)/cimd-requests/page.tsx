'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { RefreshCw, Trash2 } from 'lucide-react';

interface Auth0LogRecord {
  id: string;
  receivedAt: string;
  date: string | null;
  clientId: string | null;
  clientName: string | null;
  requestedClientId: string | null;
  userName: string | null;
  raw: Record<string, unknown>;
}

function fmtDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', { hour12: false });
}

export default function CimdRequestsPage() {
  const [records, setRecords] = useState<Auth0LogRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    fetch('/api/auth0-logs')
      .then((r) => r.json())
      .then((data: { records?: Auth0LogRecord[]; error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setRecords(data.records ?? []);
        setError('');
      })
      .catch(() => setError('auth0logsサービスに接続できません'))
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
    fetch(`/api/auth0-logs?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {
      // 削除に失敗しても次回ポーリングで実情が反映される
    });
  }

  return (
    <>
      <Header title="CIMD認証リクエスト" />
      <main className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">
            Auth0 の Log Stream（Custom Webhook）からリアルタイムに受信した、CIMD（Client ID Metadata Documents）経由の認証成功リクエストです。
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              自動更新
            </label>
            <button onClick={load} className="btn-secondary text-xs px-3 py-1.5 gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> 更新
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl p-4 mb-4 text-sm bg-red-50 text-red-700">
            {error}（auth0logsサービスが起動しているか確認してください）
          </div>
        )}

        {loading && !error && (
          <p className="text-sm text-gray-400">読み込み中...</p>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="rounded-xl p-8 text-center text-sm bg-white border border-gray-200 text-gray-400">
            まだCIMD認証リクエストがありません。CIMDクライアントでログインが発生するとここに表示されます。
          </div>
        )}

        <div className="space-y-2">
          {records.map((log) => {
            const collapsed = collapsedIds.has(log.id);
            return (
              <div key={log.id} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleCollapsed(log.id)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                    <span className="text-gray-400 text-xs w-3 flex-shrink-0">{collapsed ? '▶' : '▼'}</span>
                    <span className="text-xs font-mono text-gray-400 flex-shrink-0">{fmtDate(log.date)}</span>
                    <span className="text-sm text-gray-700 truncate">{log.clientName ?? '(no client_name)'}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{log.userName ?? '-'}</span>
                  </button>
                  <button
                    onClick={() => handleClear(log.id)}
                    className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                    title="この記録を削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!collapsed && (
                  <div className="mt-3 pl-5">
                    <dl className="text-xs space-y-1.5 font-mono">
                      <div className="flex gap-2">
                        <dt className="flex-shrink-0 text-gray-500 w-36">date:</dt>
                        <dd className="break-all text-gray-900">{log.date ?? '-'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="flex-shrink-0 text-gray-500 w-36">client_id:</dt>
                        <dd className="break-all text-gray-900">{log.clientId ?? '-'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="flex-shrink-0 text-gray-500 w-36">client_name:</dt>
                        <dd className="break-all text-gray-900">{log.clientName ?? '-'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="flex-shrink-0 text-gray-500 w-36">requested_client_id:</dt>
                        <dd className="break-all text-purple-700 font-semibold">{log.requestedClientId ?? '-'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="flex-shrink-0 text-gray-500 w-36">user_name:</dt>
                        <dd className="break-all text-gray-900">{log.userName ?? '-'}</dd>
                      </div>
                    </dl>
                    <details className="mt-3">
                      <summary className="text-xs cursor-pointer text-gray-500">生ログ</summary>
                      <pre className="mt-1 text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto">
                        {JSON.stringify(log.raw, null, 2)}
                      </pre>
                    </details>
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
