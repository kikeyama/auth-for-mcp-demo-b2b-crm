'use client';

import { useState } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  const { user } = useUser();
  // デバッグ用: ID Tokenのクレーム（ロールカスタムクレーム等）が実際にsession.userに
  // 載っているかを画面上で確認できるようにする。クリックでJSONをトグル表示するだけで、
  // どこかに送信・保存はしない。
  const [showDebug, setShowDebug] = useState(false);

  return (
    <header className="relative bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        {action}
        <button
          onClick={() => setShowDebug((v) => !v)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          title="session.userの内容を表示（デバッグ用）"
        >
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="hidden sm:block">{user?.name ?? user?.email}</span>
        </button>
        <a
          href="/auth/logout"
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ログアウト
        </a>
      </div>

      {showDebug && (
        <div className="absolute right-6 top-full z-50 mt-1.5 w-[32rem] max-h-96 overflow-auto rounded-xl border border-gray-200 bg-gray-900 p-4 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-gray-400">session.user（デバッグ用）</p>
          <pre className="whitespace-pre-wrap break-all text-xs text-gray-100">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>
      )}
    </header>
  );
}
