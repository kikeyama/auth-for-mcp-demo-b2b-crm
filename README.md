# NexusCRM

Auth0 Organizations を使った B2B SaaS CRM のデモアプリケーション。

## アーキテクチャ

| コンポーネント | ポート | 説明 |
|---|---|---|
| frontend | 3000 | Next.js + Auth0 BFF |
| account | 3001 | 顧客企業マイクロサービス |
| opportunity | 3002 | 案件マイクロサービス |
| contact | 3003 | 連絡先マイクロサービス |
| activity | 3004 | 活動履歴マイクロサービス |
| user | 3005 | ユーザー同期マイクロサービス |
| mcp | 3006 | AI エージェント向け MCP サーバー（詳細: [services/mcp/README.md](services/mcp/README.md)） |
| auth0logs | 3007 | Auth0 Log Stream（Custom Webhook）受信、CIMD可視化デモ用 |
| auth0events | 3008 | Auth0 Event Streams（Webhook）受信、`user`テーブルの非同期同期用 |
| postgres | 5432 | PostgreSQL 16 |

### OpenTelemetry Tracing

`account`/`opportunity`/`contact`/`activity`/`user`/`mcp`/`auth0logs`/`auth0events`/`frontend`の全9サービスにOpenTelemetryによるトレーシング（Node.js/Express/PostgreSQLの自動計装）を導入済み。各サービスの`OTEL_EXPORTER_OTLP_ENDPOINT`（`.env.example`/`.env.local.example`参照）が未設定の場合はトレーシングが自動的に無効化されるため、**ローカル開発では特に設定不要**。k8s環境でのCollectorエンドポイント設定・設計判断の背景は[helm/README.md](helm/README.md)の「OpenTelemetry Tracing」セクションおよび`CLAUDE.md`を参照。

---

## Auth0 の設定

### 1. API の作成

Auth0 ダッシュボード → **Applications > APIs > Create API**

| 項目 | 値 |
|---|---|
| Name | NexusCRM API |
| Identifier (Audience) | `https://api.nexuscrm.com` |
| Signing Algorithm | RS256 |

作成後、**Permissions** タブで以下のスコープを追加：

| Scope | 説明 |
|---|---|
| `read:accounts` | 顧客企業の参照 |
| `create:accounts` | 顧客企業の作成 |
| `update:accounts` | 顧客企業の更新 |
| `delete:accounts` | 顧客企業の削除 |
| `read:opportunities` | 案件の参照 |
| `create:opportunities` | 案件の作成 |
| `update:opportunities` | 案件の更新 |
| `delete:opportunities` | 案件の削除 |
| `read:contacts` | 連絡先の参照 |
| `create:contacts` | 連絡先の作成 |
| `update:contacts` | 連絡先の更新 |
| `delete:contacts` | 連絡先の削除 |
| `read:activities` | 活動履歴の参照 |
| `create:activities` | 活動履歴の作成 |
| `update:activities` | 活動履歴の更新 |
| `delete:activities` | 活動履歴の削除 |
| `read:users` | ユーザーの参照 |
| `create:users` | ユーザーの作成 |
| `update:users` | ユーザーの更新 |
| `delete:users` | ユーザーの削除 |

### 2. アプリケーションの作成

Auth0 ダッシュボード → **Applications > Applications > Create Application**

| 項目 | 値 |
|---|---|
| Name | NexusCRM |
| Application Type | Regular Web Application |

作成後、**Settings** タブで以下を設定：

| 項目 | 値 |
|---|---|
| Allowed Callback URLs | `http://localhost:3000/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000` |
| Allowed Web Origins | `http://localhost:3000` |

Settings タブから **Domain**, **Client ID**, **Client Secret** を控えておきます。

### 3. Organizations の有効化

Auth0 ダッシュボード → **Organizations > Create Organization** でテスト用の組織を作成します。

作成した組織の **Members** タブでテストユーザーを追加し、**Roles** タブで必要なロールを割り当てます。

アプリケーションと Organizations を連携させるには、作成したアプリケーションの **Organizations** タブ → **Assign your Organization** で組織を追加します。

### 4. 環境変数への反映

`frontend/.env.local` に以下を設定：

