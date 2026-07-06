import { Header } from '@/components/layout/Header';
import { StageBadge, ActivityTypeBadge } from '@/components/ui/Badge';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverFetch';
import { OPPORTUNITY_STAGES, User, userDisplayName } from '@/types';

export const dynamic = 'force-dynamic';

const FIELD_LABELS: Record<string, string> = {
  name:                '案件名',
  account_id:          '顧客企業',
  stage:               'ステージ',
  amount:              '金額',
  expected_close_date: '受注予定日',
  probability:         '確度',
  description:         '説明',
};

function formatHistoryValue(fieldName: string, value: string | null, accountName?: string | null): string {
  if (value == null) return '(未設定)';
  if (fieldName === 'account_id') return accountName ?? value;
  if (fieldName === 'stage') return OPPORTUNITY_STAGES.find(s => s.value === value)?.label ?? value;
  if (fieldName === 'amount') return `¥${Number(value).toLocaleString()}`;
  if (fieldName === 'probability') return `${value}%`;
  if (fieldName === 'expected_close_date') return value.slice(0, 10);
  return value;
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [opportunity, activities, history, users] = await Promise.all([
    serverGet('opportunities', `/opportunities/${id}`),
    serverGet('activities', `/activities?opportunity_id=${id}`),
    serverGet('opportunities', `/opportunities/${id}/history`),
    serverGet('users', '/users'),
  ]);

  if (!opportunity) notFound();

  const userNameMap = new Map((users ?? [] as User[]).map((u: User) => [u.id, userDisplayName(u)]));

  // Group history entries by changed_at timestamp
  const historyGroups: { changedAt: string; changedBy: string; action: string; entries: any[] }[] = [];
  if (history && history.length > 0) {
    const groupMap = new Map<string, { changedAt: string; changedBy: string; action: string; entries: any[] }>();
    for (const row of history) {
      const key = `${row.changed_at}__${row.changed_by}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { changedAt: row.changed_at, changedBy: row.changed_by, action: row.action, entries: [] });
      }
      groupMap.get(key)!.entries.push(row);
    }
    historyGroups.push(...groupMap.values());
  }

  return (
    <>
      <Header title={opportunity.name} />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{opportunity.name}</h2>
              {opportunity.account_name && (
                <p className="text-sm text-gray-500 mt-0.5">{opportunity.account_name}</p>
              )}
            </div>
            <Link href={`/opportunities/${id}/edit`} className="btn-secondary text-xs py-1 px-3">編集</Link>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <StageBadge stage={opportunity.stage} />
            {opportunity.probability != null && (
              <span className="text-sm text-gray-500">確度: {opportunity.probability}%</span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ['金額', opportunity.amount != null ? `¥${Number(opportunity.amount).toLocaleString()}` : null],
              ['受注予定日', opportunity.expected_close_date ? opportunity.expected_close_date.slice(0, 10) : null],
              ['オーナー', userNameMap.get(opportunity.owner_id) ?? opportunity.owner_id],
            ].map(([label, value]) => value ? (
              <div key={label as string}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{value}</dd>
              </div>
            ) : null)}
          </dl>
          {opportunity.description && (
            <p className="mt-4 text-sm text-gray-600 whitespace-pre-wrap">{opportunity.description}</p>
          )}
        </div>

        {historyGroups.length > 0 && (
          <section>
            <h3 className="font-semibold text-gray-700 mb-3">変更履歴 ({historyGroups.length})</h3>
            <div className="space-y-2 max-w-2xl">
              {historyGroups.map((group, gi) => (
                <div key={gi} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      group.action === 'created'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {group.action === 'created' ? '作成' : '更新'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(group.changedAt).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {group.entries.map((entry: any, ei: number) => (
                      <li key={ei} className="text-sm text-gray-700 flex flex-wrap items-baseline gap-1">
                        <span className="font-medium text-gray-500 shrink-0">
                          {FIELD_LABELS[entry.field_name] ?? entry.field_name}:
                        </span>
                        {group.action === 'created' ? (
                          <span>{formatHistoryValue(entry.field_name, entry.new_value, entry.new_account_name)}</span>
                        ) : (
                          <>
                            <span className="line-through text-gray-400">
                              {formatHistoryValue(entry.field_name, entry.old_value, entry.old_account_name)}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span>{formatHistoryValue(entry.field_name, entry.new_value, entry.new_account_name)}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-700">活動履歴 ({activities?.length ?? 0})</h3>
            <Link href={`/activities/new?opportunity_id=${id}&account_id=${opportunity.account_id}`} className="btn-secondary text-xs py-1 px-3">+ 記録</Link>
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
