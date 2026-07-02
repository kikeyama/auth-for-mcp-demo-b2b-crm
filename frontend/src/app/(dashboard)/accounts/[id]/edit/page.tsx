import { Header } from '@/components/layout/Header';
import { AccountForm } from '@/components/forms/AccountForm';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function EditAccountPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [account, users] = await Promise.all([
    serverGet('accounts', `/accounts/${id}`),
    serverGet('users', '/users'),
  ]);
  if (!account) notFound();

  return (
    <>
      <Header title="顧客企業を編集" />
      <main className="flex-1 overflow-auto p-6">
        <AccountForm initial={account} accountId={id} users={users ?? []} />
      </main>
    </>
  );
}
