'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Account, User, userDisplayName } from '@/types';
import { NumberInput } from '@/components/ui/NumberInput';

interface Props {
  initial?: Partial<Account>;
  accountId?: string;
  users?: User[];
}

export function AccountForm({ initial = {}, accountId, users }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== ''),
    );
    try {
      if (accountId) {
        await api.accounts.update(accountId, body);
      } else {
        await api.accounts.create(body);
      }
      router.push('/accounts');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-2xl">
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">会社名 *</label>
          <input name="name" required defaultValue={initial.name} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">業種</label>
          <input name="industry" defaultValue={initial.industry} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ウェブサイト</label>
          <input name="website" type="url" defaultValue={initial.website} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
          <input name="phone" defaultValue={initial.phone} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">都市</label>
          <input name="city" defaultValue={initial.city} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">国</label>
          <input name="country" defaultValue={initial.country} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">従業員数</label>
          <input name="employee_count" type="number" defaultValue={initial.employee_count} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">年商（円）</label>
          <NumberInput name="annual_revenue" defaultValue={initial.annual_revenue} className="input w-full" placeholder="例: 100,000,000" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">住所</label>
          <input name="address" defaultValue={initial.address} className="input w-full" />
        </div>
        {users && users.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">オーナー</label>
            <select name="owner_id" defaultValue={initial.owner_id ?? ''} className="input w-full">
              {users.map((u) => (
                <option key={u.id} value={u.id}>{userDisplayName(u)}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? '保存中...' : accountId ? '更新する' : '作成する'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          キャンセル
        </button>
      </div>
    </form>
  );
}
