import { Header } from '@/components/layout/Header';
import { OpportunityForm } from '@/components/forms/OpportunityForm';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [opportunity, accounts, users] = await Promise.all([
    serverGet('opportunities', `/opportunities/${id}`),
    serverGet('accounts', '/accounts'),
    serverGet('users', '/users'),
  ]);
  if (!opportunity) notFound();

  return (
    <>
      <Header title="案件を編集" />
      <main className="flex-1 overflow-auto p-6">
        <OpportunityForm initial={opportunity} opportunityId={id} accounts={accounts ?? []} users={users ?? []} />
      </main>
    </>
  );
}
