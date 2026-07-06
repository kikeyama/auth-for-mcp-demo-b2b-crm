import { Header } from '@/components/layout/Header';
import { ActivityTypeBadge } from '@/components/ui/Badge';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [contact, activities] = await Promise.all([
    serverGet('contacts', `/contacts/${id}`),
    serverGet('activities', `/activities?contact_id=${id}`),
  ]);

  if (!contact) notFound();

  return (
    <>
      <Header title={`${contact.last_name} ${contact.first_name}`} />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{contact.last_name} {contact.first_name}</h2>
              {contact.account_name && (
                <p className="text-sm text-gray-500 mt-0.5">{contact.account_name}</p>
              )}
            </div>
            <Link href={`/contacts/${id}/edit`} className="btn-secondary text-xs py-1 px-3">編集</Link>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ['役職', contact.title],
              ['部門', contact.department],
              ['メール', contact.email],
              ['電話番号', contact.phone],
            ].map(([label, value]) => value ? (
              <div key={label as string}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{value}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-700">活動履歴 ({activities?.length ?? 0})</h3>
            <Link
              href={`/activities/new?contact_id=${id}${contact.account_id ? `&account_id=${contact.account_id}` : ''}`}
              className="btn-secondary text-xs py-1 px-3"
            >
              + 記録
            </Link>
          </div>
          {activities && activities.length > 0 ? (
            <div className="space-y-2">
              {activities.map((a: any) => (
                <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 items-start">
                  <ActivityTypeBadge type={a.type} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm">{a.subject}</p>
                    {a.description && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{a.description}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {a.activity_date ? new Date(a.activity_date).toLocaleDateString('ja-JP') : ''}
                  </span>
                </div>
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
