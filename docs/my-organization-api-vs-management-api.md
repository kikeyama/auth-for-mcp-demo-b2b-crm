# My Organization API では満たせず、Management API に頼ったユースケース

`frontend/src/app/(dashboard)/settings/*`（Identity Provider / ドメイン / メンバー管理）の実装中に、
My Organization API（Early Access、`https://{AUTH0_DOMAIN}/my-org/`）だけでは機能を完結できず、
Auth0 Management API（`https://{AUTH0_DOMAIN}/api/v2/`）を併用せざるを得なかった4つのケースを記録する。
My Organization APIは「Organization管理者への委任（delegated admin）」専用に設計された狭いAPIのため、
Management APIが前提にしている「テナント管理者が全権を持つ」操作とは守備範囲が異なり、
機能によってはMy Org API側に対応するエンドポイントが存在しない。

共通の実装パターン: いずれも`frontend/src/lib/managementApiToken.ts`（`AUTH0_MGMT_CLIENT_ID`/`AUTH0_MGMT_CLIENT_SECRET`の
専用M2M Applicationで取得する`client_credentials`トークン、LRUキャッシュで有効期限いっぱい再利用）を、
`frontend/src/app/api/admin/*/route.ts`配下のBFFルート経由でサーバー側のみで使う。My Org APIのように
`@auth0/nextjs-auth0`のビルトインプロキシ（`/my-org/*`）を経由する仕組みはなく、Management APIトークンを
ブラウザに渡すことはない。

---

## 1. Organizationドメインの検証ステータスを直接書き込む

**使った機能**: ドメイン強制検証（デモ用、`/settings/domains`の「検証済みにする（デモ用）」ボタン）
**該当コード**: `frontend/src/app/api/admin/domains/[id]/force-verify/route.ts`
**使ったAPI**: `PATCH /api/v2/organizations/{org_id}/discovery-domains/{discovery_domain_id}`（https://auth0.com/docs/api/management/v2/organizations/patch-discovery-domains-by-discovery-domain-id）

My Organization APIの`OrgDomain`は`status`フィールドが**レスポンス専用（response-only）**で、作成APIにも更新APIにも
書き込み手段がない。実際のDNS TXTレコード検証（`POST /domains/{id}/verify`）を経ずに`verified`へ変更する方法は
My Org API側には一切存在しない。

Management APIの`discovery-domains`リソースは、`id`/`discovery_domain_id`が一致することから確認した通り、
`OrgDomain`と同一の実体を別API経由で公開しているもので、こちらは`PATCH`で`status`を直接書き込める。
本番運用では使わない（実際のドメイン所有権証明をバイパスするため）デモ専用の抜け道だが、My Org API単独では
この代替手段自体が存在しないため、Management APIが唯一の経路になる。

---

## 2. テナント内の既存ユーザーを、招待なしでOrganizationメンバーとして直接追加する

**使った機能**: 承認待ちユーザーの承認（`/settings/members`の「承認」ボタン、ドメインマッチしたテナント内ユーザーをメンバー化）
**該当コード**: `frontend/src/app/api/admin/members/approve/route.ts`
**使ったAPI**: `POST /api/v2/organizations/{org_id}/members`（https://auth0.com/docs/api/management/v2/organizations/post-members）

My Organization APIの`memberInvitations`（`POST /member-invitations`）は、メール送信を伴う招待フローしか提供しない。
「すでにテナントに存在するユーザーを、招待メールのやり取りなしで即座にOrganizationメンバーにする」というMy Org API相当の
エンドポイントは存在しない。

Management APIの`POST /organizations/{org_id}/members`はドキュメント上も明確に「the user must already exist in your
tenant」と書かれており、まさにこの用途向けに作られている。これはMy Org APIが想定する「Organization管理者による自己サービス」
のシナリオとは異なり、「テナント全体のユーザーディレクトリから既存ユーザーを引き当てる」操作そのものがMy Org APIのスコープ外
（テナント管理者権限が必要な領域）であるため。

---

