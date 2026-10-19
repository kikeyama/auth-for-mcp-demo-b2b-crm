# Known Issues

修正を見送った既知の問題を記録する。

---

## [MCP] fastmcp / mcp-proxy の OAuth 実装バグ（`@modelcontextprotocol/sdk` へ移行済み）

**日付**: 2026-07-23
**優先度**: 中（`services/mcp` は既に公式SDKへ移行済みのため、現状のコードには影響しない。デモの実装精度の記録として残す）

### 背景

`services/mcp` は当初 `fastmcp`（^4.3.2、内部で `mcp-proxy` に依存）で実装していたが、
MCPクライアント（`mcp-remote`）との接続テスト中に、`fastmcp`/`mcp-proxy` 側に2つの
OAuth関連の実装バグを発見した。このデモはAuth0の「Auth for MCP」機能の実装精度も
含めて見せる目的があるため、正規の `@modelcontextprotocol/typescript-sdk` へ移行し、
両方のバグを解消した。移行前の実装（コミット履歴参照）で再現していた内容を記録する。

### バグ1: `resource_metadata` URLのパス構成順序が誤っている

401レスポンスの `WWW-Authenticate` ヘッダーに含まれる `resource_metadata` の値が、
RFC 9728 で定められた順序と逆になっていた。

- **誤り（fastmcp/mcp-proxy が実際に返した値）**: `http://localhost:3006/mcp/.well-known/oauth-protected-resource`
- **正しい値**（RFC 9728 §3.1、`getOAuthProtectedResourceMetadataUrl()` の実装・doc commentで確認）: `http://localhost:3006/.well-known/oauth-protected-resource/mcp`

curlで両URLを実際に叩いて確認済み: 前者は404、後者のパスにfastmcpが実際にメタデータを配信していた
（つまりfastmcp自身が配信するURLと、自身がクライアントに広告するURLが食い違っていた）。

原因箇所: `mcp-proxy/dist/stdio-DLwYts_5.mjs` の `getWWWAuthenticateHeader(oauth, options)` が
`resource + '/.well-known/...'` の順で文字列結合しており、RFC 9728の
`/.well-known/oauth-protected-resource` + パス、という順序になっていない。

### バグ2: WWW-Authenticateヘッダーに `scope` が含まれない

MCP仕様は、401レスポンスのWWW-Authenticateヘッダーに `scope` パラメータを含めることを
許容している（RFC 6750 §3）。`fastmcp` の `oauth.protectedResource.scopesSupported` に
値を設定していても、実際に返るヘッダーには `scope` が一切含まれなかった。

原因箇所: `fastmcp/dist/chunk-LWU5CQGW.js` が `mcp-proxy` の `startHTTPServer` に渡す
oauth設定を独自に再構築しており、その際 `protectedResource.resource` のみをコピーし、
`scope` / `realm` / `error_description` などの他のフィールドを一切引き継いでいなかった。
`as any` 等の型キャストでも回避不可（型の問題ではなく実行時の挙動そのものが原因）。

### 対応

`services/mcp` を `@modelcontextprotocol/sdk`（公式SDK）の `requireBearerAuth` ミドルウェア
＋ `getOAuthProtectedResourceMetadataUrl()` に置き換えることで両方解消。公式SDKの実装は
RFC 9728のパス順序、および `scope`/`resource_metadata` を含むWWW-Authenticateヘッダーの
組み立てを正しく行っている（`@modelcontextprotocol/sdk` の
`server/auth/middleware/bearerAuth.js` で確認）。

### 移行に伴う既知の未検証事項

