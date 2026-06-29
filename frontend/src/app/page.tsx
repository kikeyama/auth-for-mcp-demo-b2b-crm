import { auth0 } from '@/lib/auth0';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth0.getSession();
  if (session) redirect('/dashboard');

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600">
      <div className="bg-white rounded-2xl shadow-2xl p-12 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">NexusCRM</h1>
        <p className="text-gray-500 mb-8">B2B Sales & Customer Management</p>
        <a
          href="/auth/login?returnTo=/dashboard"
          className="block w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          ログイン
        </a>
        <p className="text-xs text-gray-400 mt-6">
          Powered by Auth0 Organizations
        </p>
      </div>
    </main>
  );
}
