'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { myOrgApi } from '@/lib/myOrgApi';
import type { OrganizationMember, MemberCandidate, MemberInvitation } from '@/types/member';
import type { IdentityProvider } from '@/types/identityProvider';
import { strategyLabel } from '@/types/identityProvider';
import {
  Users, UserPlus, UserCheck, Mail, Trash2, Send, Globe, ArrowUpRight, RefreshCw, Clock, Copy, X,
} from 'lucide-react';
import Link from 'next/link';
import { RoleAssignPopover } from '@/components/forms/RoleAssignPopover';

function Avatar({ picture, name, email }: { picture?: string; name?: string; email?: string }) {
  const label = name || email || '?';
  if (picture) {
    return <img src={picture} alt={label} className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600">
      {label[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export default function MembersPage() {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [verifiedDomains, setVerifiedDomains] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [removingMembers, setRemovingMembers] = useState(false);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  const [inviteEmails, setInviteEmails] = useState('');
  const [inviting, setInviting] = useState(false);
  const [idps, setIdps] = useState<IdentityProvider[]>([]);
  const [userStores, setUserStores] = useState<{ id: string; name: string; strategy: string }[]>([]);
  // POST /member-invitationsはidentity_provider_idかuser_store_idのいずれかが必須
  // （My Organization APIの仕様。値は "idp:<id>" または "store:<id>" の形式で
  // プルダウンの選択肢を1つのstateにまとめる）。
  const [inviteRoute, setInviteRoute] = useState('');

  const [invitations, setInvitations] = useState<MemberInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [invitationsError, setInvitationsError] = useState('');
  const [deletingInvitationId, setDeletingInvitationId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    setNotice('');
    Promise.all([myOrgApi.members.list(), myOrgApi.domains.list()])
      .then(async ([membersData, domainsData]) => {
        const baseMemberList = membersData.members ?? [];
        // GET /membersのroles配列は実際には返されない（APIの既知の挙動。
        // docs/known-issues.md参照）ため、メンバーごとにGET /members/{user_id}/rolesを
        // 個別に呼んで補完する。1件の取得失敗で全体を失敗させないよう個別にcatchする。
        const memberList = await Promise.all(
          baseMemberList.map(async (m) => {
            try {
              const { roles } = await myOrgApi.members.roles.list(m.user_id);
              return { ...m, roles };
            } catch {
              return m;
            }
          }),
        );
        setMembers(memberList);
        const verified = (domainsData.organization_domains ?? [])
          .filter((d) => d.status === 'verified')
          .map((d) => d.domain);
        setVerifiedDomains(verified);
        if (verified.length === 0) {
          setCandidates([]);
          return;
        }
        const memberIds = new Set(memberList.map((m) => m.user_id));
        const found = await myOrgApi.members.candidates(verified);
        setCandidates(found.filter((c) => !memberIds.has(c.user_id)));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'メンバー情報の取得に失敗しました');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadInvitations = useCallback(() => {
    setInvitationsLoading(true);
    setInvitationsError('');
    myOrgApi.memberInvitations
      .list()
      .then((data) => setInvitations(data.invitations ?? []))
      .catch((err: unknown) => {
        setInvitationsError(err instanceof Error ? err.message : '招待一覧の取得に失敗しました');
      })
      .finally(() => setInvitationsLoading(false));
  }, []);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  async function handleDeleteInvitation(invitationId: string) {
    if (!confirm('この招待を取り消しますか？')) return;
    setDeletingInvitationId(invitationId);
    setInvitationsError('');
    try {
      await myOrgApi.memberInvitations.delete(invitationId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err) {
      setInvitationsError(err instanceof Error ? err.message : '招待の取り消しに失敗しました');
    } finally {
      setDeletingInvitationId(null);
    }
  }

  useEffect(() => {
    // 招待経路の選択肢（IdP一覧・ユーザーストア一覧）。取得失敗しても他の一覧表示には
    // 影響させず、招待フォーム側でエラーを表示する。
    Promise.all([myOrgApi.identityProviders.list(), myOrgApi.memberInvitations.userStores()])
      .then(([idpData, stores]) => {
        setIdps(idpData.identity_providers ?? []);
        setUserStores(stores);
      })
      .catch((err: unknown) => {
        console.error('招待経路の取得に失敗しました:', err);
      });
  }, []);

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCandidate(id: string) {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRemoveSelected() {
    if (selectedMemberIds.size === 0) return;
    if (!confirm(`選択した${selectedMemberIds.size}名をOrganizationから削除しますか？`)) return;
    setRemovingMembers(true);
    setError('');
    setNotice('');
    try {
      await Promise.all([...selectedMemberIds].map((id) => myOrgApi.members.delete(id)));
      // My Organization APIは書き込み直後のGETが古い状態を返すことがある（結果整合性）。
      // ここでローカルの一覧を直接書き換えると、サーバー上の実データと表示が二重管理に
      // なり、何らかの理由で削除が実際には反映されなかった場合に不整合が残る。
      // そのため自動では再取得せず、選択状態だけ解除する。最新状態は手動の
      // 「最新の情報に更新」ボタンでサーバーから取得し直す。
      setSelectedMemberIds(new Set());
      setNotice('削除リクエストを送信しました。一覧への反映には時間がかかる場合があります。「最新の情報に更新」で確認してください。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メンバーの削除に失敗しました');
    } finally {
      setRemovingMembers(false);
    }
  }

  async function handleApproveSelected() {
    if (selectedCandidateIds.size === 0) return;
    setApproving(true);
    setError('');
    setNotice('');
    try {
      await myOrgApi.members.approve([...selectedCandidateIds]);
      // 削除と同様の理由で、ここではローカルの候補一覧を書き換えない。
      // 最新状態は手動の「最新の情報に更新」ボタンで取得し直す。
      setSelectedCandidateIds(new Set());
      setNotice('承認リクエストを送信しました。一覧への反映には時間がかかる場合があります。「最新の情報に更新」で確認してください。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '承認に失敗しました');
    } finally {
      setApproving(false);
    }
  }

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const emails = inviteEmails
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    if (emails.length > 10) {
      setError('一度に招待できるのは10件までです。');
      return;
    }
    if (!inviteRoute) {
      setError('招待経路（IdPまたはユーザーストア）を選択してください。');
      return;
    }
    setInviting(true);
    setError('');
    try {
      const [kind, id] = inviteRoute.split(':', 2);
      await myOrgApi.memberInvitations.create({
        invitees: emails.map((email) => ({ email })),
        ...(kind === 'idp' ? { identity_provider_id: id } : { user_store_id: id }),
      });
      setInviteEmails('');
      alert('招待を送信しました。');
      loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待の作成に失敗しました');
    } finally {
      setInviting(false);
    }
  }

  const allMembersSelected = members.length > 0 && selectedMemberIds.size === members.length;
  const allCandidatesSelected = candidates.length > 0 && selectedCandidateIds.size === candidates.length;

  const memberCount = useMemo(() => members.length, [members]);

  function invitationRouteLabel(invitation: MemberInvitation): string {
    if (invitation.identity_provider_id) {
      const idp = idps.find((i) => i.id === invitation.identity_provider_id);
      return idp ? `${strategyLabel(idp.strategy)}（${idp.display_name}）` : invitation.identity_provider_id;
    }
    if (invitation.user_store_id) {
      const store = userStores.find((s) => s.id === invitation.user_store_id);
      return store ? `${strategyLabel(store.strategy)}（${store.name}）` : invitation.user_store_id;
    }
    return '-';
  }

  return (
    <>
      <Header title="メンバー管理" />
      <main className="flex-1 overflow-auto p-6 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            My Organization API（Early Access）を使って、Organizationのメンバーを管理します。
          </p>
          <div className="flex flex-shrink-0 items-center gap-4">
            <Link
              href="/settings/domains"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5" /> ドメイン管理 <ArrowUpRight className="h-3 w-3" />
            </Link>
            <button
              onClick={load}
              disabled={loading}
              className="btn-secondary text-xs px-3 py-1.5 gap-1.5 whitespace-nowrap"
              title="承認・削除の操作後、サーバー側への反映には数秒〜数十秒かかることがあります"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 最新の情報に更新
            </button>
          </div>
        </div>

        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{notice}</div>}

        {loading && <p className="text-sm text-gray-400">読み込み中...</p>}

        {!loading && (
          <>
            {/* 現在のメンバー */}
            <section className="card-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-600" />
                  <h2 className="text-sm font-bold text-gray-900">現在のメンバー</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    {memberCount}
                  </span>
                </div>
                <button
                  onClick={handleRemoveSelected}
                  disabled={removingMembers || selectedMemberIds.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {removingMembers
                    ? '削除中...'
                    : selectedMemberIds.size > 0
                      ? `選択した${selectedMemberIds.size}名を削除`
                      : '選択した0名を削除'}
                </button>
              </div>
              {members.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">メンバーがいません。</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allMembersSelected}
                            onChange={() =>
                              setSelectedMemberIds(
                                allMembersSelected ? new Set() : new Set(members.map((m) => m.user_id)),
                              )
                            }
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-medium">ユーザー</th>
                        <th className="px-3 py-2 text-left font-medium">ロール</th>
                        <th className="px-3 py-2 text-left font-medium">アクセスレベル</th>
                        <th className="px-3 py-2 text-left font-medium">最終ログイン</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {members.map((m) => (
                        <tr key={m.user_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedMemberIds.has(m.user_id)}
                              onChange={() => toggleMember(m.user_id)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2.5">
                              <Avatar picture={m.picture} name={m.name} email={m.email} />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-gray-900">{m.name || m.email || m.user_id}</p>
                                {m.email && <p className="truncate text-xs text-gray-400">{m.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            <div className="flex items-center gap-2">
                              {/* rolesはread:my_org:member_rolesスコープがない場合は省略される */}
                              <span>{m.roles && m.roles.length > 0 ? m.roles.map((r) => r.name).join(', ') : '-'}</span>
                              <RoleAssignPopover
                                userId={m.user_id}
                                currentRoles={m.roles ?? []}
                                onChanged={() =>
                                  setNotice(
                                    'ロールの更新をリクエストしました。一覧への反映には時間がかかる場合があります。「最新の情報に更新」で確認してください。',
                                  )
                                }
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{m.access_level}</td>
                          <td className="px-3 py-2 text-gray-400">
                            {m.last_login ? new Date(m.last_login).toLocaleString('ja-JP', { hour12: false }) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ドメイン一致の未参加ユーザー */}
            <section className="card-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-brand-600" />
                  <h2 className="text-sm font-bold text-gray-900">未参加のユーザー</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    {candidates.length}
                  </span>
                </div>
                <button
                  onClick={handleApproveSelected}
                  disabled={approving || selectedCandidateIds.size === 0}
                  className="btn-primary text-xs px-3 py-1.5 gap-1.5"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  {approving
                    ? '承認中...'
                    : selectedCandidateIds.size > 0
                      ? `選択した${selectedCandidateIds.size}名を承認`
                      : '選択した0名を承認'}
                </button>
              </div>
              <p className="mb-3 text-xs text-gray-400">
                検証済みドメイン（{verifiedDomains.length > 0 ? verifiedDomains.join(', ') : 'なし'}）のメールアドレスを持つ、
                テナント内の未参加ユーザーです。承認するとOrganizationに直接追加されます（招待不要）。
              </p>
              {candidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">未参加のユーザーはいません。</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allCandidatesSelected}
                            onChange={() =>
                              setSelectedCandidateIds(
                                allCandidatesSelected ? new Set() : new Set(candidates.map((c) => c.user_id)),
                              )
                            }
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-medium">ユーザー</th>
                        <th className="px-3 py-2 text-left font-medium">一致したドメイン</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {candidates.map((c) => (
                        <tr key={c.user_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedCandidateIds.has(c.user_id)}
                              onChange={() => toggleCandidate(c.user_id)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2.5">
                              <Avatar picture={c.picture} name={c.name} email={c.email} />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-gray-900">{c.name || c.email}</p>
                                <p className="truncate text-xs text-gray-400">{c.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{c.matched_domain}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 招待フォーム */}
            <section className="card-surface p-5">
              <div className="mb-3 flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-bold text-gray-900">メンバーを招待</h2>
              </div>
              <form onSubmit={handleInvite} className="space-y-3">
                <textarea
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  placeholder="メールアドレスを改行またはカンマ区切りで入力（最大10件）"
                  className="input w-full text-sm"
                  rows={2}
                />
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-gray-500">招待経路</label>
                    <select
                      value={inviteRoute}
                      onChange={(e) => setInviteRoute(e.target.value)}
                      className="input w-full text-sm"
                    >
                      <option value="">選択してください</option>
                      {idps.map((idp) => (
                        <option key={idp.id} value={`idp:${idp.id}`}>
                          {strategyLabel(idp.strategy)}（{idp.display_name}）
                        </option>
                      ))}
                      {userStores.map((store) => (
                        <option key={store.id} value={`store:${store.id}`}>
                          {strategyLabel(store.strategy)}（{store.name}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" disabled={inviting} className="btn-primary text-sm px-4 py-2 gap-1.5 whitespace-nowrap">
                    <Send className="h-3.5 w-3.5" /> {inviting ? '送信中...' : '招待を送信'}
                  </button>
                </div>
              </form>
            </section>

            {/* 送信済みの招待一覧 */}
            <section className="card-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-600" />
                  <h2 className="text-sm font-bold text-gray-900">送信済みの招待</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    {invitations.length}
                  </span>
                </div>
                <button
                  onClick={loadInvitations}
                  disabled={invitationsLoading}
                  className="btn-secondary text-xs px-3 py-1.5 gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 更新
                </button>
              </div>
              {invitationsError && (
                <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{invitationsError}</div>
              )}
              {invitationsLoading ? (
                <p className="py-6 text-center text-sm text-gray-400">読み込み中...</p>
              ) : invitations.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">送信済みの招待はありません。</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">メールアドレス</th>
                        <th className="px-3 py-2 text-left font-medium">招待経路</th>
                        <th className="px-3 py-2 text-left font-medium">招待者</th>
                        <th className="px-3 py-2 text-left font-medium">有効期限</th>
                        <th className="w-24 px-3 py-2 text-left font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invitations.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900">{inv.invitee.email}</td>
                          <td className="px-3 py-2 text-gray-500">{invitationRouteLabel(inv)}</td>
                          <td className="px-3 py-2 text-gray-500">{inv.inviter?.name ?? '-'}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {new Date(inv.expires_at).toLocaleString('ja-JP')}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {inv.invitation_url && (
                                <button
                                  onClick={() => navigator.clipboard.writeText(inv.invitation_url!)}
                                  title="招待URLをコピー"
                                  className="text-gray-400 hover:text-gray-700"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteInvitation(inv.id)}
                                disabled={deletingInvitationId === inv.id}
                                title="招待を取り消す"
                                className="text-gray-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
