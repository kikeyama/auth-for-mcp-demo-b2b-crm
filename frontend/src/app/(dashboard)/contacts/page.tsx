import { Header } from '@/components/layout/Header';
import Link from 'next/link';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  const contacts: any[] = await serverGet('contacts', '/contacts') ?? [];

  return (
    <>
      <Header title="連絡先" />
      <main className="flex-1 overflow-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-gray-500">{contacts.length} 件</p>
          <Link href="/contacts/new" className="btn-primary">+ 連絡先を追加</Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">氏名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">顧客企業</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">役職</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">部門</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">メール</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">電話番号</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">データがありません</td></tr>
              )}
              {contacts.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/contacts/${c.id}`} className="hover:text-brand-600">
                      {c.last_name} {c.first_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.account_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.title ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.department ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.email ? <a href={`mailto:${c.email}`} className="hover:text-brand-600">{c.email}</a> : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/contacts/${c.id}/edit`} className="text-xs text-brand-600 hover:underline">編集</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
