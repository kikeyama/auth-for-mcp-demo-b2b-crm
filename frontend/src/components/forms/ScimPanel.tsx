'use client';

import { useEffect, useState, useCallback } from 'react';
import { myOrgApi, MyOrgApiError } from '@/lib/myOrgApi';
import type { IdentityProvider, ProvisioningConfig, ScimToken, ScimTokenWithSecret } from '@/types/identityProvider';
import { Copy, Check, KeyRound, Plus, Trash2, RotateCcw, ShieldOff, Zap } from 'lucide-react';

interface Props {
  idp: IdentityProvider;
}

function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では無視
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2">
      <code className={`flex-1 truncate text-xs text-gray-100 ${mono ? 'font-mono' : ''}`}>{value}</code>
      <button
        onClick={handleCopy}
        className={`flex-shrink-0 p-1 rounded transition-colors ${copied ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}
        title="コピー"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', { hour12: false });
}

export function ScimPanel({ idp }: Props) {
  const [config, setConfig] = useState<ProvisioningConfig | null>(null);
  const [tokens, setTokens] = useState<ScimToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [tokenLifetime, setTokenLifetime] = useState('');
  const [newToken, setNewToken] = useState<ScimTokenWithSecret | null>(null);
  const [deletingTokenId, setDeletingTokenId] = useState<string | null>(null);

  const scimEndpointUrl = `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/scim/v2/connections/${idp.id}`;

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    myOrgApi.provisioning
      .get(idp.id)
      .then((cfg) => {
        setConfig(cfg);
        return myOrgApi.provisioning.scimTokens.list(idp.id);
      })
      .then((data) => setTokens(data?.scim_tokens ?? []))
      .catch((err: unknown) => {
        // 404はSCIM未有効の状態として扱う（エラー表示しない）。他のエラーは表示する。
        setConfig(null);
        if (!(err instanceof MyOrgApiError && err.status === 404)) {
          setError(err instanceof Error ? err.message : 'SCIM設定の取得に失敗しました');
        }
      })
      .finally(() => setLoading(false));
  }, [idp.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleEnable() {
    setEnabling(true);
    setError('');
    try {
      const cfg = await myOrgApi.provisioning.create(idp.id);
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SCIM Provisioningの有効化に失敗しました');
    } finally {
      setEnabling(false);
    }
  }

  async function handleDisable() {
    if (!confirm('SCIM Provisioningを無効化しますか？発行済みのSCIMトークンも無効になります。')) return;
    setDisabling(true);
    try {
      await myOrgApi.provisioning.delete(idp.id);
      setConfig(null);
      setTokens([]);
      setNewToken(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '無効化に失敗しました');
    } finally {
      setDisabling(false);
    }
  }

  async function handleResetAttributes() {
    setResetting(true);
    setError('');
    try {
      const cfg = await myOrgApi.provisioning.resetAttributes(idp.id);
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'リセットに失敗しました');
    } finally {
      setResetting(false);
    }
  }

  async function handleCreateToken(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreatingToken(true);
    setError('');
    try {
      const lifetime = tokenLifetime.trim() ? Number(tokenLifetime.trim()) : undefined;
      const token = await myOrgApi.provisioning.scimTokens.create(idp.id, lifetime);
      setNewToken(token);
      setTokenLifetime('');
      const data = await myOrgApi.provisioning.scimTokens.list(idp.id);
      setTokens(data?.scim_tokens ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SCIMトークンの作成に失敗しました');
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleDeleteToken(tokenId: string) {
    if (!confirm('このSCIMトークンを削除しますか？')) return;
    setDeletingTokenId(tokenId);
    try {
      await myOrgApi.provisioning.scimTokens.delete(idp.id, tokenId);
      setTokens((prev) => prev.filter((t) => t.token_id !== tokenId));
      if (newToken?.token_id === tokenId) setNewToken(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'トークンの削除に失敗しました');
    } finally {
      setDeletingTokenId(null);
    }
  }

  if (loading) {
    return <p className="px-4 py-3 text-xs text-gray-400">SCIM設定を読み込み中...</p>;
  }

  if (!config) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <ShieldOff className="h-5 w-5" />
        </div>
        <p className="text-xs text-gray-500">このIdentity ProviderではSCIM Provisioningが有効になっていません。</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={handleEnable} disabled={enabling} className="btn-primary text-xs px-3 py-1.5 gap-1.5">
          <Zap className="h-3.5 w-3.5" /> {enabling ? '有効化中...' : 'SCIM Provisioningを有効化'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 py-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-700">SCIM Endpoint URL</p>
        <CopyField value={scimEndpointUrl} />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-700">User ID Attribute</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5">
          <code className="font-mono text-sm text-gray-900">{config.user_id_attribute || '-'}</code>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-gray-700">属性マッピング</p>
          <button
            onClick={handleResetAttributes}
            disabled={resetting}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600"
            title="User Attribute Profileの定義を再適用する"
          >
            <RotateCcw className="h-3 w-3" /> {resetting ? '更新中...' : 'User Attribute Profileから再取得'}
          </button>
        </div>
        <p className="mb-2 text-xs text-gray-400">
          マッピングはApplicationに紐づくUser Attribute Profileで管理されます（このAPIからは編集できません）。
        </p>
        {config.attributes.length === 0 ? (
          <p className="text-xs text-gray-400">属性マッピングがありません。</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">SCIM属性</th>
                  <th className="px-3 py-1.5 text-left font-medium">Auth0属性</th>
                  <th className="px-3 py-1.5 text-left font-medium">必須</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {config.attributes.map((a) => (
                  <tr key={a.provisioning_field}>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{a.provisioning_field}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{a.user_attribute}</td>
                    <td className="px-3 py-1.5 text-gray-500">{a.is_required ? '必須' : '任意'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-700">SCIMトークン</p>

        {newToken && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-1.5 text-xs font-medium text-amber-800">
              このトークンは今だけ表示されます。必ずコピーしてください。
            </p>
            <CopyField value={newToken.token} />
          </div>
        )}

        {tokens.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {tokens.map((t) => (
              <div key={t.token_id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <KeyRound className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-mono">{t.token_id}</span>
                  <span className="text-gray-400">· 作成: {fmtDate(t.created_at)}</span>
                  {t.valid_until && <span className="text-gray-400">· 期限: {fmtDate(t.valid_until)}</span>}
                </div>
                <button
                  onClick={() => handleDeleteToken(t.token_id)}
                  disabled={deletingTokenId === t.token_id}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  title="削除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleCreateToken} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-gray-700">有効期限（秒、任意）</label>
            <input
              value={tokenLifetime}
              onChange={(e) => setTokenLifetime(e.target.value)}
              className="input w-full text-sm"
              placeholder="未入力なら無期限（最小900秒）"
            />
          </div>
          <button type="submit" disabled={creatingToken} className="btn-secondary text-xs px-3 py-2 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> {creatingToken ? '作成中...' : 'トークンを作成'}
          </button>
        </form>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <button
          onClick={handleDisable}
          disabled={disabling}
          className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700"
        >
          <ShieldOff className="h-3.5 w-3.5" /> SCIM Provisioningを無効化
        </button>
      </div>
    </div>
  );
}
