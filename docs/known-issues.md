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
