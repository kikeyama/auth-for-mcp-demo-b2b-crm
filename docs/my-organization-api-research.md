# My Organization API 導入検討メモ

NexusCRMに「OrganizationごとにEnterprise Connectionをユーザー側で設定・管理するメニュー」を追加するにあたり、Auth0の**My Organization API**（Early Access）を使う方針を検討した際の調査記録。実装はまだ着手していない（本ドキュメント作成時点）。

---

## 1. やりたいこと

- Organization管理者（SaaS側の顧客企業の管理者）が、NexusCRMのUI上から自分のOrganizationに紐づくEnterprise Connection（SAML/OIDC等のIdP連携）を作成・編集できるようにしたい。
- バックエンドはAuth0 Management APIではなく**My Organization API**を使う。Management APIはテナント管理者権限が必要な汎用APIであり、委任（delegated admin）を想定した設計ではないため、Organization管理者に直接触らせるには不適切。My Organization APIはこの委任シナリオ専用に設計されている。

## 2. アーキテクチャ上の決定事項

### 2.1 新規マイクロサービスは作らない

My Organization API呼び出し専用のマイクロサービスを新設する案も検討したが、見送った。

- My Organization APIは**ユーザー束縛（user-bound）トークンでのみ呼び出せる**（後述2.3）。つまりOrganization管理者本人がブラウザ経由で操作する体験と直結しており、M2Mトークンでバックエンドが代理実行する設計には向かない。
- 既存のBFFパターン（`frontend/src/app/api/*/route.ts` → `serviceProxy.ts`）と同様に、**Next.jsの`@auth0/nextjs-auth0`経由でMulti-Resource Refresh Token (MRRT)を使い、フロントエンドのBFFから直接My Organization APIを呼ぶ**方針とした。

### 2.2 Next.jsはfirst-party app（ユーザー確認済み）

MRRTはAuth0のドキュメント上「first-party クライアントのみ」が前提の機能。NexusCRMのフロントエンド（Auth0 Application種別: Regular Web Application）は自社が所有・運用するfirst-party appであり、この前提を満たす。

### 2.3 トークン取得方法: MRRT

- My Organization APIは**user-boundトークン限定**。M2M（client_credentials）は使えない。
  - 出典: https://auth0.com/docs/manage-users/my-organization-api
  - 「The My Organization API can only be called with a user-bound access token」
  - 「Tokens must include the audience `https://YOUR_DOMAIN/my-org/`」
  - 「Tokens from other APIs (like `/me` or `/api/v2/`) won't work.」
  - トークン寿命は固定600秒（10分）。
- `@auth0/nextjs-auth0` v4の`auth0.getAccessToken({audience, scope})`は、`authorizationParameters.scope`を audience をキーにしたオブジェクトで指定することで、複数audience（NexusCRM API + My Organization API）のリフレッシュトークンを1つのセッションで管理できる（MRRT）。
- UI操作中は常時トークンが必要なわけではなく、**実際にAPIを呼ぶタイミングでのみ**`getAccessToken({audience: 'https://YOUR_DOMAIN/my-org/'})`を呼べば良い（ユーザーの初期の疑問への回答）。
- SDKのミドルウェア（`src/proxy.ts`）は、相対パス`/my-org/*`へのfetchをサーバー側で自動プロキシし、トークンを付与する仕組みを持つ（`fetch`自体はSDKの処理ではなく通常のJavaScript関数——SDKが提供するのはこのプロキシ・トークン付与の部分）。
- 必要な設定: Auth0テナント側でRefresh Token Policies（audience + scopeの組み合わせ）とMRRT自体のテナント有効化（EA）。
- **注意**: `EXAMPLES.md`に出てくる`org:read org:write members:read`のようなスコープ名は**プレースホルダーであり、実在するMy Organization APIのスコープ名ではない**。実スコープは2.4節参照。

### 2.4 実在するMy Organization APIスコープ

`auth0/myorganization-js`（SDK実装）で確認した実際のスコープ命名規則: `{action}:my_org:{resource}`

