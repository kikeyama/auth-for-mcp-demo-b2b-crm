'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard',  label: 'ダッシュボード', icon: '🏠' },
  { href: '/accounts',   label: '顧客企業',        icon: '🏢' },
  { href: '/opportunities', label: '案件',          icon: '💼' },
  { href: '/contacts',   label: '連絡先',           icon: '👤' },
  { href: '/activities', label: '活動履歴',         icon: '📋' },
  { href: '/mcp-debug',  label: 'MCPトークン',      icon: '🔑' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="px-6 py-5 border-b border-brand-700">
        <span className="text-xl font-bold tracking-tight">NexusCRM</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-600 text-white'
                  : 'text-brand-100 hover:bg-brand-700 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
