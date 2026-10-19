'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { myOrgApi } from '@/lib/myOrgApi';
import type { OrganizationDomain } from '@/types/identityProvider';
import { Plus, Trash2, ShieldCheck, Clock, XCircle, RefreshCw, Zap, Globe } from 'lucide-react';

function StatusBadge({ status }: { status: OrganizationDomain['status'] }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
        <ShieldCheck className="w-3.5 h-3.5" /> 検証済み
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
        <XCircle className="w-3.5 h-3.5" /> 検証失敗
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      <Clock className="w-3.5 h-3.5" /> 検証待ち
    </span>
  );
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<OrganizationDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [creating, setCreating] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [forceVerifyingId, setForceVerifyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    myOrgApi.domains
      .list()
      .then((data) => {
        setDomains(data.organization_domains ?? []);
        setError('');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'ドメインの取得に失敗しました');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setCreating(true);
    setError('');
    try {
      await myOrgApi.domains.create(newDomain.trim());
      setNewDomain('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ドメインの登録に失敗しました');
    } finally {
      setCreating(false);
    }
  }

  async function handleVerify(domain: OrganizationDomain) {
    setVerifyingId(domain.id);
    try {
      await myOrgApi.domains.verify(domain.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '検証の開始に失敗しました');
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleForceVerify(domain: OrganizationDomain) {
    if (!confirm(`「${domain.domain}」をDNS検証なしで強制的に検証済みにしますか？（デモ用）`)) return;
    setForceVerifyingId(domain.id);
    try {
      await myOrgApi.domains.forceVerify(domain.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '強制検証に失敗しました');
    } finally {
      setForceVerifyingId(null);
    }
  }

  async function handleDelete(domain: OrganizationDomain) {
    if (!confirm(`「${domain.domain}」を削除しますか？`)) return;
    setDeletingId(domain.id);
    try {
      await myOrgApi.domains.delete(domain.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Header title="ドメイン管理" />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-sm text-gray-500 mb-6 max-w-2xl">
          Identity Providerに関連付ける前に、DNSのTXTレコードでドメインの所有権を検証する必要があります。
          検証済みドメインはIdentity Provider作成画面のHRDドメイン選択で使用できます。
        </p>

        {error && (
          <div className="rounded-xl p-4 mb-4 text-sm bg-red-50 text-red-700">{error}</div>
        )}

        <form onSubmit={handleCreate} className="card-surface mb-6 flex max-w-xl items-center gap-3 p-4">
          <Globe className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="example.com"
            className="input flex-1 border-0 bg-transparent px-0 shadow-none focus:ring-0"
          />
          <button type="submit" disabled={creating} className="btn-primary text-sm px-4 py-2 gap-1.5 whitespace-nowrap">
            <Plus className="w-4 h-4" /> 追加
          </button>
        </form>

        {loading && !error && <p className="text-sm text-gray-400">読み込み中...</p>}

        {!loading && !error && domains.length === 0 && (
          <div className="card-surface flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
              <Globe className="h-6 w-6" />
            </div>
            <p className="text-sm text-gray-500">ドメインがまだ登録されていません。</p>
          </div>
        )}

        {!loading && domains.length > 0 && (
          <div className="space-y-3">
            {domains.map((d) => (
              <div key={d.id} className="card-surface p-4 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                      <Globe className="h-4 w-4" />
                    </div>
                    <span className="truncate font-medium text-gray-900">{d.domain}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {d.status !== 'verified' && (
                      <>
                        <button
                          onClick={() => handleVerify(d)}
                          disabled={verifyingId === d.id}
                          className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> 検証を開始
                        </button>
                        <button
                          onClick={() => handleForceVerify(d)}
                          disabled={forceVerifyingId === d.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          title="DNS検証を行わず、Management API経由で強制的にverified扱いにする（デモ用）"
                        >
                          <Zap className="w-3.5 h-3.5" /> 検証済みにする（デモ用）
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(d)}
                      disabled={deletingId === d.id}
                      className="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {d.status !== 'verified' && (
                  <div className="mt-3 ml-12 rounded-lg bg-gray-900 p-3 text-xs">
                    <p className="mb-2 text-gray-400">以下のTXTレコードをDNSに追加してください</p>
                    <div className="space-y-1 font-mono">
                      <p className="text-gray-500">
                        Host: <span className="text-gray-100">{d.verification_host}</span>
                      </p>
                      <p className="text-gray-500">
                        Value: <span className="text-gray-100">{d.verification_txt}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