- `read:my_org:identity_providers` / `create:my_org:identity_providers` / `update:my_org:identity_providers` / `delete:my_org:identity_providers`
- `update:my_org:identity_providers_detach`
- `read:my_org:details`
- `read:my_org:domains`
- Member Management関連（別途opt-inが必要なbeta/EAスコープ）: `read:my_org:members` 等

## 3. 権限モデル: 誰がMy Organization APIを呼べるか

これが今回最も議論が揺れた論点。経緯を含めて記録する。

### 3.1 結論（検証済み）

**テナントロール・Organizationロールのどちらでも、`my_org:*`権限を持つロールをユーザーに割り当てれば、Organization経由ログイン時のアクセストークンにその権限が反映される。**

出典: https://auth0.com/docs/manage-users/organizations/organization-roles （ページタイトル "Organization Roles"）

- 「Organization Roles allow you to define roles that exist only within a specific Organization.」（Organizationロールは単一Organizationの中でのみ存在するロールを定義する機能）
- 「Unlike tenant roles, which apply across your entire tenant, Organization roles are scoped to a single Organization.」（テナントロールはテナント全体に適用されるのに対し、Organizationロールは単一Organizationにスコープされる）
- Organization経由でログインした場合、ユーザーが受け取る権限は「tenant roles, Organization roles, or both」（テナントロール、Organizationロール、またはその両方）。
- Organization文脈なしでログインした場合はテナントロールのみが適用される。

つまり、**Organizationロール機能（EA）を使わなくても、既存のテナントロール（User Management > Roles）に`my_org:*`権限を持たせてユーザーに割り当てれば、My Organization APIは呼び出せる**。Organizationロールは「Organization単位で異なる権限体系を持たせたい」場合の追加機能であり、My Organization APIを呼ぶための必須条件ではない。

### 3.2 なぜここが揺れたか（経緯の記録）

調査の過程で以下の情報が一見矛盾しているように見え、結論が二転三転した。

1. `https://auth0.com/docs/manage-users/organizations/using-tokens` の内容（この日取得した抄録）:
   - 「the access token includes permissions from those Organization roles in the `permissions` claim」
   - 「The permissions reflect only the roles held within the active Organization for that session.」
   - 「tenant roles remain active and token behavior is unchanged」（Organization文脈が無い場合）
   - → 一見、Organization文脈でログインした場合は**Organizationロールのみ**が反映され、テナントロールは無視されるように読める。

2. しかし`organization-roles`ページ本文は「tenant roles, Organization roles, or both」と明記しており、**テナントロールもOrganization文脈下で有効**と述べている。

3. ユーザー自身がAuth0ダッシュボードのメンバーへのロール割り当てUIで、`Admin [TENANT]`と`Admin [DEMO CORP]`が**並列**で選択可能な画面を提示し、「テナントロールもOrgロールも並列で選択できることから、ユーザー自身に紐づけられたロールはテナントもOrgロールも同列に扱われるということを示しているのでは」と指摘。これは3.1の結論と整合する。

4. 社内Slackでも「ロール割り当てダイアログはテナントロールとOrganizationロールを混在して表示する」という趣旨の投稿を確認（チャンネル名・投稿者・日付は要再確認——このメモ作成時点でリンクを再取得していないため【未確認】）。

**結論としては3.1が正しい**。using-tokensページの「The permissions reflect only the roles held within the active Organization」という一文は、文脈上「Organization *roles*」に限定した説明であり、「Organizationの文脈下でアクティブなロール（テナントロール含む）」という意味で読むべきだった可能性が高い。organization-rolesページの明示的な「tenant roles, Organization roles, or both」の方が、この論点について直接的かつ明確に答えている一次情報であり、これを優先する。

### 3.3 「Organization Super Admin」System Role（新情報）

社内Confluence RFC「System Roles - API Design」（ページID 1051430676、Status: COMPLETED）に以下の記載がある。