| 変数 | 値 |
|---|---|
| `AUTH0_DOMAIN` | `<your-domain>.auth0.com`（`https://` は不要） |
| `APP_BASE_URL` | `http://localhost:3000` |
| `AUTH0_CLIENT_ID` | Settings タブの Client ID |
| `AUTH0_CLIENT_SECRET` | Settings タブの Client Secret |
| `AUTH0_SECRET` | 32文字以上のランダム文字列（`openssl rand -hex 32` で生成可） |
| `AUTH0_AUDIENCE` | `https://api.nexuscrm.com` |
| `AUTH0_SCOPE` | `openid profile email offline_access read:accounts ...`（`.env.local.example` を参照） |
| `ACCOUNT_SERVICE_URL` | `http://localhost:3001` |
| `OPPORTUNITY_SERVICE_URL` | `http://localhost:3002` |
| `CONTACT_SERVICE_URL` | `http://localhost:3003` |
| `ACTIVITY_SERVICE_URL` | `http://localhost:3004` |
| `USER_SERVICE_URL` | `http://localhost:3005` |

マイクロサービス (`services/account`, `opportunity`, `contact`, `activity`, `user`) の各 `.env` に以下を設定：

| 変数 | 値 |
|---|---|
| `PORT` | サービスごとのポート番号（3001〜3005） |
| `DATABASE_URL` | `postgresql://nexuscrm_user:nexuscrm_password@localhost:5432/nexuscrm_db` |
| `AUTH0_ISSUER_BASE_URL` | `https://<your-domain>.auth0.com` |
| `AUTH0_AUDIENCE` | `https://api.nexuscrm.com` |
| `ALLOWED_ORIGINS` | `http://localhost:3000` |

`ALLOWED_ORIGINS` は各マイクロサービスの CORS ミドルウェアで使用し、許可するオリジン（カンマ区切り）を指定します。MCP サービスへのリクエスト元はブラウザではなく AI エージェントのため、MCP サービスには CORS 設定がなく `ALLOWED_ORIGINS` は不要です。

MCP サービス (`services/mcp/.env`) の設定については [services/mcp/README.md](services/mcp/README.md) を参照してください。

### 5. My Organization API（Early Access）によるIdentity Provider / ドメイン / SCIM Provisioning / メンバー管理

ダッシュボードの `/settings/identity-providers`・`/settings/domains`・`/settings/members` から、Okta WorkforceのEnterprise Connectionとそのドメイン・SCIM Provisioning・Organizationメンバーを管理する機能です（対象strategyは`okta`のみ）。背景・制約の詳細は[CLAUDE.mdの該当セクション](CLAUDE.md)を参照してください。

#### 前提: テナントでEarly Accessを有効化

Auth0 ダッシュボード → **Applications > APIs > My Organization API** を開き、有効化します（テナントによっては非表示の場合があります）。

#### Applicationへの設定

同じ画面の **Application Access** タブで、frontendのApplicationに対して：

1. アクセスを許可（Client Grantを作成）し、以下のスコープを有効化：

| Scope |
|---|
| `read:my_org:identity_providers` |
| `create:my_org:identity_providers` |
| `update:my_org:identity_providers` |
| `delete:my_org:identity_providers` |
| `read:my_org:domains` |
| `create:my_org:domains` |
| `update:my_org:domains` |
| `delete:my_org:domains` |
| `create:my_org:identity_providers_domains` |
| `delete:my_org:identity_providers_domains` |
| `read:my_org:identity_providers_provisioning` |
| `create:my_org:identity_providers_provisioning` |
| `update:my_org:identity_providers_provisioning` |
| `delete:my_org:identity_providers_provisioning` |
| `read:my_org:identity_providers_scim_tokens` |
| `create:my_org:identity_providers_scim_tokens` |
| `delete:my_org:identity_providers_scim_tokens` |
| `read:my_org:members` |
| `delete:my_org:memberships` |
| `read:my_org:member_invitations` |
| `create:my_org:member_invitations` |
| `delete:my_org:member_invitations` |

2. `my_organization_configuration` を設定（Management API `PATCH /api/v2/clients/{client_id}` 経由。Dashboard上に設定UIがない場合はこちらを使用）：

```json
{
  "my_organization_configuration": {
    "connection_profile_id": "<Connection ProfileのID>",
    "user_attribute_profile_id": "<User Attribute ProfileのID>",
    "allowed_strategies": ["okta"],
    "connection_deletion_behavior": "allow_if_empty"
  }
}
```

