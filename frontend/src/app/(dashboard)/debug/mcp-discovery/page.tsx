'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { AuthorizationSequenceDiagram } from '@/components/diagrams/AuthorizationSequenceDiagram';
import { RefreshCw, Eraser } from 'lucide-react';

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

interface AuthFailureRecord {
  id: string;
  timestamp: string;
  reason: string;
  wwwAuthenticateHeader: string;
}

interface ProtectedResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
  jwks_uri?: string;
  scopes_supported?: string[];
  resource_name?: string;
  [key: string]: unknown;
}

interface AuthorizationServerMetadata {
  issuer?: string;
  client_id_metadata_document_supported?: boolean;
  [key: string]: unknown;
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-bold flex-shrink-0">
          {step}
        </span>
        <h2 className="text-base font-bold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', { hour12: false });
}

// WWW-Authenticate ヘッダー文字列のうち resource_metadata="..." の部分だけを
// 強調表示する（このセクションが実際にディスカバリーするURLのため）。
function highlightResourceMetadata(header: string) {
  const match = header.match(/resource_metadata="[^"]*"/);
  if (!match) return header;

  const start = header.indexOf(match[0]);
  const before = header.slice(0, start);
  const after = header.slice(start + match[0].length);

  return (
    <>
      {before}
      <span className="text-purple-700 font-semibold">{match[0]}</span>
      {after}
    </>
  );
}

// obj のうち keys で指定したフィールドだけを実際の値のまま抜粋し、それ以外は "..." で省略した
// 表示専用の JSON 風文字列を組み立てる（パース可能な厳密な JSON ではなく、あくまで説明用の抜粋）。
function excerptJson(obj: Record<string, unknown> | null, keys: string[]): string {
  if (!obj) return '{\n  ...\n}';

  const lines = keys
    .filter((key) => key in obj)
    .map((key) => {
      const raw = JSON.stringify(obj[key], null, 2);
      const indented = raw.split('\n').map((line, i) => (i === 0 ? line : `  ${line}`)).join('\n');
      return `  "${key}": ${indented}`;
    });

  return `{\n${lines.map((l) => `${l},`).join('\n')}\n  ...\n}`;
}