- Auth0は`POST /api/v2/resource-servers`でMy Organization APIリソースサーバーを有効化した際、**自動的に「Organization Super Admin」というSystem Roleをテナントに自動プロビジョニングする**（`POST /tenants/{tenantName}/internal/system-roles`、`kind: "org_super_admin"`）。
- System Roleは「Auth0が所有し、権限セットが静的に定義されたロール」で、テナント管理者が編集・削除できない。
- このRoleは`role_type='organization'`かつ`owner_id='auth0'`として扱われ、**Organizationメンバーへの通常のロール割り当て経路（`POST /api/v2/organizations/{id}/roles/{roleId}/members`）で割り当てる**。
- 権限はコード側に静的定義されており、通常のロール権限DBには保存されない。`GET .../permissions`エンドポイントでSystem Role用に特別に権限を返すロジックが追加されている（"System Roles scope injection mechanism"）。
- 自己昇格防止のガードレールあり（Organization Adminが自分自身にロールを付与することを防ぐ、という趣旨の記述がRFC内にある）。

**この情報が意味すること**: Organizationごとに同じ権限セットのロールを毎回手動で作る運用コストを避けたい場合、Auth0が自動提供する「Organization Super Admin」System Roleをそのまま割り当てる、という選択肢がある。これは3.1の結論（テナントロールでも良い）と対立するものではなく、「Organization単位でAdmin相当の権限を配りたい場合の既製品」という位置づけ。本RFCはCOMPLETEDであり実装済みの機能と見られるが、**自テナントで実際にこのSystem Roleが見えるか・My Organization APIリソースサーバー有効化後に自動生成されているかはこのメモの時点で未確認**。

【未確認】: 自テナントのダッシュボードで「Organization Super Admin」ロールの実在を確認していない。My Organization APIを有効化した後に自分のテナントで`GET /api/v2/roles?type=organization&owner_id=auth0`相当を確認する、または単純にOrganizationのMembersタブのロール割り当てダイアログを確認する必要がある。

### 3.4 権限の最終決定ロジック

My Organization APIで実際に使える権限は以下の積集合（intersection）:

1. アプリケーション（Auth0 Application=NexusCRMフロントエンド）のAPI Access Policyで許可されたスコープ（Client Grant）
2. ユーザーのRBAC権限（上記3.1〜3.3のロールから来るもの）
3. ユーザーが実際に同意（consent）したスコープ

出典: https://auth0.com/docs/manage-users/my-organization-api
「Final permissions are determined by the intersection of the scopes allowed by the application API access policy」+ RBAC権限 + consent。

IDトークンには`urn:auth0:my_org_current_user_permissions`というクレームが自動的に付与され、ユーザーが保持する`my_org:*`権限の一覧が入る。

## 4. `organization_access_level` / `access_level`

これも当初の理解が誤っていた点。

### 4.1 誤解していたこと

初期の調査で「`organization_access_level`はManagement APIの`POST/PATCH /organizations/{id}/enabled_connections`で設定するフィールドだ」と誤って説明していたが、**このフィールドは当該エンドポイントのリクエスト/レスポンススキーマに存在しない**（検証済み）。

### 4.2 正しい理解

出典: https://auth0.com/docs/manage-users/my-organization-api

- `organization_access_level`は4段階の値を取る: `none` / `readonly` / `limited` / `full`
  - `none`: テナント管理者が割り当てた関連付け。My Organization APIからは参照も編集も不可。
  - `readonly`: My Organization APIから参照可能だが編集不可。
  - `limited`: My Organization APIから限定的な情報・変更のみ可能（`show_as_button`/`is_enabled`等）。
  - `full`: My Organization APIからOrganization固有のConnection属性（オプション、`display_name`、ドメイン等）を制限なく変更可能。
- **`organization_access_level`はManagement API経由でのみ変更可能**（My Organization APIからは変更できない）。
- しかし、**My Organization APIの`POST /identity-providers`（新しいEnterprise Connectionを作成するエンドポイント）経由で作成した場合、レスポンス例では`access_level: "full"`になっている**（「The created identity provider will have `access_level` set to full (the creating organization becomes the owner)」——社内Confluence PRD「My Organization API - Identity Provider Management」より）。

つまり、**OrganizationがMy Organization API経由で自分でConnectionを新規作成する場合は、作成した時点で自動的に`full`になり、`organization.created`イベントをトリガーにしてManagement APIで`organization_access_level`を能動的に`full`にする自動化（当初ユーザーが提案した方式）は不要になる可能性が高い**。

