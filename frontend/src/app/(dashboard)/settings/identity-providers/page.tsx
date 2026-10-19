'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { myOrgApi } from '@/lib/myOrgApi';
import type { IdentityProvider } from '@/types/identityProvider';
import { IdentityProviderForm } from '@/components/forms/IdentityProviderForm';
import { ScimPanel } from '@/components/forms/ScimPanel';
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, Fingerprint, Globe, ArrowUpRight, KeyRound, ChevronDown, Copy, Check } from 'lucide-react';
import Link from 'next/link';

export default function IdentityProvidersPage() {
  const [providers, setProviders] = useState<IdentityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<IdentityProvider | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copyingToken, setCopyingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    myOrgApi.identityProviders
      .list()
      .then((data) => {
        setProviders(data.identity_providers ?? []);
        setError('');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Identity Providerの取得に失敗しました');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(idp: IdentityProvider) {
    if (!confirm(`「${idp.display_name}」を削除しますか？この操作は取り消せません。`)) return;
    setDeletingId(idp.id);
    try {
      await myOrgApi.identityProviders.delete(idp.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCopyToken() {
    setCopyingToken(true);
    try {
      const res = await fetch('/api/debug/my-org-token');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // fetch待機中にdocumentのフォーカスが外れていると、Clipboard APIが
      // "Document is not focused" で失敗する。書き込み直前にウィンドウへ
      // フォーカスを戻すことで回避する。
      window.focus();
      await navigator.clipboard.writeText(data.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 1500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'トークンの取得に失敗しました');
    } finally {
      setCopyingToken(false);
    }
  }

  const showForm = creating || editing !== null;

  return (
    <>
      <Header title="Identity Provider（Okta Workforce）" />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-sm text-gray-500 mb-4">
          My Organization API（Early Access）を使って、OrganizationにOkta Workforceの
          Enterprise Connectionを追加・管理します。
        </p>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/settings/domains"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5" /> ドメイン管理 <ArrowUpRight className="h-3 w-3" />
            </Link>
            <button
              onClick={handleCopyToken}
              disabled={copyingToken}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 whitespace-nowrap disabled:opacity-50"
              title="My Organization APIのアクセストークンをクリップボードにコピー（curl等での動作確認用）"
            >
              {tokenCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              {tokenCopied ? 'コピーしました' : 'トークンコピー（デバッグ用）'}
            </button>
          </div>
          {!showForm && (
            <button onClick={() => setCreating(true)} className="btn-primary text-sm px-3 py-1.5 gap-1.5">
              <Plus className="w-4 h-4" /> 新規追加
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl p-4 mb-4 text-sm bg-red-50 text-red-700">
            {error}
          </div>
        )}

        {showForm && (
          <div className="mb-6">
            <IdentityProviderForm
              initial={editing ?? undefined}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
              onSaved={() => {
                setCreating(false);
                setEditing(null);
                load();
              }}
            />
          </div>
        )}

        {loading && !error && (
          <p className="text-sm text-gray-400">読み込み中...</p>
        )}

        {!loading && !error && providers.length === 0 && !showForm && (
          <div className="card-surface flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
              <Fingerprint className="h-6 w-6" />
            </div>
            <p className="text-sm text-gray-500">Identity Providerがまだ登録されていません。</p>
            <button onClick={() => setCreating(true)} className="btn-primary text-sm px-4 py-2 gap-1.5">
              <Plus className="w-4 h-4" /> 最初のIdentity Providerを追加
            </button>
          </div>
        )}

        {!loading && providers.length > 0 && (
          <div className="space-y-3">
            {providers.map((idp) => {
              const expanded = expandedId === idp.id;
              return (
                <div key={idp.id} className="card-surface overflow-hidden transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <Fingerprint className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{idp.display_name}</span>
                        {idp.is_enabled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            <CheckCircle2 className="w-3 h-3" /> 有効
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                            <XCircle className="w-3 h-3" /> 無効
                          </span>
                        )}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          {idp.access_level}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-gray-400">{idp.options?.domain ?? '-'}</p>
                      {idp.domains && idp.domains.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {idp.domains.map((d) => (
                            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                              <Globe className="h-3 w-3" /> {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        onClick={() => setExpandedId(expanded ? null : idp.id)}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                          expanded ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                        title="SCIM Provisioning"
                      >
                        <KeyRound className="w-3.5 h-3.5" /> SCIM
                        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      <button
                        onClick={() => setEditing(idp)}
                        className="p-2 rounded-md text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        title="編集"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(idp)}
                        disabled={deletingId === idp.id}
                        className="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-gray-100 bg-gray-50/60">
                      <ScimPanel idp={idp} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
