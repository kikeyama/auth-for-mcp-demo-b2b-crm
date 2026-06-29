'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Props {
  id: string;
  returnPath?: string;
  className?: string;
}

export function DeleteActivityButton({ id, returnPath = '/activities', className }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('この活動を削除しますか？')) return;
    setDeleting(true);
    try {
      await api.activities.delete(id);
      router.push(returnPath);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className={className ?? 'text-xs text-red-500 hover:underline disabled:opacity-50'}
      type="button"
    >
      {deleting ? '削除中...' : '削除'}
    </button>
  );
}
