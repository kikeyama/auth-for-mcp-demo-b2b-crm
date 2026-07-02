import { Header } from '@/components/layout/Header';
import { StageBadge, ActivityTypeBadge } from '@/components/ui/Badge';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverFetch';
import { User, userDisplayName } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const [account, opportunities, contacts, activities, users] = await Promise.all([
    serverGet('accounts', `/accounts/${id}`),
    serverGet('opportunities', `/opportunities?account_id=${id}`),
    serverGet('contacts', `/contacts?account_id=${id}`),
    serverGet('activities', `/activities?account_id=${id}`),
    serverGet('users', '/users'),
  ]);
  const userMap = new Map<string, string>((users ?? []).map((u: User) => [u.id, userDisplayName(u)]));

  if (!account) notFound();

  return (
    <>
      <Header title={account.name} />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Detail card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-semibold text-gray-800">{account.name}</h2>
            <Link href={`/accounts/${id}/edit`} className="btn-secondary text-xs py-1 px-3">編集</Link>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ['業種', account.industry],
              ['電話番号', account.phone],
              ['ウェブサイト', account.website],
              ['都市', account.city],
              ['国', account.country],
              ['従業員数', account.employee_count != null ? `${account.employee_count.toLocaleString()} 人` : null],
              ['年商', account.annual_revenue != null ? `¥${Number(account.annual_revenue).toLocaleString()}` : null],
              ['住所', account.address],
              ['オーナー', userMap.get(account.owner_id) ?? account.owner_id],
            ].map(([label, value]) => value ? (
              <div key={label as string}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{value}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        {/* Opportunities */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-700">案件 ({opportunities?.length ?? 0})</h3>
            <Link href={`/opportunities/new?account_id=${id}`} className="btn-secondary text-xs py-1 px-3">+ 追加</Link>
          </div>
          {opportunities && opportunities.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">案件名</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">ステージ</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">金額</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {opportunities.map((d: any) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">
                        <Link href={`/opportunities/${d.id}`} className="hover:text-brand-600">{d.name}</Link>
                      </td>
                      <td className="px-4 py-2"><StageBadge stage={d.stage} /></td>
                      <td className="px-4 py-2 text-right text-gray-600">
                        {d.amount != null ? `¥${Number(d.amount).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/opportunities/${d.id}/edit`} className="text-xs text-brand-600 hover:underline">編集</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">案件はまだありません</p>
          )}
        </section>

        {/* Contacts */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-700">連絡先 ({contacts?.length ?? 0})</h3>
            <Link href={`/contacts/new?account_id=${id}`} className="btn-secondary text-xs py-1 px-3">+ 追加</Link>
          </div>
          {contacts && contacts.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">氏名</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">役職</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">メール</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map((c: any) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">
                        <Link href={`/contacts/${c.id}`} className="hover:text-brand-600">{c.last_name} {c.first_name}</Link>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{c.title ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{c.email ?? '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/contacts/${c.id}/edit`} className="text-xs text-brand-600 hover:underline">編集</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">連絡先はまだありません</p>
          )}
        </section>

        {/* Activities */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-700">活動履歴 ({activities?.length ?? 0})</h3>
            <Link href={`/activities/new?account_id=${id}`} className="btn-secondary text-xs py-1 px-3">+ 記録</Link>
          </div>
          {activities && activities.length > 0 ? (
            <div className="space-y-2">
              {activities.map((a: any) => (
                <Link key={a.id} href={`/activities/${a.id}`} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 items-start hover:bg-gray-50 transition-colors">
                  <ActivityTypeBadge type={a.type} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm">{a.subject}</p>
                    {a.description && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{a.description}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {a.activity_date ? new Date(a.activity_date).toLocaleDateString('ja-JP') : ''}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">活動履歴はまだありません</p>
          )}
        </section>
      </main>
    </>
  );
}
