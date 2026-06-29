'use client';

import { useUser } from '@auth0/nextjs-auth0/client';

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  const { user } = useUser();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        {action}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="hidden sm:block">{user?.name ?? user?.email}</span>
        </div>
        <a
          href="/auth/logout"
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ログアウト
        </a>
      </div>
    </header>
  );
}