## 3. 検証済みドメインに一致する、テナント全体のユーザーを検索する

**使った機能**: 承認待ちユーザーの候補検索（上記2の前段、`/settings/members`が自動で候補一覧を出す仕組み）
**該当コード**: `frontend/src/app/api/admin/members/candidates/route.ts`
**使ったAPI**: `GET /api/v2/users?q=email.domain:"<verified-domain>"`（Lucene検索、https://auth0.com/docs/manage-users/user-search/user-search-query-syntax の`email.domain:"example.com"`）

My Organization APIにはOrganizationにスコープされたユーザー検索機能自体がない（`GET /members`はすでにメンバーに
なっているユーザーの一覧であり、「まだメンバーではないがドメインが一致するテナント内ユーザー」を探す手段ではない）。

Management APIの`GET /users`はテナント全体を対象にした検索で、Organizationによる絞り込みパラメータは存在しない
（確認済み。Organization関連のフィルタは用意されていない）。そのため、検証済みドメインごとに個別クエリを投げ、
結果からすでにMy Org API側のメンバー一覧に含まれるユーザーをアプリ側（クライアント側）で除外する、という
二段構えの実装になっている。「Organizationスコープのユーザー検索」自体がどちらのAPIにも単体では存在しないための
回避策。

---

## 4. Organizationに有効化されているDatabase Connection（ユーザーストア）の一覧を取得する

**使った機能**: メンバー招待フォームの「招待経路」選択（`/settings/members`、`identity_provider_id`または
`user_store_id`のいずれかを指定する必要があるため）
**該当コード**: `frontend/src/app/api/admin/members/connections/route.ts`
**使ったAPI**: `GET /api/v2/organizations/{org_id}/enabled_connections`（https://auth0.com/docs/api/management/v2/organizations/get-enabled-connections、必要スコープ: `read:organization_connections`）

`POST /member-invitations`は`identity_provider_id`か`user_store_id`のいずれかを必須とするが、My Organization APIの
`GET /identity-providers`が返す対象は`IdpStrategyEnum`（`adfs`・`google-apps`・`oidc`・`okta`・`pingfederate`・
`samlp`・`waad`の7種類）に限定されており、**Auth0ネイティブのDatabase Connection（`strategy: "auth0"`、
`user_store_id`に相当するリソース）はそもそも対象外**。My Org APIは「外部IdPとの連携」専用に設計されたリソースの
ため、Auth0自身が内部で持つユーザーストアはそのスコープに含まれていない。

Management APIの`enabled_connections`はOrganizationに有効化された全Connection（`connection.strategy`に`auth0`も
含む）を返すため、`strategy === 'auth0'`でフィルタすることで初めてユーザーストアの接続IDが取得できる。
`identity_provider_id`相当の情報はMy Org API（1）とManagement API（4）の両方から別々に取得し、クライアント側で
1つの選択肢（プルダウン）にまとめている。

---

## 傾向のまとめ

| ユースケース | My Org APIで足りない理由 |
|---|---|
| 1. ドメイン検証ステータスの直接書き込み | 該当フィールドがレスポンス専用で書き込みAPIが存在しない |
| 2. 既存ユーザーの直接追加 | 招待フローしか提供されておらず、テナント全体のユーザーディレクトリへのアクセス自体がスコープ外 |
| 3. ドメイン一致ユーザーの検索 | Organizationスコープのユーザー検索機能自体が存在しない（Management API側にもOrganizationフィルタはない） |
| 4. ユーザーストア一覧取得 | My Org APIの対象リソースが外部IdPのみで、Auth0ネイティブのDatabase Connectionは扱わない |

共通しているのは、**My Organization APIが「Organization管理者が自分のOrganizationの中でできる自己サービス操作」に
意図的に範囲を絞っているため、テナント全体を横断する情報（既存ユーザー検索、テナントの全Connection一覧）や、
検証プロセスをバイパスするような操作は最初から対象外になっている**という点。この境界線を超える操作は、
テナント管理者権限を前提とするManagement APIでしか実現できない。
