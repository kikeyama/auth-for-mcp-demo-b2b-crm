# Auth0 Event Streams によるユーザー情報の非同期同期（第4版）

第3版からの主な変更点: **Management APIへの依存を撤廃**。`organization.member.added`だけではプロフィール情報が取れない問題（第3版で確認済み）を、Management API補完ではなく`user.created`イベント（フルプロフィールを含むと推定）＋ 未割当プレースホルダー行 ＋ 専用org割当エンドポイントの組み合わせで解決する。

## 確認済みの事実

- **Auth0 Event Streamsの配信先はWebhook/AWS EventBridge/Auth0 Actionsの3種類**。既存の`services/auth0logs`（Log Stream受信）と同じ Webhook + `Authorization: Bearer <shared secret>` パターンがそのまま使える。（[Create an Event Stream](https://auth0.com/docs/customize/events/create-an-event-stream)）
- **SCIMの操作とAuth0イベントの対応**（[Configure Inbound SCIM](https://auth0.com/docs/authenticate/protocols/scim/configure-inbound-scim)、および実際に取得した本番イベントペイロードで確認済み）:
  - OktaでSCIM DELETE（完全削除）→ Auth0側もユーザーを実際に削除 → `user.deleted`
  - OktaでSCIM PATCH `active:false`（無効化・アプリのアサイン解除・グループからの削除）→ Auth0は削除せず`blocked:true`を設定 → **`user.updated`**（`user.deleted`ではない）
  - 実際に取得した`user.updated`ペイロード例: `data.object`に`blocked`, `email`, `name`, `given_name`, `family_name`, `picture`, `user_id`等が入っているが、**`email_verified`は含まれていない**
- **`organization.member.added`/`organization.member.deleted`はOrganizationメンバーシップ専用の別イベント**（[Real-Time Organization Events](https://auth0.com/blog/supercharge-your-b2b-apps-with-real-time-organization-events)）。実際の`organization.member.added`ペイロードを確認済み — `data.object`は`{ organization: { id }, user: { user_id } }`のみで、**プロフィール情報（name/email/picture等）は一切含まれない**
- **`user.created`のペイロード内容は未確認（推定）**: `user.updated`が`data.object`にフルプロフィールを含むことから、作成イベントである`user.created`も同様にフルプロフィールを含む可能性が高いと推定。実装時に実データで確認が必要（後述の未解決の論点）
- **Management APIでのユーザー取得**: `GET /api/v2/users/{user_id}`、スコープ`read:users`。**第4版ではこの経路は使用しない**（参考情報として記録のみ残す）
- **`database/init.sql`のusersテーブルは`org_id TEXT NOT NULL`、1ユーザー1org前提**（複数org所属のメンバーシップテーブルは存在しない）
- **`accounts`/`opportunities`/`activities`の`owner_id`・`created_by`にはDBレベルの外部キー制約は無い**（単なるTEXT列）。フロントエンド側も`userNameMap.get(id) ?? '—'`のように必ずフォールバックしており、ユーザー行が消えてもクラッシュはしない。ただし履歴上「誰が作成したか」の名前解決ができなくなるため、ハードデリートは避けたい
- **既存`services/user/src/routes/users.ts`の`PATCH /:id`は「完全上書き」方式**（`email_verified ?? false`等、bodyに無いフィールドは`NULL`/デフォルト値に落ちる）。`layout.tsx`が毎回フルプロフィールを送る前提で書かれているため、`blocked`だけを送るような部分更新をそのまま投げると他のフィールドが消えてしまう
- **client_credentialsトークンは`gty: "client-credentials"`、`sub`/`azp`にクライアントID（`...@clients`）を持つ**、Auth0公式の判定可能なクレーム（[Access Token Profiles](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles)）
- **Organization-scoped M2Mトークンが取得可能** — `/oauth/token`のclient_credentialsリクエストに`organization=org_abc123`パラメータを付けると`org_id`クレーム付きトークンが発行される（[Get Token](https://auth0.com/docs/api/authentication/client-credential-flow/get-token)、[Organizations for M2M](https://auth0.com/docs/manage-users/organizations/organizations-for-m2m-applications)）。事前にAuth0側でそのOrganizationへのM2Mアプリのアクセス許可（`organization_client_grant`）が必要
- **同じM2Mクライアント（client_id/secret）で、`organization`パラメータの有無によりOrg-scoped/Org無しトークンを出し分けられる**。クライアント自体を分ける必要は無い
- **既存`POST /`・`DELETE /:id`は本人チェックが無く、スコープチェックのみ** → M2Mトークンから無改造で呼べる。**`PATCH /:id`だけ**`req.params.id !== userId → 403`という本人限定ロジックがあり、最小限の例外分岐が必要
- **`services/user`は`express@4.19.2`** — Express 4系はasyncルートハンドラ内の例外/rejectionを自動でエラーミドルウェアに転送しない（Express 5との違い）。既存コードは元々この特性を持つ（今回の変更で新たに持ち込むものではない）

## 購読するイベント（5種類）

- `user.created` — **新規追加**。プロフィール情報を持つ新規ユーザー検知。org_idはまだ分からないため、`org_id`にプレースホルダーを入れた「未割当」行を作る
- `organization.member.added` — Organizationメンバーへの追加。プレースホルダー行があれば実際のorg_idを割り当てる。無ければ（イベント順序の入れ替わり等）nullプロフィールで直接作成
- `user.updated` — プロフィール変更、または`blocked:true`（Okta側の無効化/アサイン解除）
- `user.deleted` — Auth0アカウントの完全削除
- `organization.member.deleted` — Organizationメンバーからの削除

いずれも最終的に「行は消さず`blocked`で表現する」に収束するため、**このsyncフローから`DELETE /users/:id`を呼ぶことは無い**。

> 補足: `organization.member.deleted`で立てる`blocked`は、Auth0本来の「テナント全体でログイン不可」という意味とは厳密には異なる（他のorgには所属し続けられる可能性があるため）。ただしこのプロジェクトは1ユーザー1org前提のスキーマなので、「このCRMのorgに対してはもう有効ではない」という意味で`blocked`を流用する、という割り切り。

## アーキテクチャ

```
Auth0 (Event Streams: user.created / user.updated / user.deleted /
                       organization.member.added / organization.member.deleted)
    │ Webhook (Bearer <EVENT_STREAM_TOKEN>)
    ▼
services/auth0events (新規、public: true — auth0logsと同じ隔離パターン)
    │ user.created            → POST /users/provisional （org無しM2Mトークン）
    │ organization.member.added → PATCH /users/:id/org （org-scoped M2Mトークン）
    │                             404なら POST /users にフォールバック（nullプロフィール、org-scoped）
    │ user.updated/deleted,
    │ organization.member.deleted → GET /users/:id → PATCH /users/:id（org-scoped、既存値+差分マージ）
    │ トークンは種別ごとにキャッシュ（org無し1種 + org-scoped/org単位、services/mcp/src/oboToken.tsと同様の方式）
    ▼
services/user の既存 /users API + 新規2エンドポイント
    │ 既存: checkJwt → requireOrg → requireReadUsers/requireCreateUsers/requireUpdateUsers（無改造）
    │ 新規: POST /users/provisional（checkJwt のみ、requireOrgなし、信頼M2Mクライアントのみ許可）
    │ 新規: PATCH /users/:id/org（checkJwt → requireOrg → requireUpdateUsers、未割当→実orgの一方向のみ）
    ▼
PostgreSQL (users テーブルに blocked カラムを追加。org_idの未割当プレースホルダーは既存カラムのまま特別な値で表現)
```

### イベントごとの処理

| イベント | 行が無い場合 | 行がある場合（プレースホルダー含む） |
|---|---|---|
| `user.created` | `POST /users/provisional`（org_id=`UNASSIGNED_ORG_ID`、プロフィールはイベントの値） | 同エンドポイントを`ON CONFLICT (id) DO UPDATE`でupsert。**org_idは更新しない**（プロフィール列だけ上書き）。重複配信・順序入れ替わり両方に耐性を持たせるため |
| `organization.member.added` | `PATCH /users/:id/org`が404 → `POST /users`（org_id=イベントの値、プロフィールはnull） | `PATCH /users/:id/org`（`WHERE org_id = UNASSIGNED_ORG_ID`の時のみ成功。既に実orgが入っている場合は404のまま＝何もしない。後述の既知の制限を参照） |
| `user.updated` | 何もしない（org未確定のユーザーは追わない） | `PATCH /:id`（GETで取得した既存値 + イベントの差分をマージ。`blocked`もイベント通りに反映） |
| `user.deleted` | 何もしない | `PATCH /:id`（既存値を維持したまま`blocked=true`だけ立てる） |
| `organization.member.deleted` | 何もしない | `PATCH /:id`（既存値を維持したまま`blocked=true`だけ立てる） |

`user.updated`/`user.deleted`/`organization.member.deleted`の3つは第3版から変更無し（「GETで現在値取得 → 必要フィールドだけ差し替えてPATCH」という、`frontend`の`layout.tsx`と同じ流儀）。

### 1. Auth0側の設定（インフラ）

- 既存想定の新規M2Mアプリケーション「NexusCRM User Sync」を、**`user`サービスのAuth0 APIに対してのみ**認可（`read:users`, `create:users`, `update:users`）。**Management APIへの認可は不要になった**（第3版から削減）
- このM2Mアプリを対象Organizationに`organization_client_grant`で許可（`organization.member.added`処理時のOrg-scopedトークン用）
- 新規Event Stream（Webhook宛先）、上記5イベントを購読（`user.created`を追加）、共有シークレット設定

### 2. 新規マイクロサービス `services/auth0events`

- `POST /webhooks/auth0-events`：`Authorization`ヘッダーを`EVENT_STREAM_TOKEN`で検証（`auth0logs`と同じパターン）
- イベント処理は上表の通り。DBには一切触らない（DBアクセスは既存`user`サービス経由のみ）
- M2Mトークン取得: `client_credentials`で`organization`パラメータの有無を切り替える。org無しトークンは1つだけキャッシュ、org-scopedトークンはorg_id単位でキャッシュ（`services/mcp/src/oboToken.ts`の`lru-cache`パターンを再利用）
- Helm: `auth0logs`と同じ`role: microservices` + `public: true`ラベル構成を再利用（既存`public-sg-policy`が使え、新規SG不要）

### 3. `services/user`側の変更

#### 3-1. スキーマ

- `database/init.sql`と実DBに`blocked BOOLEAN NOT NULL DEFAULT false`を追加
- `org_id`カラム自体は変更しない。「未割当」は`org_id = '__unassigned__'`という予約値で表現する（新しいカラムやNULL許容化は不要）。この予約値は`services/user/src/constants.ts`に`UNASSIGNED_ORG_ID`としてexportし、実在のAuth0 Organization ID（`org_...`形式）と衝突しないことを明示

#### 3-2. 新規: `POST /users/provisional`（org無しトークンで呼ぶ）

- `usersRouter`（`checkJwt, requireOrg`が`.use()`で全体適用済み）とは別のルーターとして定義し、`requireOrg`を回避する
- ミドルウェア: `checkJwt` → `requireTrustedSyncClient`（新規、`gty === 'client-credentials' && sub === config.trustedSyncClientId`をチェック。マッチしなければ403） → `requireCreateUsers`
- `INSERT ... VALUES (id, UNASSIGNED_ORG_ID, name, ...) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, given_name = ..., ...`（`org_id`と`id`はconflict時に更新しない）

#### 3-3. 新規: `PATCH /users/:id/org`（org-scopedトークンで呼ぶ）

- `usersRouter`に追加（既存の`checkJwt, requireOrg`をそのまま利用） + `requireUpdateUsers`
- `UPDATE users SET org_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`（`$1`=呼び出しトークンの`orgId`、`$3`=`UNASSIGNED_ORG_ID`）。0件なら404
- リクエストボディからorg_idを受け取らない（トークンのクレームのみを信頼する、既存の他エンドポイントと同じ方針）

#### 3-4. 既存`PATCH /:id`の本人チェックに例外を1つ追加（第3版から変更無し）

```ts
const isTrustedSyncClient = req.auth?.payload?.gty === 'client-credentials'
  && req.auth?.payload?.sub === config.trustedSyncClientId;

if (req.params.id !== userId && !isTrustedSyncClient) {
  res.status(403).json({ error: 'Cannot update another user' });
  return;
}
```

`isTrustedSyncClient`判定は`middleware/auth.ts`の共通関数に切り出し、3-2の`requireTrustedSyncClient`ミドルウェアと3-4のこのインライン分岐の両方から使う。

- `GET /:id`・既存`POST /`・`DELETE /:id`は無改造でそのまま使える

## 未解決の論点（実装前に確認・決定したい）

1. **`user.created`の実ペイロードは未確認**。実装着手後、実際にAuth0テナントで`user.created`イベントを発火させ、`data.object`にフルプロフィールが入っているか確認する必要がある。入っていなければこの設計全体（Management API不使用という前提）が崩れるため、最初に検証すべき最重要事項
2. **既に実org割当済みのユーザーが別のOrganizationに追加された場合の扱い（例: orgAから削除→blocked済み→orgBに再招待）**。`PATCH /:id/org`のガードは「未割当(`UNASSIGNED_ORG_ID`) → 実org」の一方向遷移のみを許可する設計のため、この場合404となり自動更新されない。フォールバックの`POST /users`もid重複でエラーになる（Express 4systemでは未捕捉rejectionとなるリスクがあり、既存コードの特性ではあるが要注意）。1ユーザー1org前提のスキーマ自体がそもそも「所属org の切替」を安全に表現できないため、**この経路は意図的にサポート外とし、発生した場合はログに残すのみで運用者が手動対応する想定**（第3版の「複数org所属不可」という既存の制約を素直に継承する形）
3. **Event Streamsの配信保証**（at-least-once/順序保証）が公式ドキュメントに明記されていない【未確認】。`user.created`のupsert化・`PATCH /:id/org`のガード付きWHERE句により、重複配信・順序逆転への耐性は基本的に持たせてある
4. **既存のログイン時同期（`layout.tsx`）との重複実行**は同じ方向に収束するだけなので実害無しと想定（第3版から変更無し）
5. **`blocked=true`はこのアプリでは表示上の情報にとどまる**（第3版から変更無し。UI側で「無効化されたユーザー」のバッジ表示等に使う想定）

## Helmへの追加

- `auth0events`サービスの新規エントリ（`auth0logs`のブロックを複製）
- 新規シークレット: `EVENT_STREAM_TOKEN`（Auth0↔auth0events）、`AUTH0_SYNC_CLIENT_ID`/`AUTH0_SYNC_CLIENT_SECRET`（auth0events↔user向けAuth0 API）
- `user`サービスの`env`に`TRUSTED_SYNC_CLIENT_ID`を追加

## この計画で満たされる要件の確認

- ✅ Management APIへの依存を撤廃（第3版からの主目的）
- ✅ 既存の`user`サービスを公開APIにしない（`auth0events`が公開の受け口。`user`は今まで通りIngress無し）
- ✅ 新しい公開APIサービス（`auth0events`）を作るが、DBアクセスは既存の`user`サービス経由のみ
- ✅ 既存`user`サービスの既存4ルート（`GET /`, `GET /:id`, `POST /`, `DELETE /:id`）は無改造。`PATCH /:id`は本人チェックへの例外1つのみ追加。新規2エンドポイント（`POST /provisional`, `PATCH /:id/org`）はいずれも既存の`checkJwt`/`requiredScopes`の仕組みをそのまま利用し、新しい認可ロジックを増やさない
- ✅ トークンのスコープチェックは一切変更しない。M2Mトークンに正規のスコープを付与して満たす
- ⚠️ org間の付け替え（論点2）は意図的にスコープ外
