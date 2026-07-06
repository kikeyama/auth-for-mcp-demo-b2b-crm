import { Header } from '@/components/layout/Header';
import { ActivityTypeBadge } from '@/components/ui/Badge';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverFetch';
import { ACTIVITY_TYPES } from '@/types';

export const dynamic = 'force-dynamic';

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const activity = await serverGet('activities', `/activities/${id}`);
  if (!activity) notFound();

  const opportunity = activity.opportunity_id
    ? await serverGet('opportunities', `/opportunities/${activity.opportunity_id}`)
    : null;

  let contacts: any[] = [];
  if (activity.contact_ids?.length) {
    const allContacts = await serverGet('contacts', `/contacts?account_id=${activity.account_id}`);
    contacts = (allContacts ?? []).filter((c: any) => activity.contact_ids.includes(c.id));
  }

  const typeLabel = ACTIVITY_TYPES.find(t => t.value === activity.type)?.label ?? activity.type;
  const backHref = activity.opportunity_id
    ? `/opportunities/${activity.opportunity_id}`
    : '/activities';

  return (
    <>
      <Header title="活動詳細" />
      <main className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl space-y-5">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3 flex-wrap">
              <ActivityTypeBadge type={activity.type} />
              <h2 className="text-lg font-semibold text-gray-800">{activity.subject}</h2>
            </div>
            <Link href={`/activities/${id}/edit`} className="btn-secondary text-xs py-1 px-3 shrink-0">編集</Link>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {activity.activity_date && (
              <div>
                <dt className="text-gray-500">活動日時</dt>
                <dd className="font-medium text-gray-800 mt-0.5">
                  {new Date(activity.activity_date).toLocaleString('ja-JP')}
                </dd>
              </div>
            )}
            {activity.account_name && (
              <div>
                <dt className="text-gray-500">顧客企業</dt>
                <dd className="font-medium mt-0.5">
                  <Link href={`/accounts/${activity.account_id}`} className="text-brand-600 hover:underline">
                    {activity.account_name}
                  </Link>
                </dd>
              </div>
            )}
            {opportunity && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">関連案件</dt>
                <dd className="font-medium mt-0.5">
                  <Link href={`/opportunities/${activity.opportunity_id}`} className="text-brand-600 hover:underline">
                    {opportunity.name}
                  </Link>
                </dd>
              </div>
            )}
            {contacts.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">関連連絡先</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {contacts.map((c: any) => (
                    <span key={c.id} className="inline-flex items-center text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">
                      {c.last_name} {c.first_name}
                      {c.title && <span className="text-gray-400 ml-1">· {c.title}</span>}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {activity.description && (
            <div>
              <p className="text-sm text-gray-500 mb-2">内容</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 leading-relaxed">
                {activity.description}
              </p>
            </div>
          )}

          <div className="pt-1">
            <Link href={backHref} className="btn-secondary text-sm">← 戻る</Link>
          </div>
        </div>
      </main>
    </>
  );
}