移行前は `authorizationEndpoint` に `?audience=` を埋め込んだ独自のAS metadata
（`/.well-known/oauth-authorization-server`）をMCPサーバー自身のドメインで配信していたが
（mcp-remoteが `audience` パラメータを付けずに `/authorize` へ遷移するため、Auth0が
opaqueトークンを発行してしまう問題への対処だった）、移行後はこのエンドポイント自体を
実装していない（参照実装 `auth-for-mcp-demo-app` に倣い、AS metadataはAuth0自身の
ドメインに一任する構成）。`mcp-remote` のソースコードを追跡した限り、AS metadataの取得は
Protected Resource Metadataの `authorization_servers[0]`（Auth0自身のドメイン）に対して
直接行われ、MCPサーバー自身が配信するAS metadataは経由しない設計になっているため、
実害はない可能性が高いが、実機（mcp-remote、Claude Desktop Connector双方）での
再検証が必要。opaqueトークンが再発した場合は、Auth0側のAPI設定（デフォルトaudience等）
での対処を検討する。

---

## [UI] 活動詳細の「戻る」ボタンが遷移元を考慮しない

**日付**: 2026-07-06  
**優先度**: 低

### 現象

活動詳細画面（`/activities/[id]`）の「戻る」ボタンの遷移先が、遷移元ではなく活動データの内容によって決まる。

- `opportunity_id` があれば → 案件詳細（`/opportunities/[id]`）
- `opportunity_id` がなければ → 活動一覧（`/activities`）

顧客企業詳細から活動詳細を開いた場合でも、案件に紐づいていると案件詳細に飛んでしまう。

### 理想の挙動

遷移元に応じて戻り先を変える。

| 遷移元 | 戻り先 |
|---|---|
| 顧客企業詳細 | 顧客企業詳細 |
| 案件詳細 | 案件詳細 |
| 活動一覧 | 活動一覧 |

### 対応方針（未実施）

`activities/[id]/page.tsx` の「戻る」リンクを Client Component に切り出して `router.back()` を呼ぶ（A案）か、活動詳細へのリンクに `?from=<遷移元パス>` を付与して読み取る（B案）で対応できる。A案が変更箇所最小。

### 該当コード

`frontend/src/app/(dashboard)/activities/[id]/page.tsx`

```ts
const backHref = activity.opportunity_id
  ? `/opportunities/${activity.opportunity_id}`
  : '/activities';
```

---

## [auth0events] 削除済みユーザーと同じuser_idでの再作成時、org_idが古いままになる

**日付**: 2026-08-12
**優先度**: 低（レアケース。手動運用時にのみ発生し得る）

### 背景

`services/auth0events`のEvent Streams同期は、`org_id`を`services/user`の`POST /users/provisional`（`user.created`用）経由でしか書かない設計で、この経路は初回作成時の`org_id`（`UNASSIGNED_ORG_ID`という予約値）を`ON CONFLICT DO UPDATE`のSET対象に含めていない（既に実org割当済みの行を誤って未割当に戻さないための意図的な設計。詳細はCLAUDE.mdの「Auth0 Event Streams によるユーザー同期」セクション参照）。

### 現象

同じ`user_id`（例: 同じ外部IdPのユーザーID）が一度`user.deleted`で削除され、その後`user.created`で再作成された場合:

- `blocked`は新しいイベントの値で正しくリセットされる（`POST /users/provisional`の動的フィールドリストに`blocked`を含めているため）
- しかし`org_id`は削除前の値のまま変化しない（このルートが`org_id`を一切更新しないため）

再作成後に**同じ**Organizationへ`organization.member.added`で再度追加される場合は実害が無い（既に正しい`org_id`が入っているため`PATCH /:id/org`の0件更新は無害なno-op）。しかし**別の**Organizationへ追加される場合、`PATCH /:id/org`のガード（`WHERE org_id = UNASSIGNED_ORG_ID`）が一致せずorg付け替えが反映されない。

### 対応方針（未実施）

CLAUDE.mdに既存の記載がある「Org Aから削除→Org Bに再招待」で発生する既知の制限（1ユーザー1org・membershipテーブル不在のスキーマに起因）と本質的に同じ制限であり、同じ理由で対応を見送っている。真に対応するには`users`テーブルをmembershipテーブルに分離する必要があり、このデモの現状の要件では過剰。

---

