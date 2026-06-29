import { Header } from '@/components/layout/Header';
import { StageBadge } from '@/components/ui/Badge';
import Link from 'next/link';
import { serverGet } from '@/lib/serverFetch';
import { User, userDisplayName } from '@/types';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const [opportunities, users] = await Promise.all([
    serverGet('opportunities', '/opportunities') ?? [],
    serverGet('users', '/users') ?? [],
  ]);

  const userNameMap = new Map((users as User[]).map(u => [u.id, userDisplayName(u)]));
  const totalAmount = (opportunities as any[]).reduce((sum: number, d: any) => sum + (d.amount != null ? Number(d.amount) : 0), 0);

  return (
    <>
      <Header title="案件" />
      <main className="flex-1 overflow-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-gray-500">{(opportunities as any[]).length} 件 / 合計金額: ¥{totalAmount.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}</p>
          <Link href="/opportunities/new" className="btn-primary">+ 案件を追加</Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">案件名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">顧客企業</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ステージ</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">金額</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">確度</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">受注予定日</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">オーナー</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(opportunities as any[]).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">データがありません</td></tr>
              )}
              {(opportunities as any[]).map((d: any) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/opportunities/${d.id}`} className="hover:text-brand-600">{d.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.account_name ?? '—'}</td>
                  <td className="px-4 py-3"><StageBadge stage={d.stage} /></td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {d.amount != null ? `¥${Number(d.amount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {d.probability != null ? `${d.probability}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {d.expected_close_date ? d.expected_close_date.slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {userNameMap.get(d.owner_id) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/opportunities/${d.id}/edit`} className="text-xs text-brand-600 hover:underline">編集</Link>
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
