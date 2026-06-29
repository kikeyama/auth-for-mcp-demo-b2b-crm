'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Opportunity, Account, User, userDisplayName, OPPORTUNITY_STAGES } from '@/types';
import { NumberInput } from '@/components/ui/NumberInput';

interface Props {
  initial?: Partial<Opportunity>;
  opportunityId?: string;
  accounts: Account[];
  users?: User[];
}

export function OpportunityForm({ initial = {}, opportunityId, accounts, users }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => { if (v !== '') body[k] = v; });
    try {
      if (opportunityId) {
        await api.opportunities.update(opportunityId, body);
      } else {
        await api.opportunities.create(body);
      }
      router.push('/opportunities');
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
          <label className="block text-sm font-medium text-gray-700 mb-1">案件名 *</label>
          <input name="name" required defaultValue={initial.name} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">顧客企業</label>
          <select name="account_id" defaultValue={initial.account_id ?? ''} className="input w-full">
            <option value="">選択しない</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ステージ</label>
          <select name="stage" defaultValue={initial.stage ?? 'prospect'} className="input w-full">
            {OPPORTUNITY_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">金額（円）</label>
          <NumberInput name="amount" defaultValue={initial.amount} className="input w-full" placeholder="例: 1,000,000" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">確度（%）</label>
          <input name="probability" type="number" min="0" max="100" defaultValue={initial.probability} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">受注予定日</label>
          <input name="expected_close_date" type="date" defaultValue={initial.expected_close_date?.slice(0, 10)} className="input w-full" />
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
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
          <textarea name="description" rows={3} defaultValue={initial.description} className="input w-full" />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? '保存中...' : opportunityId ? '更新する' : '作成する'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          キャンセル
        </button>
      </div>
    </form>
  );
}
