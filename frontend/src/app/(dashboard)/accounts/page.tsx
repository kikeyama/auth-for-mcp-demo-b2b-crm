import { Header } from '@/components/layout/Header';
import Link from 'next/link';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const accounts: any[] = await serverGet('accounts', '/accounts') ?? [];

  return (
    <>
      <Header title="顧客企業" />
      <main className="flex-1 overflow-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-gray-500">{accounts.length} 件</p>
          <Link href="/accounts/new" className="btn-primary">+ 顧客企業を追加</Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">会社名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">業種</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">都市</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">電話番号</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">従業員数</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">データがありません</td></tr>
              )}
              {accounts.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/accounts/${a.id}`} className="hover:text-brand-600">{a.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.industry ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.city ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.employee_count != null ? a.employee_count.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/accounts/${a.id}/edit`} className="text-xs text-brand-600 hover:underline">編集</Link>
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
