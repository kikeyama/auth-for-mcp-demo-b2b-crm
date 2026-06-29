import { Header } from '@/components/layout/Header';
import { AccountForm } from '@/components/forms/AccountForm';

export const dynamic = 'force-dynamic';

export default function NewAccountPage() {
  return (
    <>
      <Header title="顧客企業を追加" />
      <main className="flex-1 overflow-auto p-6">
        <AccountForm />
      </main>
    </>
  );
}
