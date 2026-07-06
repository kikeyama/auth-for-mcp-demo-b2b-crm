import { Header } from '@/components/layout/Header';
import { ActivityForm } from '@/components/forms/ActivityForm';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ account_id?: string; opportunity_id?: string; contact_id?: string }>;
}) {
  const sp = await searchParams;
  const [accounts, opportunities, contacts] = await Promise.all([
    serverGet('accounts', '/accounts'),
    serverGet('opportunities', '/opportunities'),
    serverGet('contacts', '/contacts'),
  ]);

  return (
    <>
      <Header title="活動を記録" />
      <main className="flex-1 overflow-auto p-6">
        <ActivityForm
          accounts={accounts ?? []}
          opportunities={opportunities ?? []}
          contacts={contacts ?? []}
          initial={{ account_id: sp.account_id, opportunity_id: sp.opportunity_id, contact_id: sp.contact_id }}
          returnOpportunityId={sp.opportunity_id}
        />
      </main>
    </>
  );
}
