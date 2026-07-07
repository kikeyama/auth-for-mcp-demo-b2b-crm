'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Activity, Account, Opportunity, Contact, ACTIVITY_TYPES } from '@/types';
import { DeleteActivityButton } from '@/components/ui/DeleteActivityButton';

interface Props {
  initial?: Partial<Activity>;
  activityId?: string;
  returnOpportunityId?: string;
  accounts: Account[];
  opportunities: Opportunity[];
  contacts: Contact[];
}

export function ActivityForm({ initial = {}, activityId, returnOpportunityId, accounts, opportunities, contacts }: Props) {
  const router = useRouter();
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [accountId,     setAccountId]     = useState(initial.account_id     ?? '');
  const [opportunityId, setOpportunityId] = useState(initial.opportunity_id ?? '');
  const [contactIds,    setContactIds]    = useState<string[]>(
    initial.contact_ids?.length
      ? initial.contact_ids
      : initial.contact_id
        ? [initial.contact_id]
        : []
  );

  const filteredOpportunities = accountId ? opportunities.filter(o => o.account_id === accountId) : [];
  const filteredContacts      = accountId ? contacts.filter(c => c.account_id === accountId)      : [];

  function handleAccountChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setAccountId(e.target.value);
    setOpportunityId('');
    setContactIds([]);
  }

  function toggleContact(id: string) {
    setContactIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => { if (v !== '') body[k] = v; });
    if (typeof body.activity_date === 'string') {
      body.activity_date = new Date(body.activity_date).toISOString();
    }
    body.contact_ids = contactIds;
    try {
      if (activityId) {
        await api.activities.update(activityId, body);
      } else {
        await api.activities.create(body);
      }
      router.push(returnOpportunityId ? `/opportunities/${returnOpportunityId}` : '/activities');
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">種別 *</label>
          <select name="type" required defaultValue={initial.type ?? 'note'} className="input w-full">
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">活動日時</label>
          <input name="activity_date" type="datetime-local"
            defaultValue={initial.activity_date?.slice(0, 16)} className="input w-full" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">件名 *</label>
          <input name="subject" required defaultValue={initial.subject} className="input w-full" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">顧客企業 *</label>
          <select name="account_id" required value={accountId} onChange={handleAccountChange} className="input w-full">
            <option value="">選択してください</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">関連案件</label>
          <select name="opportunity_id" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} disabled={!accountId} className="input w-full">
            <option value="">{accountId ? 'なし' : '先に顧客企業を選択'}</option>
            {filteredOpportunities.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            関連連絡先
            {contactIds.length > 0 && (
              <span className="ml-1 text-xs font-normal text-brand-600">{contactIds.length}名選択中</span>
            )}
          </label>
          {!accountId ? (
            <div className="input w-full text-gray-400 text-sm py-2">先に顧客企業を選択</div>
          ) : filteredContacts.length === 0 ? (
            <div className="input w-full text-gray-400 text-sm py-2">連絡先がありません</div>
          ) : (
            <div className="border border-gray-300 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
              {filteredContacts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-brand-600"
                    checked={contactIds.includes(c.id)}
                    onChange={() => toggleContact(c.id)}
                  />
                  <span className="text-sm text-gray-800">{c.last_name} {c.first_name}</span>
                  {c.title && <span className="text-xs text-gray-400">{c.title}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
          <textarea name="description" rows={4} defaultValue={initial.description} className="input w-full" />
        </div>
      </div>
      <div className="flex gap-3 pt-2 items-center">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? '保存中...' : activityId ? '更新する' : '記録する'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          キャンセル
        </button>
        {activityId && (
          <DeleteActivityButton
            id={activityId}
            returnPath={returnOpportunityId ? `/opportunities/${returnOpportunityId}` : '/activities'}
            className="ml-auto btn-danger"
          />
        )}
      </div>
    </form>
  );
}
