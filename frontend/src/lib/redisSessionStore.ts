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
 *
 * OpenTelemetryトレースは`@opentelemetry/instrumentation-ioredis`の自動計装に頼らず、
 * ここで手動計装している。理由: このプロジェクトのApp Router + Turbopack構成では、
 * サーバーコードがESM形式でコンパイルされる（`.next/dev/server/*`内に
 * `import-in-the-middle`パッケージが存在することで確認済み）。OTel自動計装が使う
 * `require-in-the-middle`はCommonJSの`require()`をフックする仕組みのため、ESM経由の
 * `import`では一切発火しない（OTel公式ドキュメントの既知の制約、
 * https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md
 * — ESMでは`--experimental-loader=@opentelemetry/instrumentation/hook.mjs`という
 * Node.js起動時フラグが必要で、`instrumentation.ts`の`register()`内から後付けで
 * 有効化することはできない）。他8サービス（Express、CommonJSビルド）はこの制約を
 * 受けないため、`tracing.ts`の自動計装のみで動作する。詳細はdocs/known-issues.md参照。
 */

import Redis from 'ioredis';
import type { SessionData, LogoutToken } from '@auth0/nextjs-auth0/types';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ATTR_DB_SYSTEM_NAME, ATTR_DB_OPERATION_NAME, ATTR_DB_QUERY_TEXT } from '@opentelemetry/semantic-conventions';

const DEFAULT_TTL_SECONDS = 3 * 24 * 60 * 60; // SDKの既定absoluteDuration（3日）に合わせる
const KEY_PREFIX = 'nexuscrm:session:';
const DB_SYSTEM_NAME_VALUE_REDIS = 'redis';

const tracer = trace.getTracer('nexuscrm.redisSessionStore');

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

// ioredisの計装（@opentelemetry/instrumentation-ioredis）が実際に生成する属性名・
// span名の形式（コマンド名そのもの、SpanKind.CLIENT）に合わせ、他の自動計装が
// 効いているサービスのトレースと見た目を揃えている。
async function withSpan<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(
    operation,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
        [ATTR_DB_OPERATION_NAME]: operation,
        [ATTR_DB_QUERY_TEXT]: operation,
      },
    },
    async (span) => {
      try {
        return await fn();
      } catch (err) {
        span.recordException(err instanceof Error ? err : String(err));
        span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

export const redisSessionStore = {
  async get(id: string): Promise<SessionData | null> {
    return withSpan('get', async () => {
      const raw = await getClient().get(keyFor(id));
      return raw ? (JSON.parse(raw) as SessionData) : null;
    });
  },

  async set(id: string, session: SessionData): Promise<void> {
    return withSpan('set', async () => {
      await getClient().set(keyFor(id), JSON.stringify(session), 'EX', DEFAULT_TTL_SECONDS);
    });
  },

  async update(id: string, session: SessionData): Promise<boolean> {
    return withSpan('update', async () => {
      // "SET ... XX" はキーが既に存在する場合のみ書き込む、Redis組み込みの原子操作。
      const result = await getClient().set(
        keyFor(id),
        JSON.stringify(session),
        'EX',
        DEFAULT_TTL_SECONDS,
        'XX'
      );
      return result === 'OK';
    });
  },

  async delete(id: string): Promise<void> {
    return withSpan('delete', async () => {
      await getClient().del(keyFor(id));
    });
  },

  async deleteByLogoutToken({ sid }: LogoutToken): Promise<void> {
    return withSpan('deleteByLogoutToken', async () => {
      // このプロジェクトはOrganizationごとに単一Connectionのsub/sidを使うのみで、
      // Multiple Custom Domains（複数issuer）は使っていないため、sidだけで十分
      // （SessionDataStoreの型のissフィルタ要件はMCDリゾルバーモード使用時のみ必須）。
      if (sid) {
        await getClient().del(keyFor(sid));
      }
    });
  },
};
