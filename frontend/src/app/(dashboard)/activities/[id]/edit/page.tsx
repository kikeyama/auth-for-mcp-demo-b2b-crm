import { Header } from '@/components/layout/Header';
import { ActivityForm } from '@/components/forms/ActivityForm';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [activity, accounts, opportunities, contacts] = await Promise.all([
    serverGet('activities', `/activities/${id}`),
    serverGet('accounts', '/accounts'),
    serverGet('opportunities', '/opportunities'),
    serverGet('contacts', '/contacts'),
  ]);
  if (!activity) notFound();

  return (
    <>
      <Header title="活動を編集" />
      <main className="flex-1 overflow-auto p-6">
        <ActivityForm
          initial={activity}
          activityId={id}
          returnOpportunityId={activity.opportunity_id}
          accounts={accounts ?? []}
          opportunities={opportunities ?? []}
          contacts={contacts ?? []}
        />
      </main>
    </>
  );
}
