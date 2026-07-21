import { Header } from '@/components/layout/Header';
import Link from 'next/link';
import { serverGet } from '@/lib/serverFetch';
import { OpportunityCharts } from '@/components/charts/OpportunityCharts';
import { User } from '@/types';
import { Building2, Briefcase, Users, ClipboardList } from 'lucide-react';

export const dynamic = 'force-dynamic';

const quickActions = [
  { href: '/accounts/new',      label: '+ 顧客企業を追加' },
  { href: '/opportunities/new', label: '+ 案件を追加' },
  { href: '/contacts/new',      label: '+ 連絡先を追加' },
  { href: '/activities/new',    label: '+ 活動を記録' },
];

const overviewCards = [
  { label: '顧客企業',  href: '/accounts',      icon: Building2 },
  { label: '案件',      href: '/opportunities',  icon: Briefcase },
  { label: '連絡先',    href: '/contacts',       icon: Users },
  { label: '活動履歴',  href: '/activities',     icon: ClipboardList },
];

export default async function DashboardPage() {
  const [opportunities, users] = await Promise.all([
    serverGet('opportunities', '/opportunities') ?? [],
    serverGet('users', '/users') ?? [],
  ]);

  return (
    <>
      <Header title="ダッシュボード" />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {overviewCards.map((c) => (
            <Link key={c.href} href={c.href}
              className="border border-gray-200 rounded-xl bg-white p-5 flex flex-col gap-2 hover:shadow-md transition-shadow">
              <c.icon className="w-7 h-7 text-brand-600" />
              <span className="font-semibold text-gray-700">{c.label}</span>
              <span className="text-xs text-brand-600 mt-auto">一覧を見る →</span>
            </Link>
          ))}
        </div>

        <OpportunityCharts opportunities={opportunities} users={users as User[]} />

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">クイックアクション</h2>
          <div className="flex flex-wrap gap-3">
            {quickActions.map((a) => (
              <Link key={a.href} href={a.href}
                className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
