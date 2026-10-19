'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { myOrgApi } from '@/lib/myOrgApi';
import type { MemberRole } from '@/types/member';
import { Tag, Check } from 'lucide-react';

interface Props {
  userId: string;
  currentRoles: MemberRole[];
  onChanged: () => void;
}

export function RoleAssignPopover({ userId, currentRoles, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [allRoles, setAllRoles] = useState<MemberRole[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentRoles.map((r) => r.id)));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // テーブルの行（<td>/<tr>）が独自のスタッキングコンテキストやoverflowを持つため、
  // 通常のabsolute配置では後続の行の下に埋もれてしまう。そのためポップオーバー本体は
  // createPortalでdocument.body直下にレンダリングし、ボタンの画面上の位置を
  // getBoundingClientRect()で計算してfixed配置する。
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // placement: ボタン下に収まらない場合は上に表示する。
  // topは「ボタンの下端から」、bottomは「ボタンの上端からビューポート下端までの距離」
  // という向きの異なる基準点なので、CSSのtop/bottomどちらを使うかで切り替える。
  // measuring: trueの間は実際のポップオーバー高さをまだ測れていないため、
  // 見た目を隠した状態でひとまずbottom配置でレンダリングし、useLayoutEffectで
  // 実測した高さに基づいて最終的な配置を確定する（固定の推定値を使わない）。
  const [position, setPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    placement: 'top' | 'bottom';
    measuring: boolean;
  } | null>(null);

  useEffect(() => {
    setSelectedIds(new Set(currentRoles.map((r) => r.id)));
  }, [currentRoles]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function handleOpen() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // 実際の高さがまだ分からないので、ひとまずbottom配置で仮に置き、
      // useLayoutEffectでの実測後に必要なら上下を切り替える。
      setPosition({ top: rect.bottom + 6, left: rect.left, placement: 'bottom', measuring: true });
    }
    setOpen(true);
    setError('');
    if (allRoles.length === 0) {
      setLoading(true);
      myOrgApi.roles
        .list()
        .then((data) => setAllRoles(data.roles ?? []))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'ロール一覧の取得に失敗しました'))
        .finally(() => setLoading(false));
    }
  }

  // ポップオーバーの実際のレンダリング高さを計測し、ビューポート下端に収まらなければ
  // 上に表示し直す。固定の推定値ではなく実測値を使うことで、過剰な余白判定を避ける。
  useLayoutEffect(() => {
    if (!open || !position?.measuring || !popoverRef.current || !buttonRef.current) return;
    const popoverHeight = popoverRef.current.getBoundingClientRect().height;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const fitsBelow = spaceBelow >= popoverHeight + 6;
    setPosition(
      fitsBelow
        ? { top: buttonRect.bottom + 6, left: buttonRect.left, placement: 'bottom', measuring: false }
        : { bottom: window.innerHeight - buttonRect.top + 6, left: buttonRect.left, placement: 'top', measuring: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position?.measuring, allRoles, loading, error]);

  function toggleRole(roleId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  async function handleSave() {
    const currentIds = new Set(currentRoles.map((r) => r.id));
    const toAssign = [...selectedIds].filter((id) => !currentIds.has(id));
    const toUnassign = [...currentIds].filter((id) => !selectedIds.has(id));
    if (toAssign.length === 0 && toUnassign.length === 0) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await Promise.all([
        toAssign.length > 0 ? myOrgApi.members.roles.assign(userId, toAssign) : Promise.resolve(),
        toUnassign.length > 0 ? myOrgApi.members.roles.unassign(userId, toUnassign) : Promise.resolve(),
      ]);
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ロールの更新に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        <Tag className="h-3 w-3" /> アサイン
      </button>

      {open && position && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              left: position.left,
              visibility: position.measuring ? 'hidden' : 'visible',
              ...(position.placement === 'bottom' ? { top: position.top } : { bottom: position.bottom }),
            }}
            className="z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
          >
            {error && <p className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>}
            {loading ? (
              <p className="py-2 text-center text-xs text-gray-400">読み込み中...</p>
            ) : allRoles.length === 0 ? (
              <p className="py-2 text-center text-xs text-gray-400">利用可能なロールがありません。</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {allRoles.map((role) => {
                  const checked = selectedIds.has(role.id);
                  return (
                    <label
                      key={role.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleRole(role.id)} />
                      <span className="truncate">{role.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2 border-t border-gray-100 pt-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="btn-primary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
              >
                <Check className="h-3 w-3" /> {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
