import { Header } from '@/components/layout/Header';
import { ContactForm } from '@/components/forms/ContactForm';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function NewContactPage({ searchParams }: { searchParams: { account_id?: string } }) {
  const { account_id } = searchParams;
  const accounts = await serverGet('accounts', '/accounts') ?? [];

  return (
    <>
      <Header title="連絡先を追加" />
      <main className="flex-1 overflow-auto p-6">
        <ContactForm accounts={accounts} initial={{ account_id }} />
      </main>
    </>
  );
}
