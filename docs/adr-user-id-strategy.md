# ADR: ユーザー ID 戦略 — Auth0 `sub` vs アプリ固有 UUID

**日付**: 2026-07-03  
**ステータス**: 決定済み

---

## 背景

`users` テーブルの主キーおよび `accounts.owner_id`・`opportunities.owner_id` の外部キーとして、Auth0 の `sub` クレーム（例: `auth0|xxxxx`）をそのまま使う方式と、アプリケーション固有の UUID を別途発行する方式のどちらを採用するかを検討した。

---

## 検討した選択肢

### 方式A: Auth0 `sub` をそのまま主キーに使う（採用）

**長所**
- 実装シンプル。追加ルックアップ・マッピングテーブル不要
- Auth0 公式ドキュメントが `user_id` をシステム間のキーとして使う想定で書かれており、暗黙に支持
- B2B 単一テナント・単一 Connection 構成では `sub` はテナント内で不変かつ一意

**短所**
- ソーシャルログイン複数対応やアカウントリンク時に `sub` が変わり、外部キーが全て壊れる
- `auth0|xxxxx` という文字列型 PK がインデックスや結合のパフォーマンスに影響（UUID より長い）
- IdP を将来変更した場合、全外部キーの移行が必要

### 方式B: アプリ固有 UUID を発行し `sub` を別カラムに持つ

**長所**
- プロバイダー非依存。IdP 移行・アカウントリンクに耐える
- 内部 ID が外部 URL に露出しない

**短所**
- 初回ログイン時にトークンにまだ内部 ID クレームがない gap 問題が発生する
- 対応コストが大きい:
  - `users` テーブル PK を UUID に変更、`auth0_sub` カラムを追加
  - `accounts.owner_id`・`opportunities.owner_id` の全レコード移行
  - `layout.tsx` の `GET/PATCH /users/:sub` を `by-sub` エンドポイントまたはトークンクレーム経由に変更
  - `get_current_user` MCP ツールも同様に変更
  - Auth0 Action で `app_metadata.user_id` → カスタムクレームに付与する実装が必要
  - `authenticate()` での初回ログイン gap（Action がカスタムクレームを付与する前のトークン）の扱いを別途決める必要がある

---

## 決定

**方式A（`sub` 主キー）を採用・維持する。**

### 理由

- このプロジェクトは Auth0 Organizations を使った B2B 構成で、単一 IdP（Auth0）のみを使用する。`sub` が変わるシナリオが現時点では存在しない
- 方式Bへの移行コストに対して得られる恩恵が現状では小さい
- Auth0 コミュニティおよび公式ドキュメントの傾向として、`sub` 主キー方式が一般的な選択

### 再検討すべきタイミング

以下のいずれかが発生した場合は方式Bへの移行を検討する:

- Google・GitHub など複数 Connection（ソーシャルログイン）の追加が決まった場合
- Auth0 以外の IdP への移行が発生した場合
- アカウントリンク機能（1ユーザーが複数ログイン手段を持つ）の実装が必要になった場合

---

## 参考

- Auth0 Docs — Identify Users: https://auth0.com/docs/manage-users/user-accounts/identify-users
- Auth0 Docs — User Profile Structure: https://auth0.com/docs/manage-users/user-accounts/user-profiles/user-profile-structure
