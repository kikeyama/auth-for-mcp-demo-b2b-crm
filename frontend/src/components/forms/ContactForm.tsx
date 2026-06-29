'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Contact, Account } from '@/types';

interface Props {
  initial?: Partial<Contact>;
  contactId?: string;
  accounts: Account[];
}

export function ContactForm({ initial = {}, contactId, accounts }: Props) {
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
      if (contactId) {
        await api.contacts.update(contactId, body);
      } else {
        await api.contacts.create(body);
      }
      router.push('/contacts');
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
          <label className="block text-sm font-medium text-gray-700 mb-1">姓 *</label>
          <input name="last_name" required defaultValue={initial.last_name} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">名 *</label>
          <input name="first_name" required defaultValue={initial.first_name} className="input w-full" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">顧客企業</label>
          <select name="account_id" defaultValue={initial.account_id ?? ''} className="input w-full">
            <option value="">選択しない</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
          <input name="email" type="email" defaultValue={initial.email} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
          <input name="phone" defaultValue={initial.phone} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">役職</label>
          <input name="title" defaultValue={initial.title} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">部門</label>
          <input name="department" defaultValue={initial.department} className="input w-full" />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? '保存中...' : contactId ? '更新する' : '作成する'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          キャンセル
        </button>
      </div>
    </form>
  );
}
