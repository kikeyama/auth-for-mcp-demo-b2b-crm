/**
 * SDKの `sessionStore`（`SessionDataStore`）実装（Redisバックエンド）。
 *
 * 既定のCookieベースセッションは、audience+scope単位でキャッシュされるMRRTトークン
 * （`session.accessTokens`配列、`session-changes-helpers.js`の`handleSpecificAccessTokenUpdate`
 * がaudience+scopeの組み合わせごとに新規エントリを積み続ける仕組み）が増えるほどCookieが
 * 肥大化し、`431 Request Header Fields Too Large`に至る。My Organization API
 * （`myOrgApi.ts`、操作ごとに異なる`scope`ヘッダーを送る）がこの蓄積を起こしている。
 * EXAMPLES.mdが推奨する"stateful session storage"（セッション本体はサーバー側に置き、
 * Cookieにはセッション ID のみ乗せる）に切り替えることで、accessTokens配列の大きさに
 * 関係なくCookieサイズは一定になる。
 * 参照: https://github.com/auth0/nextjs-auth0/blob/main/EXAMPLES.md#database-sessions
 *
 * `update()`はSDK側のドキュメントで「単一の原子的操作」が必須とされている
 * （ログアウトによる削除と、並行するrolling writeによる再作成のTOCTOUレースを防ぐため）。
 * Redis単体のコマンドなら`SET key value XX PX ttl`（キーが存在する場合のみ更新）がすでに
 * 原子的なため、EXAMPLES.mdのPostgres/Redis例のようなLuaスクリプトは不要。
 */

import Redis from 'ioredis';
import type { SessionData, LogoutToken } from '@auth0/nextjs-auth0/types';

const DEFAULT_TTL_SECONDS = 3 * 24 * 60 * 60; // SDKの既定absoluteDuration（3日）に合わせる
const KEY_PREFIX = 'nexuscrm:session:';

let client: Redis | undefined;

function getClient(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL!);
  }
  return client;
}

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export const redisSessionStore = {
  async get(id: string): Promise<SessionData | null> {
    const raw = await getClient().get(keyFor(id));
    return raw ? (JSON.parse(raw) as SessionData) : null;
  },

  async set(id: string, session: SessionData): Promise<void> {
    await getClient().set(keyFor(id), JSON.stringify(session), 'EX', DEFAULT_TTL_SECONDS);
  },

  async update(id: string, session: SessionData): Promise<boolean> {
    // "SET ... XX" はキーが既に存在する場合のみ書き込む、Redis組み込みの原子操作。
    const result = await getClient().set(
      keyFor(id),
      JSON.stringify(session),
      'EX',
      DEFAULT_TTL_SECONDS,
      'XX'
    );
    return result === 'OK';
  },

  async delete(id: string): Promise<void> {
    await getClient().del(keyFor(id));
  },

  async deleteByLogoutToken({ sid }: LogoutToken): Promise<void> {
    // このプロジェクトはOrganizationごとに単一Connectionのsub/sidを使うのみで、
    // Multiple Custom Domains（複数issuer）は使っていないため、sidだけで十分
    // （SessionDataStoreの型のissフィルタ要件はMCDリゾルバーモード使用時のみ必須）。
    if (sid) {
      await getClient().del(keyFor(sid));
    }
  },
};
