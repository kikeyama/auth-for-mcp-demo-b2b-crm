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
| postgres | 5432 | PostgreSQL 16 |

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

各マイクロサービス (`services/*/.env`) に以下を設定：

| 変数 | 値 |
|---|---|
| `AUTH0_ISSUER_BASE_URL` | `https://<your-domain>.auth0.com` |
| `AUTH0_AUDIENCE` | `https://api.nexuscrm.com` |

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
