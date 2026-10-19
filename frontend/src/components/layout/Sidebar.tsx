'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@auth0/nextjs-auth0/client';
import { hasRole, TENANT_ADMIN_ROLE, DEV_ROLE } from '@/lib/roles';
import {
  LayoutDashboard, Building2, Briefcase, Users, ClipboardList,
  KeyRound, ShieldCheck, Fingerprint, Globe, UserCog, ChevronLeft, ChevronRight, type LucideIcon,
} from 'lucide-react';

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard',     label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/accounts',      label: '顧客企業',       icon: Building2 },
  { href: '/opportunities', label: '案件',            icon: Briefcase },
  { href: '/contacts',      label: '連絡先',          icon: Users },
  { href: '/activities',    label: '活動履歴',        icon: ClipboardList },
];

const adminNavItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/settings/members',            label: 'メンバー管理',          icon: UserCog },
  { href: '/settings/domains',            label: 'ドメイン管理',          icon: Globe },
  { href: '/settings/identity-providers', label: 'Identity Provider',    icon: Fingerprint },
];

const debugNavItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/debug/mcp-discovery', label: 'MCP認可ディスカバリー', icon: ShieldCheck },
  { href: '/debug/mcp-token',     label: 'MCPトークン',          icon: KeyRound },
];

function NavLink({ href, label, icon: Icon, active, collapsed }: {
  href: string; label: string; icon: LucideIcon; active: boolean; collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center' : ''} ${
        active
          ? 'bg-brand-600 text-white'
          : 'text-brand-100 hover:bg-brand-900 hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isTenantAdmin = hasRole(user, TENANT_ADMIN_ROLE);
  const isDev = hasRole(user, DEV_ROLE);

  return (
    <aside className={`min-h-screen bg-brand-700 text-white flex flex-col flex-shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className={`flex items-center py-5 ${collapsed ? 'justify-center px-2' : 'justify-between px-6'}`}>
        {!collapsed && <span className="text-xl font-bold tracking-tight">NexusCRM</span>}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1.5 rounded-md text-brand-100 hover:bg-brand-900 hover:text-white transition-colors flex-shrink-0"
          title={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
      <nav className="px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </nav>
      {isTenantAdmin && (
        <div className="px-3">
          <div className="border-t border-brand-100/60 mx-3 mb-3" />
          {!collapsed && (
            <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-brand-100/60">テナント管理</p>
          )}
          <div className="space-y-1">
            {adminNavItems.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
          </div>
        </div>
      )}
      {isDev && (
        <div className="px-3">
          <div className="border-t border-brand-100/60 mx-3 mb-3 mt-3" />
          {!collapsed && (
            <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-brand-100/60">デバッグ</p>
          )}
          <div className="space-y-1">
            {debugNavItems.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
