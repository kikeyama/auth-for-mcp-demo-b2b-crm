# データベーススキーマ管理

このプロジェクトのスキーマファイルは `database/init.sql`。PostgreSQL on AWS RDS を本番環境として想定。

---

## 初期スキーマ（init.sql の記述ルール）

本番環境では `init.sql` を Kubernetes Job として実行する。この Job はスキーマに変更がない場合でも再 apply されることがある（運用上の再デプロイ、Job の再実行など）。そのため、`init.sql` は何度実行されても副作用なく完了できる冪等な DDL で書く。

| DDL | 書き方 |
|---|---|
| `CREATE TABLE` | `CREATE TABLE IF NOT EXISTS` |
| `CREATE INDEX` | `CREATE INDEX IF NOT EXISTS` |
| `CREATE FUNCTION` | `CREATE OR REPLACE FUNCTION` |
| `CREATE TRIGGER` | `CREATE OR REPLACE TRIGGER`（PG 14+、RDS でサポート済み） |

---

## スキーマ変更（本番運用ルール）

**既存の `init.sql` は変更しない。** カラム追加・型変更・インデックス追加などは `database/migrations/` 以下に追記専用ファイルとして追加する。

```
database/
  init.sql                    # 初期スキーマのみ。変更禁止
  migrations/
    V002__add_column_foo.sql  # V{番号}__{説明}.sql の命名規則
    V003__add_index_bar.sql
```

### マイグレーションファイルの書き方

- ファイル名: `V{3桁連番}__{snake_case_description}.sql`（例: `V002__add_phone_to_users.sql`）
- 連番は `database/migrations/` 内の既存ファイルを確認して次の番号を使う
- 内容は冪等に書く（再実行しても安全）

```sql
-- カラム追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- カラム削除（後方互換性に注意）
ALTER TABLE accounts DROP COLUMN IF EXISTS legacy_field;

-- NOT NULL 制約追加（既存レコードへの影響を確認してから実行）
ALTER TABLE contacts ALTER COLUMN email SET NOT NULL;
```

### NG パターン（やってはいけないこと）

```sql
-- NG: init.sql の既存 CREATE TABLE に直接カラムを追加する
CREATE TABLE IF NOT EXISTS users (
    ...
    phone TEXT,   -- ← これを追加するのは NG
    ...
);

-- OK: migrations/ に ALTER TABLE を追加する
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
```

---

## ローカル開発での適用

```bash
# 初期化（init.sql を適用）
docker compose down -v && docker compose up postgres -d

# マイグレーションのみ適用（データを残したまま）
docker exec nexuscrm-db psql -U nexuscrm_user -d nexuscrm_db \
  -f /docker-entrypoint-initdb.d/migrations/V002__add_column_foo.sql
```

## 本番（RDS）での適用

Kubernetes Job を使って `psql` で実行する（Job マニフェストは別リポジトリで管理）。

```bash
# マイグレーションファイルを Job に渡して実行
kubectl apply -f db-migrate-job.yaml
kubectl logs job/db-migrate -n nexuscrm
```