Connection Profile・User Attribute Profileが未作成の場合は先に作成してください（[Connection Profile](https://auth0.com/docs/authenticate/enterprise-connections/connection-profile)）。Connection Profileの`organization.show_as_button`/`organization.assign_membership_on_login`が`none`だと、個々のIdentity Provider側で同名のオプションを有効化できません。

#### ユーザーへのパーミッション割り当て（RBAC）

Client Grantだけでは不十分で、操作するユーザー自身にも上記と同じ`my_org:*`パーミッションがRBAC経由で割り当てられている必要があります（実効スコープはApplicationとユーザーの両方の交差で決まる）。

Auth0 ダッシュボード → **User Management > Roles** でパーミッションを含むRoleを作成し、対象ユーザーに割り当ててください。割り当て後は再ログインが必要です。

#### 環境変数への反映

`frontend/.env.local` に追加（`.env.local.example` 参照）：

| 変数 | 値 |
|---|---|
| `AUTH0_MY_ORG_SCOPE` | 上記スコープをスペース区切りで列挙したもの |

#### ドメイン検証バイパス（デモ用、省略可）

`/settings/domains` の「検証済みにする（デモ用）」ボタンは、実際のDNS TXTレコード検証を行わず、Management API経由でドメインを強制的に`verified`扱いにします。この機能を使う場合のみ、以下が必要です。

1. 専用のMachine to Machine Applicationを作成し、Management API（`https://<your-domain>.auth0.com/api/v2/`）に対して `update:organization_discovery_domains` スコープを認可する（メンバー管理機能も使う場合は、下記「メンバー承認」の手順でさらに`read:users`・`create:organization_members`も同じApplicationに追加する）
2. `frontend/.env.local` に追加：

| 変数 | 値 |
|---|---|
| `AUTH0_MGMT_CLIENT_ID` | 上記M2MアプリのClient ID |
| `AUTH0_MGMT_CLIENT_SECRET` | 上記M2MアプリのClient Secret |

この機能を使わない場合は、`/settings/domains`で「検証を開始」から実際のDNS TXTレコードを設定して検証してください。

#### SCIM Provisioning

`/settings/identity-providers` の各Identity Provider行で「SCIM」をクリックすると、SCIM Provisioningの有効化・SCIM Endpoint URLの確認・SCIMトークンの発行/削除ができます。SCIM Endpoint URL（`https://<your-domain>.auth0.com/scim/v2/connections/<connection_id>`）は、作成したOkta WorkforceアプリケーションのSCIM設定画面に貼り付けて使用してください。SCIMトークンの生の値は発行直後のみ表示されるため、必ずその場でコピーしてください。属性マッピング（User ID Attribute含む）はAPI側で自由編集ができず、User Attribute Profile側の定義から再取得するのみです（詳細はCLAUDE.md参照）。

#### メンバー管理

`/settings/members` では、Organizationの現在のメンバー一覧（チェックボックスで複数選択して一括削除）・メールアドレスでの招待・検証済みドメインのメールアドレスを持つテナント内の未参加ユーザー（「承認待ちのユーザー」としてチェックボックス一覧表示、一括承認）を管理できます。

「承認」機能（検証済みドメインのユーザーをテナント内から検索して直接メンバー追加）はMy Organization APIではなく**Management API専用**（既存ユーザーの直接追加はMy Org APIに存在しないため）です。上記「ドメイン検証バイパス」で作成したM2M Applicationに、以下のスコープを追加してください。

| Scope |
|---|
| `read:users` |
| `create:organization_members` |

### 6. Auth0 Event Streams によるユーザー同期（`auth0events`）

Okta（SCIM）などの外部IdPからAuth0にプロビジョニングされたユーザー・Organizationメンバーシップの変更を、Auth0 Management APIを使わずリアルタイムに`user`サービスへ反映する仕組みです。背景・設計の詳細は[CLAUDE.mdの該当セクション](CLAUDE.md)を参照してください。

#### M2Mアプリケーションの作成

Auth0 ダッシュボード → **Applications > Applications > Create Application** → **Machine to Machine Applications**

| 項目 | 値 |
|---|---|
| Name | NexusCRM User Sync |

作成後、**APIs** タブで **NexusCRM API**（`https://api.nexuscrm.com`）を選択し、以下のスコープを認可します。

| Scope |
|---|
| `read:users` |
| `create:users` |
| `update:users` |

このM2Mアプリを、ユーザーが所属する各Organizationの **Machine to Machine Applications** タブでも認可してください（`organization.member.added`/`organization.member.deleted`処理時のOrg-scopedトークン取得に必要）。

#### Event Stream（Webhook）の作成

Auth0 ダッシュボード → **Actions > Event Streams > Create Event Stream** → **Webhook**

| 項目 | 値 |
|---|---|
| Endpoint URL | `http://localhost:3008/webhooks/auth0-events`（本番は`auth0events`サービスの公開URL） |
| Authorization | 任意の共有シークレット（Auth0側がこの値に自動で`Bearer `を前置して送信する。`EVENT_STREAM_TOKEN`には`Bearer `を含めない生の値を設定する） |
| Subscribe to events | `user.created`, `user.updated`, `user.deleted`, `organization.member.added`, `organization.member.deleted` |

#### 環境変数への反映

`services/user/.env` に追加：

| 変数 | 値 |
|---|---|
| `TRUSTED_SYNC_CLIENT_ID` | 上記M2MアプリのClient ID + `@clients`（例: `abc123@clients`） |

`services/auth0events/.env`（`services/auth0events/.env.example`をコピー）に設定：

| 変数 | 値 |
|---|---|
| `PORT` | `3008` |
| `EVENT_STREAM_TOKEN` | Event Streamの Authorization に設定した共有シークレットと同じ値（`Bearer `は含めない） |
| `AUTH0_DOMAIN` | `<your-domain>.auth0.com`（`https://` は不要） |
| `AUTH0_AUDIENCE` | `https://api.nexuscrm.com`（`user`サービスの`AUTH0_AUDIENCE`と同じ値） |
| `AUTH0_SYNC_CLIENT_ID` | 上記M2MアプリのClient ID |
| `AUTH0_SYNC_CLIENT_SECRET` | 上記M2MアプリのClient Secret |
| `USER_SERVICE_URL` | `http://localhost:3005` |

---

## ローカル開発（npm run dev）

### 1. 前提条件

- Node.js 20+
- PostgreSQL（ローカルまたは Docker）
- Auth0 テナント（Organizations 有効）

### 2. データベースの起動・初期化

#### Docker で PostgreSQL のみ起動する場合：

```bash
docker run -d \
    --name nexuscrm-db \
    -e POSTGRES_USER=nexuscrm_user \
    -e POSTGRES_PASSWORD=nexuscrm_password \
    -e POSTGRES_DB=nexuscrm_db \
    -p 5432:5432 \
    -v nexuscrm-pgdata:/var/lib/postgresql/data \
    postgres:16-alpine
```

スキーマを初期化：

```bash
# docker exec 経由
docker exec -i nexuscrm-db psql -U nexuscrm_user -d nexuscrm_db < database/init.sql

# psql 直接接続
psql -h localhost -p 5432 -U nexuscrm_user -d nexuscrm_db -f database/init.sql
```

初期化が完了しているか確認：

```bash
# docker exec 経由
docker exec -it nexuscrm-db psql -U nexuscrm_user -d nexuscrm_db -c "\dt"

# psql 直接接続
psql -h localhost -p 5432 -U nexuscrm_user -d nexuscrm_db -c "\dt"
```

#### ローカルの PostgreSQL を使う場合：

```bash
psql -U <your-user> -c "CREATE DATABASE nexuscrm_db;"
PGPASSWORD=nexuscrm_password psql -h localhost -U nexuscrm_user -d nexuscrm_db -f database/init.sql
```

### 3. 環境変数の設定

各ディレクトリの `.env.example` をコピーして編集します。

```bash
cp frontend/.env.local.example frontend/.env.local
cp services/account/.env.example services/account/.env
cp services/opportunity/.env.example services/opportunity/.env
cp services/contact/.env.example services/contact/.env
cp services/activity/.env.example services/activity/.env
cp services/user/.env.example services/user/.env
cp services/mcp/.env.example services/mcp/.env
cp services/auth0logs/.env.example services/auth0logs/.env
cp services/auth0events/.env.example services/auth0events/.env
```

各 `.env` の `YOUR_AUTH0_DOMAIN` などを実際の Auth0 テナント情報に書き換えてください。

### 4. 依存パッケージのインストール

```bash
npm install
npm install --prefix frontend
npm install --prefix services/account
npm install --prefix services/opportunity
npm install --prefix services/contact
npm install --prefix services/activity
npm install --prefix services/user
npm install --prefix services/mcp
npm install --prefix services/auth0logs
npm install --prefix services/auth0events
```

### 5. 起動

```bash
npm run dev
```

全サービスが同時に起動します。

---

## Docker Compose で起動

### 1. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して Auth0 の情報を入力します（Docker Compose の変数展開に使用）。

### 2. 起動

```bash
docker compose up
```

データベースの初期化（`database/init.sql`）は初回起動時に自動で実行されます。

### データベースのリセット

```bash
docker compose down -v   # ボリュームごと削除
docker compose up        # init.sql が再実行される
```