export default function CimdRequestsPage() {
  const [latestRecord, setLatestRecord] = useState<Auth0LogRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [latestAuthFailure, setLatestAuthFailure] = useState<AuthFailureRecord | null>(null);
  const [authFailuresError, setAuthFailuresError] = useState('');

  const [resourceMetadata, setResourceMetadata] = useState<ProtectedResourceMetadata | null>(null);
  const [resourceMetadataUrl, setResourceMetadataUrl] = useState('');
  const [resourceMetadataError, setResourceMetadataError] = useState('');
  const [authServerMetadata, setAuthServerMetadata] = useState<AuthorizationServerMetadata | null>(null);
  const [authServerMetadataUrl, setAuthServerMetadataUrl] = useState('');
  const [authServerMetadataError, setAuthServerMetadataError] = useState('');

  const loadLatestRecord = useCallback(() => {
    fetch('/api/auth0-logs')
      .then((r) => r.json())
      .then((data: { records?: Auth0LogRecord[]; error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setLatestRecord(data.records?.[0] ?? null);
        setError('');
      })
      .catch(() => setError('auth0logsサービスに接続できません'))
      .finally(() => setLoading(false));
  }, []);

  const loadLatestAuthFailure = useCallback(() => {
    fetch('/api/mcp-auth-failures')
      .then((r) => r.json())
      .then((data: { records?: AuthFailureRecord[]; error?: string }) => {
        if (data.error) { setAuthFailuresError(data.error); return; }
        setLatestAuthFailure(data.records?.[0] ?? null);
        setAuthFailuresError('');
      })
      .catch(() => setAuthFailuresError('mcpサービスに接続できません'));
  }, []);

  const loadResourceMetadata = useCallback(() => {
    fetch('/api/mcp-resource-metadata')
      .then((r) => r.json())
      .then((res: { url?: string; data?: ProtectedResourceMetadata; error?: string }) => {
        if (res.error) { setResourceMetadataError(res.error); return; }
        setResourceMetadata(res.data ?? null);
        setResourceMetadataUrl(res.url ?? '');
        setResourceMetadataError('');

        const issuer = res.data?.authorization_servers?.[0];
        if (!issuer) return;
        return fetch(`/api/auth-server-metadata?issuer=${encodeURIComponent(issuer)}`)
          .then((r) => r.json())
          .then((asRes: { url?: string; data?: AuthorizationServerMetadata; error?: string }) => {
            if (asRes.error) { setAuthServerMetadataError(asRes.error); return; }
            setAuthServerMetadata(asRes.data ?? null);
            setAuthServerMetadataUrl(asRes.url ?? '');
            setAuthServerMetadataError('');
          })
          .catch(() => setAuthServerMetadataError('認可サーバーのメタデータを取得できません'));
      })
      .catch(() => setResourceMetadataError('mcpサービスに接続できません'));
  }, []);

  const loadAll = useCallback(() => {
    loadLatestRecord();
    loadLatestAuthFailure();
    loadResourceMetadata();
  }, [loadLatestRecord, loadLatestAuthFailure, loadResourceMetadata]);

  useEffect(() => {
    loadAll();
    if (!autoRefresh) return;
    const interval = setInterval(loadAll, 3000);
    return () => clearInterval(interval);
  }, [loadAll, autoRefresh]);

  function handleClearAll() {
    if (latestRecord) {
      fetch(`/api/auth0-logs?id=${encodeURIComponent(latestRecord.id)}`, { method: 'DELETE' }).catch(() => {
        // 削除に失敗しても次回の更新で実情が反映される
      });
    }
    if (latestAuthFailure) {
      fetch(`/api/mcp-auth-failures?id=${encodeURIComponent(latestAuthFailure.id)}`, { method: 'DELETE' }).catch(() => {
        // 削除に失敗しても次回の更新で実情が反映される
      });
    }
    setLatestRecord(null);
    setLatestAuthFailure(null);
    setResourceMetadata(null);
    setResourceMetadataUrl('');
    setAuthServerMetadata(null);
    setAuthServerMetadataUrl('');
  }

  return (
    <>
      <Header title="MCP認可ディスカバリー" />
      <main className="flex-1 overflow-auto p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <AuthorizationSequenceDiagram />
        </div>

        <div className="flex items-center justify-end gap-3 mb-6">
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            自動更新
          </label>
          <button onClick={loadAll} className="btn-secondary text-xs px-3 py-1.5 gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> 更新
          </button>
          <button onClick={handleClearAll} className="btn-secondary text-xs px-3 py-1.5 gap-1.5">
            <Eraser className="w-3.5 h-3.5" /> クリア
          </button>
        </div>

        <Section step={1} title="保護対象リソースメタデータディスカバリー（Protected Resource Metadata Discovery）">
          <p className="text-sm text-gray-500 mb-4">
            MCP仕様に従い、トークン無し／無効なリクエストに対して MCP サーバーが実際に返している <code className="font-mono">401</code> レスポンスの <code className="font-mono">WWW-Authenticate</code> ヘッダーと、そこで示された <code className="font-mono">resource_metadata</code> を実際にフェッチして得た Protected Resource Metadata です（最新の1件のみ表示）。
          </p>

          {authFailuresError && (
            <div className="rounded-xl p-4 mb-4 text-sm bg-red-50 text-red-700">
              {authFailuresError}（mcpサービスが起動しているか確認してください）
            </div>
          )}

          {!authFailuresError && !latestAuthFailure && (
            <div className="rounded-xl p-6 mb-4 text-center text-sm bg-gray-50 border border-gray-200 text-gray-400">
              まだ401レスポンスの記録がありません。MCPクライアントが未認証で接続すると表示されます。
            </div>
          )}

          {latestAuthFailure && (
            <div className="rounded-xl border border-gray-200 bg-white p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-gray-400 flex-shrink-0">{fmtDate(latestAuthFailure.timestamp)}</span>
                <span className="text-sm text-gray-700 truncate">{latestAuthFailure.reason}</span>
              </div>
              <p className="text-xs text-gray-500 mb-1">WWW-Authenticate:</p>
              <pre className="text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto break-all whitespace-pre-wrap">
                {highlightResourceMetadata(latestAuthFailure.wwwAuthenticateHeader)}
              </pre>
            </div>
          )}

          <p className="text-xs text-gray-500 mb-1">取得した Protected Resource Metadata（抜粋）:</p>
          {resourceMetadataUrl && (
            <p className="text-xs text-gray-400 font-mono mb-1">GET {resourceMetadataUrl}</p>
          )}
          {resourceMetadataError && (
            <div className="rounded-xl p-3 text-sm bg-red-50 text-red-700">
              {resourceMetadataError}
            </div>
          )}
          {!resourceMetadataError && (
            <pre className="text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {resourceMetadata ? excerptJson(resourceMetadata, ['authorization_servers', 'scopes_supported']) : '読み込み中...'}
            </pre>
          )}
        </Section>

        <Section step={2} title="認可サーバーメタデータディスカバリー（Authorization Server Metadata Discovery）">
          <p className="text-sm text-gray-500 mb-4">
            Protected Resource Metadata の <code className="font-mono">authorization_servers</code> が示す認可サーバー（Auth0）から実際にフェッチした Authorization Server Metadata です。
          </p>

          {authServerMetadataUrl && (
            <p className="text-xs text-gray-400 font-mono mb-1">GET {authServerMetadataUrl}</p>
          )}
          {authServerMetadataError && (
            <div className="rounded-xl p-3 text-sm bg-red-50 text-red-700">
              {authServerMetadataError}
            </div>
          )}
          {!authServerMetadataError && (
            <pre className="text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {authServerMetadata ? excerptJson(authServerMetadata, ['client_id_metadata_document_supported']) : '読み込み中...'}
            </pre>
          )}
        </Section>

        <Section step={3} title="クライアント登録（Client Registration） - Client ID Metadata Documents">
          <p className="text-sm text-gray-500 mb-4">
            Auth0 の Log Stream（Custom Webhook）からリアルタイムに受信した、CIMD（Client ID Metadata Documents）経由の認証成功リクエストです（最新の1件のみ表示）。
          </p>

          {error && (
            <div className="rounded-xl p-4 mb-4 text-sm bg-red-50 text-red-700">
              {error}（auth0logsサービスが起動しているか確認してください）
            </div>
          )}

          {loading && !error && (
            <p className="text-sm text-gray-400">読み込み中...</p>
          )}

          {!loading && !error && !latestRecord && (
            <div className="rounded-xl p-8 text-center text-sm bg-gray-50 border border-gray-200 text-gray-400">
              まだCIMD認証リクエストがありません。CIMDクライアントでログインが発生するとここに表示されます。
            </div>
          )}

          {latestRecord && (
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-gray-400 flex-shrink-0">{fmtDate(latestRecord.date)}</span>
                <span className="text-sm text-gray-700 truncate">{latestRecord.clientName ?? '(no client_name)'}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{latestRecord.userName ?? '-'}</span>
              </div>

              <dl className="text-xs space-y-1.5 font-mono">
                <div className="flex gap-2">
                  <dt className="flex-shrink-0 text-gray-500 w-36">date:</dt>
                  <dd className="break-all text-gray-900">{latestRecord.date ?? '-'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="flex-shrink-0 text-gray-500 w-36">client_id:</dt>
                  <dd className="break-all text-gray-900">{latestRecord.clientId ?? '-'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="flex-shrink-0 text-gray-500 w-36">client_name:</dt>
                  <dd className="break-all text-gray-900">{latestRecord.clientName ?? '-'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="flex-shrink-0 text-gray-500 w-36">requested_client_id:</dt>
                  <dd className="break-all text-purple-700 font-semibold">{latestRecord.requestedClientId ?? '-'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="flex-shrink-0 text-gray-500 w-36">user_name:</dt>
                  <dd className="break-all text-gray-900">{latestRecord.userName ?? '-'}</dd>
                </div>
              </dl>
              <details className="mt-3">
                <summary className="text-xs cursor-pointer text-gray-500">生ログ</summary>
                <pre className="mt-1 text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(latestRecord.raw, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </Section>
      </main>
    </>
  );
}
