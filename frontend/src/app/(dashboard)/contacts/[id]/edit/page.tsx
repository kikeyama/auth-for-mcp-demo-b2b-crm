import { Header } from '@/components/layout/Header';
import { ContactForm } from '@/components/forms/ContactForm';
import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/serverFetch';

export const dynamic = 'force-dynamic';

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, accounts] = await Promise.all([
    serverGet('contacts', `/contacts/${id}`),
    serverGet('accounts', '/accounts'),
  ]);
  if (!contact) notFound();

  return (
    <>
      <Header title="連絡先を編集" />
      <main className="flex-1 overflow-auto p-6">
        <ContactForm initial={contact} contactId={id} accounts={accounts ?? []} />
      </main>
    </>
  );
}