【未確認】: 上記はConfluence PRD内の設計記述であり、実テナントでMy Organization APIの`POST /identity-providers`を実行して`access_level`レスポンスを確認していない。実装前に一度確認すべき。

### 4.3 `organization_access_level`は必須か

ユーザーからの問い「そもそもEnterprise ConnectionをMy Organization APIで作って紐づけた時点で`organization_access_level`は`none`になるのか」について：Connection作成（`POST /identity-providers`）は、Management APIの「既存Connectionに対する`organization_access_level`の事後設定」とは別経路であり、**作成と同時に`full`として紐づく**（4.2参照）。既存の、Tenant Adminが手動で作ったConnectionをOrganizationに事後的に紐づける場合（Management API `PATCH /organizations/{id}/enabled_connections/{connectionId}`）は、デフォルトが何かは別途確認が必要。

## 5. 未解決・次の検証ステップ

実装着手前に以下を確認する。

1. **自テナントでの実機確認（最重要）**:
   - My Organization APIリソースサーバーを有効化した時点で「Organization Super Admin」System Roleが実際に生成されるか。
   - テナントロール（`User Management > Roles`で作成、`my_org:*`権限付与）をユーザーに割り当てた状態で、Organization経由でログインして取得したアクセストークンに、実際に`my_org:*`権限が載っているかを確認する（JWTデコードして`permissions`クレームを見る）。
   - My Organization APIの`POST /identity-providers`を実行し、レスポンスの`access_level`が本当に`full`になるかを確認する。
2. **MRRTのテナント有効化状況の確認**: Refresh Token PoliciesでMy Organization APIのaudience + スコープが設定可能か、EA機能として自テナントで使えるか。
3. **Member Management関連スコープ**（`read:my_org:members`等）が必要か——今回のスコープ（Enterprise Connection管理）には直接関係しないため、現時点では対象外。
4. **フロントエンド実装箇所の変更**（未着手）:
   - `frontend/src/lib/auth0.ts`: `authorizationParameters.scope`をaudienceごとのマップ形式に変更（NexusCRM APIのスコープ + `https://{AUTH0_DOMAIN}/my-org/`のスコープ）。
   - `frontend/src/proxy.ts`: `/my-org/*`への相対fetchプロキシが正しく動くことを確認。
   - UIコンポーネント: `/my-org/identity-providers`等を呼ぶ新規ページ・フォームの追加。
5. **`auth0events`での`organization.created`対応の必要性再評価**: 4.2の確認結果次第で、当初ユーザーが提案した「`organization.created`イベントでManagement APIを呼んで`organization_access_level`を`full`にする」という自動化は不要になる可能性が高い。ロール割り当て（3.3のSystem Role、または独自テナントロール）側の自動化が必要になるかどうかは別途検討（`organization.created`イベントには作成者user_idが含まれないため、ロール自動割り当てのトリガーには使いづらい——`organization.member.added`等の別イベントを検討する必要がある）。

## 6. 参考資料

- https://auth0.com/docs/manage-users/my-organization-api （My Organization API本体ドキュメント: スコープ、トークン要件、`organization_access_level`の定義）
- https://auth0.com/docs/manage-users/organizations/organization-roles （Organization Roles機能: テナントロールとの違い、token挙動）
- https://auth0.com/docs/manage-users/organizations/using-tokens （Organization文脈でのトークン発行・権限反映の説明。3.2の経緯で言及）
- 社内Confluence: 「RFC: System Roles - API Design」（ページID 1051430676、Status: COMPLETED）— Organization Super Admin System Roleの設計
- 社内Confluence: 「PRD - My Organization API - Identity Provider Management」— `POST /identity-providers`のレスポンス仕様（`access_level: full`）
- 社内Confluence: 「E2E Demo - Organization Roles Early Access」（ページID 1010863220）— Organization-Level Roles機能の経緯（WorkOS/Frontegg対抗のための競合上の背景）
- `auth0/myorganization-js`（GitHubリポジトリ）— 実際のスコープ名の確認元

---

本ドキュメントは調査時点のスナップショットであり、特にEarly Access機能の仕様は変更される可能性がある。実装前に5節の検証ステップを必ず再実施すること。
