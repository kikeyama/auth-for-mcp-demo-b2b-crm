import { Header } from '@/components/layout/Header';
import { OpportunityForm } from '@/components/forms/OpportunityForm';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function NewOpportunityPage({ searchParams }: { searchParams: { account_id?: string } }) {
  const { account_id } = searchParams;
  const [accounts, users] = await Promise.all([
    serverGet('accounts', '/accounts'),
    serverGet('users', '/users'),
  ]);

  return (
    <>
      <Header title="案件を追加" />
      <main className="flex-1 overflow-auto p-6">
        <OpportunityForm accounts={accounts ?? []} users={users ?? []} initial={{ account_id }} />
      </main>
    </>
  );
}
