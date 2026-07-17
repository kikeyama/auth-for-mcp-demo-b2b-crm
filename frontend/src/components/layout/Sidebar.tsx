'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard',  label: 'ダッシュボード', icon: '🏠' },
  { href: '/accounts',   label: '顧客企業',        icon: '🏢' },
  { href: '/opportunities', label: '案件',          icon: '💼' },
  { href: '/contacts',   label: '連絡先',           icon: '👤' },
  { href: '/activities', label: '活動履歴',         icon: '📋' },
];

const adminNavItems = [
  { href: '/mcp-debug', label: 'MCPトークン', icon: '🔑' },
];

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'text-brand-100 hover:bg-brand-700 hover:text-white'
      }`}
    >
      <span>{icon}</span>
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="w-56 min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="px-6 py-5 border-b border-brand-700">
        <span className="text-xl font-bold tracking-tight">NexusCRM</span>
      </div>
      <nav className="px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="px-3">
        <div className="border-t border-brand-700 mx-3 mb-3" />
        <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-brand-100/60">管理</p>
        <div className="space-y-1">
          {adminNavItems.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>
      </div>
    </aside>
  );
}