## [frontend] My Organization API機能の利用でセッションCookieが肥大化し、`HTTP 431`でアクセス不能になる（`@auth0/nextjs-auth0`側の既知の制限、実装側の誤りではない）【解決済み】

**日付**: 2026-10-08（発生）/ 2026-10-09（解決）
**優先度**: 解決済み（Redisセッションストアへの切り替えで対処済み。実機でのMy Org API各操作後もRedisに保存されたセッションを確認し、動作していることを確認済み）

### 背景

`frontend/src/lib/myOrgApi.ts`は、My Organization API（`/my-org/*`、SDK組み込みプロキシ経由。詳細はCLAUDE.mdの「My Organization API」セクション参照）への各操作ごとに、必要最小限の`scope`ヘッダー文字列（例: `read:my_org:domains`、`create:my_org:member_roles`等）を個別に指定している。これは[公式EXAMPLES.md](https://github.com/auth0/nextjs-auth0/blob/main/EXAMPLES.md)の"scope Header"セクションのサンプルコードと同じパターン（同一コンポーネント内で`fetchProfile`が`scope: "profile:read"`、`updateProfile`が`scope: "profile:write"`という別々のscopeヘッダーを使う例を公式ドキュメント自身が提示している）であり、**実装側の誤りではないことを確認済み**。

SDK内部（`node_modules/@auth0/nextjs-auth0/dist/utils/session-changes-helpers.js`の`handleSpecificAccessTokenUpdate`、4.31.1でソースコードを直接確認）は、同一audienceでも`requestedScope`の文字列が完全一致しない限り、セッションの`accessTokens`配列に新しいエントリを追加し続ける設計になっている。`@auth0/nextjs-auth0`はセッション全体を暗号化してCookieに格納するステートレス実装のため、エントリが増えるほどCookieサイズが線形に増加する。社内Confluence「MRRT in nextjs-auth0」（https://oktainc.atlassian.net/wiki/spaces/~5f5f175142547c007107cc9a/pages/54496284）にもこの構造的制約が明記されている（"Each unique audience+scope combination creates a separate token entry" / "Cookie-based sessions have ~4KB limit"）。

### 現象

`/settings/identity-providers`・`/settings/domains`・`/settings/members`等でMy Org API機能の各操作（IdP一覧、ドメイン検証、メンバー一覧、ロールアサイン等、互いに異なるscope文字列を要求する操作）を使い込むうち、ブラウザのCookieヘッダーが肥大化し、最終的に`http://localhost:3000`へのどのアクセスも

```
This page isn’t working
HTTP ERROR 431
```

で失敗するようになる。431は「Request Header Fields Too Large」で、サーバー側のバグではなくリクエストヘッダー（Cookie含む）そのものが上限を超えたことを示す。

### 調査結果（SDKアップグレードでは未解決）

`@auth0/nextjs-auth0`を4.24.0→4.31.1にアップグレード済み（`frontend/package.json`）。GitHub PR #2748（v4.29.0でリリース、https://github.com/auth0/nextjs-auth0/pull/2748）は`__txn_*`トランザクションCookie肥大化、およびMFAステップアップ時の同一audienceアクセストークン重複排除を修正したが、**今回の「異なるscopeで同一audienceを繰り返しリクエストする」一般的なケースは対象外**。4.31.1のソースコードを直接確認し、`handleSpecificAccessTokenUpdate`のロジック自体に変更がないことを確認済み。

GitHub `auth0/nextjs-auth0`リポジトリおよび社内Slack/Confluenceを2回にわたり調査したが、「My Organization API経由で複数scopeのトークンが蓄積して431になる」という**この具体的な事象をピンポイントで報告したIssueは見つかっていない**（根本原因自体は社内Confluenceに文書化済みだが、GitHub Issueとしては未報告の可能性が高い）。

### 復旧方法

ブラウザのDevTools → Application → Cookies で`localhost:3000`のCookieを全削除し、再ログインすれば即復旧する（確認済み）。

### 対応（解決済み）

4.31.1でも431が再発したため、GitHub Issue起票ではなく恒久対応に進んだ。[公式EXAMPLES.md](https://github.com/auth0/nextjs-auth0/blob/main/EXAMPLES.md)の"Token Management Best Practices"/"Database sessions"セクションが、まさにこのケース（複数audience+scopeの動的トークン要求）への対処として「ステートフルセッションストアへの切り替え」を公式に推奨していると確認できたため、バグではなく既知の制約と判断し、Issue化は見送った。

実装: `frontend/src/lib/redisSessionStore.ts`（SDKの`SessionDataStore`インターフェースを`ioredis`で実装）を追加し、`frontend/src/lib/auth0.ts`で`REDIS_URL`設定時のみ`sessionStore`に注入（未設定時は従来のCookieベースにフォールバック）。これによりCookieにはセッションIDのみが乗るようになり、`accessTokens`配列の大きさはCookieサイズに影響しなくなった。ローカルは`docker-compose.yml`に`redis:7.0-alpine`を追加、本番（k8s）はマネージドRedis（AWS ElastiCache、engine version 7.1）を前提に`nexuscrm-redis-secret`経由で`REDIS_URL`を注入。詳細はCLAUDE.mdの「Session storage: Cookie vs. Redis」セクション参照。

**実機確認済み（2026-10-09）**: ログイン後、`docker exec nexuscrm-redis redis-cli KEYS 'nexuscrm:session:*'`でセッションがRedis側に実際に作成されることを確認。`GET`でセッション内容（`accessTokens`配列にMy Org APIのアクセストークンが格納されている）、`TTL`で`absoluteDuration`（既定3日=259200秒）相当の有効期限が設定されていることも確認済み。

**`accessTokens`配列はMy Org APIを触り続けても無限に増え続けない。** `handleSpecificAccessTokenUpdate`は`audience`+`requestedScope`の組み合わせが完全一致する既存エントリを再利用（上書き更新）するだけで、同じ操作を繰り返しても新規エントリは増えない。エントリ数は`frontend/src/lib/myOrgApi.ts`内で実際に使われているユニークな`scope`文字列の種類数（識別・ドメイン・SCIM・メンバー管理等、合計で高々20種類程度）に収束する。

**Redis側のサイズ制約は実質問題にならない。** Redisのデフォルトの単一キー値サイズ上限は512MBで、セッション1件（JWTを含むJSON、`accessTokens`が最大20エントリ程度になっても）はせいぜい数十〜数百KB程度にしかならず、この上限に達することは想定され得ない。TTLは`redisSessionStore.ts`の`DEFAULT_TTL_SECONDS`（SDKの既定`absoluteDuration`に合わせた3日）でキー全体（セッション丸ごと）に固定で設定しているため、使われなくなったセッション自体は自動的に期限切れで削除される。

**訂正: `accessTokens`配列内の個々のエントリは、期限切れになっても自動削除されない。** SDKのソース（`node_modules/@auth0/nextjs-auth0/dist/utils/session-changes-helpers.js`・`dist/server/auth-client.js`）を確認した限り、配列から期限切れエントリをその場で取り除く仕組みは存在しない。削除（実際は上書き）が起きるのは、MFAステップアップ専用コードパス（`auth-client.js`の`handleStepUpAuthentication`、同一`audience`+`scope`の古いエントリをfilterで除去して新しいものをpushする）のみで、通常のMy Org API経由のトークン取得（`handleSpecificAccessTokenUpdate`）にはこのロジックがない。実際の挙動は、次回同じ`audience`+`scope`の組み合わせでアクセスが発生したときに`getTokenSet()`がそのエントリの期限切れを検知し、リフレッシュトークンで取得した新しいアクセストークンでその場の値を上書きする、というもの。一度しか使わない操作（例: SCIMトークンを1回だけ発行する等）の`scope`エントリは、期限切れのまま二度と更新されずセッションのTTL（3日）が切れるまで配列に残り続ける。トークン文字列自体のサイズは期限切れでも変わらないため、Redis側のサイズ懸念に実害はない。

---

## [infra] ローカルPostgreSQLとRDS本番のメジャーバージョンが不一致（16 vs. 18）

**日付**: 2026-10-09
**優先度**: 中（現状は実害なしだが、ローカルをアップグレードする際にデータ移行が必要）

### 現象

ローカル開発環境は`docker-compose.yml`で`postgres:16-alpine`（実際に動かしているコンテナ`nexuscrm-db`で確認した実バージョンは`16.14`）を使用しているが、本番のRDSは`18.4`で稼働している。メジャーバージョンが2世代離れている。

### 背景

ローカルの実データは名前付きDockerボリューム`nexuscrm-pgdata`（`docker inspect`で確認したマウント先: コンテナ内`/var/lib/postgresql/data`、ホスト側実体は`/var/lib/docker/volumes/nexuscrm-pgdata/_data`）に保存されている。なお、このボリュームは`docker-compose.yml`が`docker compose up`時に生成する`<プロジェクト名>_postgres_data`とは別名のため、現在動いている`nexuscrm-db`コンテナは`docker compose up`経由ではなく個別に起動されたものと見られる。

### リスク

PostgreSQLはメジャーバージョンをまたぐとデータディレクトリのオンディスク形式に互換性がない。`postgres:16-alpine`→`postgres:18-alpine`のようにイメージタグだけを変更して同じボリュームをそのまま再マウントすると、新しいメジャーバージョンのサーバーがデータディレクトリのバージョン不一致を検知して起動に失敗する（データが消えるわけではないが、そのままでは読み出せない）。

### 対応方針（未実施）

ローカルをRDSと同じ18系へ上げる場合、以下のいずれかの移行手順が必要（まだ着手していない）:
1. `pg_dump`で16からロジカルバックアップを取得し、新規に作成した18のボリューム/コンテナへ`pg_restore`（または`psql`）で流し込む
2. PostgreSQL公式の`pg_upgrade`ツールを使う（Docker環境では一時的に新旧両方のバイナリを使える構成が必要なため、やや手間が増える）

ユーザー判断でこのフォローアップは別タスクとして後日検討することとし、今回は現状確認のみで対応を見送った。

---

## [My Organization API] `GET /members` のレスポンスに `last_login`・`roles` フィールドが含まれない（実際には値があるはずのメンバーでも）

**日付**: 2026-10-08
**優先度**: 低（`roles`は回避策（個別エンドポイントへのフォールバック）を実装済み。`last_login`は表示上の欠落のみで他機能への実害はない。両方とも原因がAuth0側のAPI実装/ドキュメントのどちらにあるか未確定）

### 背景

`frontend/src/app/(dashboard)/settings/members`は`GET /my-org/v1/members`のレスポンスを表示する。OpenAPI仕様（`OrgMemberBase`）では`last_login`は`readOnly: true`・`format: date-time`の任意フィールド。`roles`も`OrgMember`側で「Only the first 10 roles are returned here」という説明付きの任意フィールドとして定義されている。いずれも必須フィールドではない。

### 現象

#### `last_login`

実際にOrganizationへ何度もログインしているユーザー（`kunihiko.ikeyama@atko.email`、`auth0|6a3dea82b632d25d2683651c`）について、`GET /members`のレスポンスに`last_login`キー自体が一切含まれない（`null`や空文字ではなく、フィールドが存在しない）。

```json
{
  "user_id": "auth0|6a3dea82b632d25d2683651c",
  "email": "kunihiko.ikeyama@atko.email",
  "name": "kunihiko.ikeyama@atko.email",
  "created_at": "2026-06-26T02:57:06.740000Z",
  "updated_at": "2026-10-07T04:24:45.294000Z",
  "access_level": "limited"
}
```

同じOrganizationの別メンバー（`john.doe@atko.email`）にも同様に`last_login`が含まれない。

#### `roles`

同じく`kunihiko.ikeyama@atko.email`には実際には`Admin`ロールが割り当てられている（Auth0ダッシュボードで確認済み）にもかかわらず、`GET /members`のレスポンス（上記例）には`roles`キー自体が一切含まれない。`read:my_org:members`と`read:my_org:member_roles`の両スコープを要求しても変化しない。

### 原因（未確定）

OpenAPI仕様上の説明文だけでは、以下のいずれが原因かは未確認：
- Organizationにスコープされた値（最終ログイン・ロール）が、何らかの理由で一覧取得時には実際に記録・反映されていない（API実装側の不具合の可能性）
- 仕様のドキュメント記載自体が不正確で、実際にはAPIが返さない/別の条件下でのみ返るフィールドである可能性（ドキュメント記載ミスの可能性）

ユーザー側で実際に何度もこのOrganizationにログインしており、かつ実際にロールが割り当てられていることを確認済みのため、「値自体が存在しない」という理屈では説明できない。

### 対応方針

**`roles`は回避策を実装済み**: `frontend/src/app/(dashboard)/settings/members/page.tsx`の`load()`で、`GET /members`の結果をそのまま使わず、メンバーごとに個別の`GET /members/{user_id}/roles`（`myOrgApi.members.roles.list()`）を呼んでロール情報を補完している（1人分の取得失敗は個別にcatchし、他のメンバー表示に影響しないようにしている）。

**`last_login`は未対応**: 一覧取得以外にメンバー単位で最終ログイン日時だけを取得するMy Organization APIのエンドポイントが見当たらないため、`roles`と同様の個別フォールバックができない。`frontend/src/types/member.ts`の`OrganizationMember.last_login`は仕様通り`optional`としてあり、UI側も値がない場合は`-`を表示するフォールバック済みなので、これ以上のアプリ側対応は見送っている。

いずれもAuth0のMy Organization API（Early Access）自体の実装またはドキュメントの問題である可能性が高く、Auth0サポート/Early Accessフィードバック経由での報告を検討する。

---

## [My Organization API] Cross App Access (XAA) の有効化要件が、顧客（Organization管理者）のセルフサービスでは原理的に満たせない

**日付**: 2026-10-14
**優先度**: 高（設計上の構造的制約であり、現状のEarly Access仕様のままではGA化できないレベルの欠陥と判断。デモ用バイパスで回避済みだが、本番運用では未解決）

### 現象

Identity Provider（Okta Workforce接続）にCross App Access（XAA、`cross_app_access_resource_app`）を有効化しようとすると、以下の400エラーで拒否される：

```
{"status":400,"type":"https://auth0.com/api-errors#A0E-400-0001","title":"Bad Request",
 "detail":"The issuer domain \"demo-jade-octopus-88001.okta.com\" must be a verified organization discovery domain to enable cross-app access"}
```

この`demo-jade-octopus-88001.okta.com`は**Okta自身が発行・管理するテナントドメイン**であり、顧客（Organization管理者）はこのドメインのDNSを所有していない。そのため、既存の`/settings/domains`機能が前提とする「DNS TXTレコードを追加して所有権を証明する」というセルフサービス検証フローは、このドメインに対して原理的に実行不可能。

### 原因の調査過程（確認済み）

1. テナント全体のCross App Access EA機能自体は有効化されていることを確認（ダッシュボードのトグルUI）。
2. それでも`PATCH /identity-providers/{idp_id}`に`cross_app_access_resource_app: {status: "enabled"}`を送ると`400 Invalid identity provider payload`で拒否される。原因はテナント側のConnection Profileに`cross_app_access_resource_app`の許可設定（`default_value`/`allowed_values`）がまだ定義されていなかったこと。これを追加した後、エラーメッセージが上記の「issuer domainの検証」要件に変化した。
3. 社内Slack（`#third-party-apps`、David Lozano、2026-07-21、https://okta.enterprise.slack.com/archives/C09EXBUBYJE/p1784617062925619）で、**HRD用のドメイン検証とXAA用のドメイン検証は意図的に分離された別物**であることを確認：
   > "This means this is decoupled from what we need to do for XAA: make sure the domain of the OIDC issuer for the connection is listed as a verified domain for the org, and therefore XAA and HRD can be independently configured for a connection."
   
   同スレッドでCarlos Mostek（Okta社内）が明確に確認：
   > "If an org admin tries to add an OIDC issuer for a connection for XAA, we will require that the domain is in `organization_connections`. Whether or not that domain is in `domain_aliases` should have no bearing on this"

つまり、`/settings/identity-providers`でHRD用に検証済みの会社ドメイン（例: `nexuscrm.com`）を持っていても、それはXAAの要件には一切使えず、**IdPのOIDC issuerドメインそのもの**（Oktaの場合は`<tenant>.okta.com`）を別途Organizationの検証済みドメインとして登録する必要がある、という設計になっている。

### この設計の構造的な問題

Okta社内の別チームが、全く同じ構造の問題を既に文書化している（Confluence「RAPID: Apple Wallet Domain Verification Strategy」、https://oktainc.atlassian.net/wiki/spaces/oktapersonal/pages/804851353）：

> "Apple's domain verification technique requires customers modify DNS records for their domain, which **is not available for Okta-owned subdomains** and conflicts with Okta's customer-hosted domain configuration..."

Apple Walletの文脈だが、「ベンダー（Okta）が所有するサブドメインは、顧客がDNSを所有していないため検証できない」という制約は、XAAのissuerドメイン検証要件にもそのまま当てはまる。Sheena Allan（Okta社内、2026-07-17、https://okta.enterprise.slack.com/archives/C09EXBUBYJE/p1784219520810989）も同種の懸念を事前に提起していた：

> "Is the domain from the discovery_url (the IdP's domain, e.g. acme.okta.com, sts.windows.net) potentially different from the org's verified domains (user email domains, e.g. acme.com). So even for orgs that have done domain verification, the issuer domain resolved from the discovery URL may never match - do we need to classify the domains purpose?"

この懸念が議論された形跡はSlack上にあるが、**セルフサービスでこの種のドメインを検証可能にする解決策が実装されたことを示す記録は見つかっていない**。

### 現在の唯一の回避策（セルフサービスではない）

Carlos Mostek（同スレッド、2026-07-21）：

> "NOTE: A tenant admin can just add a verified domain to an organization if they don't want to make the org admin go through the txt verification."

つまりAuth0/Okta側が公式に想定している唯一の回避策は、**テナント管理者（Auth0運営側の人間、または同等の権限を持つ運用者）が、Organization管理者の代わりに手動でドメインをverified扱いにする**という、顧客のセルフサービスの外側で行う運用対応のみ。これはOrganization管理者への委任（delegated admin）を目的としたMy Organization APIの設計思想そのものと矛盾する——顧客に委任したはずの操作が、結局ベンダー側の人間の手作業に戻ってしまう。

このプロジェクトの`/settings/domains`に実装済みの「検証済みにする（デモ用）」ボタン（Management APIの`PATCH /organizations/{org_id}/discovery-domains/{discovery_domain_id}`で`status: verified`を直接書き込む、CLAUDE.md「My Organization API」セクション参照）を使い、`demo-jade-octopus-88001.okta.com`を強制的にverified扱いにすることで、このデモでは動作を確認できた。しかしこれは実際のDNS所有権証明をバイパスするデモ専用の抜け道であり、本番運用でOrganization管理者が自分でこの操作を行う手段は存在しない。

### 評価

Okta自身が発行するIdPドメイン（`*.okta.com`）に対してXAAを有効化する一般的なユースケースにおいて、顧客側のセルフサービスでこの前提条件を満たす手段が存在しない。My Organization APIが「Organization管理者への委任」を目的として設計されている以上、この要件はEarly Access段階の未解決のギャップであり、Okta/Auth0自身のIdPを使う構成（このデモがまさにそれ）でセルフサービス運用が成立しない状態のままGA化するのは時期尚早と判断する。
