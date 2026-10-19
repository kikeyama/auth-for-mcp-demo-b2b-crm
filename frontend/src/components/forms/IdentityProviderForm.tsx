'use client';

import { useEffect, useState } from 'react';
import { myOrgApi } from '@/lib/myOrgApi';
import type { IdentityProvider, OrganizationDomain } from '@/types/identityProvider';
import Link from 'next/link';
import { Globe, ArrowUpRight, ShieldCheck, Fingerprint, AlertTriangle } from 'lucide-react';

interface Props {
  initial?: IdentityProvider;
  onSaved: () => void;
  onCancel: () => void;
}

export function IdentityProviderForm({ initial, onSaved, onCancel }: Props) {
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [domains, setDomains] = useState<OrganizationDomain[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>(initial?.domains ?? []);
  const [crossAppAccessEnabled, setCrossAppAccessEnabled] = useState(
    initial?.cross_app_access_resource_app?.status === 'enabled',
  );
  const [oktaDomain, setOktaDomain] = useState(initial?.options?.domain ?? '');

  useEffect(() => {
    myOrgApi.domains
      .list()
      .then((data) => setDomains(data.organization_domains ?? []))
      .catch(() => {
        // ドメイン一覧の取得失敗は致命的ではない（選択肢が空になるだけ）。
      });
  }, []);

  const verifiedDomains = domains.filter((d) => d.status === 'verified');

  function toggleDomain(domain: string) {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain],
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedDomains.length === 0) {
      setError('HRDドメインを1つ以上選択してください。');
      return;
    }
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const str = (key: string) => (fd.get(key) as string)?.trim() || undefined;

    try {
      if (isEdit) {
        const clientSecret = str('client_secret');
        await myOrgApi.identityProviders.update(initial!.id, {
          display_name: str('display_name'),
          domains: selectedDomains,
          show_as_button: fd.get('show_as_button') === 'on',
          assign_membership_on_login: fd.get('assign_membership_on_login') === 'on',
          is_enabled: fd.get('is_enabled') === 'on',
          cross_app_access_resource_app: { status: crossAppAccessEnabled ? 'enabled' : 'disabled' },
          options: {
            domain: str('okta_domain'),
            client_id: str('client_id'),
            ...(clientSecret ? { client_secret: clientSecret } : {}),
          },
        });
      } else {
        await myOrgApi.identityProviders.create({
          name: str('name')!,
          display_name: str('display_name')!,
          strategy: 'okta',
          domains: selectedDomains,
          show_as_button: fd.get('show_as_button') === 'on',
          assign_membership_on_login: fd.get('assign_membership_on_login') === 'on',
          is_enabled: fd.get('is_enabled') === 'on',
          cross_app_access_resource_app: { status: crossAppAccessEnabled ? 'enabled' : 'disabled' },
          options: {
            domain: str('okta_domain')!,
            client_id: str('client_id')!,
            client_secret: str('client_secret')!,
          },
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface max-w-2xl overflow-hidden">
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-brand-50 to-white px-6 py-5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <Fingerprint className="h-4.5 w-4.5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">
            {isEdit ? 'Identity Providerを編集' : 'Identity Providerを追加'}
          </h2>
          <p className="text-xs text-gray-500">Okta Workforce（Enterprise Connection）</p>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!isEdit && (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">内部名（name） *</label>
              <input name="name" required className="input w-full" placeholder="例: okta-workforce" />
              <p className="text-xs text-gray-400 mt-1">作成後は変更できません。</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">表示名 *</label>
            <input
              name="display_name"
              required
              defaultValue={initial?.display_name}
              className="input w-full"
              placeholder="例: Okta (Workforce)"
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Globe className="h-3.5 w-3.5 text-gray-400" /> HRDドメイン *
            </label>
            <Link
              href="/settings/domains"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              ドメイン管理 <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {verifiedDomains.length === 0 ? (
            <p className="text-xs text-gray-400">
              検証済みのドメインがありません。
              <Link href="/settings/domains" className="text-brand-600 hover:underline">
                ドメイン管理
              </Link>
              で先にドメインを登録・検証してください。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {verifiedDomains.map((d) => {
                const selected = selectedDomains.includes(d.domain);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDomain(d.domain)}
                    className={`chip ${selected ? 'chip-selected' : 'chip-unselected'}`}
                  >
                    {selected && <ShieldCheck className="h-3.5 w-3.5" />}
                    {d.domain}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OktaドメインURL *</label>
            <input
              name="okta_domain"
              required
              value={oktaDomain}
              onChange={(e) => setOktaDomain(e.target.value)}
              className="input w-full"
              placeholder="your-org.okta.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client ID *</label>
            <input
              name="client_id"
              required
              defaultValue={initial?.options?.client_id}
              className="input w-full"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Secret {isEdit ? '（変更する場合のみ入力）' : '*'}
            </label>
            <input
              name="client_secret"
              type="password"
              required={!isEdit}
              className="input w-full"
              autoComplete="new-password"
            />
            {isEdit && (
              <p className="text-xs text-gray-400 mt-1">
                レスポンスにはClient Secretが含まれないため、現在値は表示されません。
              </p>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-gray-700">有効にする</span>
            <input type="checkbox" name="is_enabled" defaultChecked={initial?.is_enabled ?? true} className="toggle-switch" />
          </label>
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-gray-700">ログイン画面にボタンを表示</span>
            <input type="checkbox" name="show_as_button" defaultChecked={initial?.show_as_button ?? true} className="toggle-switch" />
          </label>
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-gray-700">ログイン時にOrganizationへ自動参加</span>
            <input type="checkbox" name="assign_membership_on_login" defaultChecked={initial?.assign_membership_on_login ?? false} className="toggle-switch" />
          </label>
          <div className="px-4 py-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">Cross App Access (XAA) を有効にする</span>
              <input
                type="checkbox"
                checked={crossAppAccessEnabled}
                onChange={(e) => setCrossAppAccessEnabled(e.target.checked)}
                className="toggle-switch"
              />
            </label>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                有効にするには、OktaのIssuerドメイン（{oktaDomain || 'OktaドメインURL'}）が
                Organizationの検証済みドメインである必要があります。
                <Link href="/settings/domains" className="font-medium text-brand-700 hover:underline">
                  ドメイン管理
                </Link>
                で先に検証してください。Oktaが発行するドメインのため通常のDNS検証はできません。「検証済みにする（デモ用）」を使ってください。
              </span>
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2">
            {saving ? '保存中...' : '保存'}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary text-sm px-4 py-2">
            キャンセル
          </button>
        </div>
      </div>
    </form>
  );
}
