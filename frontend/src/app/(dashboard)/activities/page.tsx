import { Header } from '@/components/layout/Header';
import { ActivityTypeBadge } from '@/components/ui/Badge';
import { DeleteActivityButton } from '@/components/ui/DeleteActivityButton';
import Link from 'next/link';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function ActivitiesPage() {
  const activities: any[] = await serverGet('activities', '/activities') ?? [];

  return (
    <>
      <Header title="活動履歴" />
      <main className="flex-1 overflow-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-gray-500">{activities.length} 件</p>
          <Link href="/activities/new" className="btn-primary">+ 活動を記録</Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">種別</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">件名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">顧客企業</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">活動日時</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activities.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">データがありません</td></tr>
              )}
              {activities.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><ActivityTypeBadge type={a.type} /></td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/activities/${a.id}`} className="hover:text-brand-600 hover:underline">{a.subject}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.account_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {a.activity_date ? new Date(a.activity_date).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right flex gap-3 justify-end">
                    <Link href={`/activities/${a.id}/edit`} className="text-xs text-brand-600 hover:underline">編集</Link>
                    <DeleteActivityButton id={a.id} />
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
