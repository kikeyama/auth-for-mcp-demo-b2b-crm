# NexusCRM MCP Server

Auth0 の **Auth for MCP** 機能を使って保護されたリモート MCP サーバーです。AI エージェント（Claude Desktop、Cursor など MCP クライアント）が NexusCRM の CRM データに OAuth 2.1 認可フローでアクセスできます。

---

## 概要

```
AI エージェント
    │  ① .well-known/oauth-protected-resource を取得
    │  ② Auth0 で認可コードフロー (PKCE + CIMD)
    │  ③ Bearer トークンで /mcp へ接続（audience = MCP サーバー自身）
    ▼
MCP サーバー (port 3006)
    │  ④ @auth0/auth0-api-js でトークン検証（aud = MCP サーバー自身の audience）
    │  ⑤ OBO token exchange で downstream API 向けの新しいトークンを取得
    ▼
マイクロサービス (accounts/opportunities/contacts/activities)
```

### 2 つの Audience（OBO Token Exchange）

MCP サーバーは [MCP 仕様](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#access-token-privilege-restriction) に従い、AI エージェントから受け取ったトークンをそのままマイクロサービスへ転送しません。代わりに Auth0 の [On-Behalf-Of Token Exchange](https://auth0.com/ai/docs/mcp/get-started/call-your-apis-on-users-behalf) を使い、MCP サーバー自身が **resource server**（受信トークンの検証）と **client**（downstream API 呼び出し）の二重の役割を持ちます。それぞれ別の Auth0 API・別の audience として登録する必要があります。

| 環境変数 | Audience | 役割 |
|---|---|---|
| `AUTH0_AUDIENCE` | MCP サーバー自身の正規 URI（例: `http://localhost:3006/mcp`） | AI エージェントから受け取るトークンの `aud` 検証用。MCP 仕様 (RFC 8707) の要請で、mcp-remote が送る `resource` パラメータと一致させる必要がある |
| `API_AUDIENCE` | マイクロサービス共通の API identifier（例: `https://api.nexuscrm.com`） | OBO token exchange のターゲット audience。交換後のトークンがマイクロサービスの `checkJwt` を通過できるようにする |

交換後のトークンは元のトークンと同じ `sub` / `org_id` クレームを保持するため、マイクロサービス側はユーザー・組織のコンテキストを正しく認識できます。

---

## エンドポイント

| パス | 説明 |
|------|------|
| `POST /mcp` | MCP Streamable HTTP トランスポート（ツール呼び出し） |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 — AI クライアントが認可サーバーを発見するエントリポイント |
| `GET /.well-known/oauth-authorization-server` | OAuth 2.0 AS メタデータ — Auth0 のエンドポイント情報を返す |
| `GET /healthz/live` | Liveness probe — 常に 200 を返す |
| `GET /healthz/ready` | Readiness probe — 常に 200 を返す |

---

## ツール一覧

| ツール名 | 説明 | 必要なスコープ |
|----------|------|----------------|
| `list_accounts` | 顧客企業一覧 | `read:accounts` |
| `get_account` | 顧客企業詳細 | `read:accounts` |
| `create_account` | 顧客企業作成 | `create:accounts` |
| `update_account` | 顧客企業更新 | `update:accounts` |
| `list_opportunities` | 案件一覧 | `read:opportunities` |
| `get_opportunity` | 案件詳細 | `read:opportunities` |
| `create_opportunity` | 案件作成 | `create:opportunities` |
| `update_opportunity` | 案件更新 | `update:opportunities` |
| `list_opportunity_history` | 案件変更履歴 | `read:opportunities` |
| `list_contacts` | 連絡先一覧 | `read:contacts` |
| `get_contact` | 連絡先詳細 | `read:contacts` |
| `create_contact` | 連絡先作成 | `create:contacts` |
| `update_contact` | 連絡先更新 | `update:contacts` |
| `list_activities` | 活動履歴一覧 | `read:activities` |
| `get_activity` | 活動履歴詳細 | `read:activities` |
| `create_activity` | 活動履歴記録 | `create:activities` |
| `update_activity` | 活動履歴更新 | `update:activities` |
| `get_current_user` | ログイン中のユーザー自身の情報を取得（owner_id 照合に使用） | `read:users` |

スコープの適用は各マイクロサービスの `express-oauth2-jwt-bearer` 側で行われます。MCP サーバー自体はスコープ検証を行いませんが、OBO token exchange のリクエストには受信トークンのスコープをそのまま渡すため、ユーザーが同意したスコープの範囲内で downstream トークンが発行されます。

---

## クライアント登録方式

MCP spec (2025-11-25) は 3 つのクライアント登録方式を定義しています。本デモは **CIMD を第一優先**、DCR をフォールバックとして使用します。

| 方式 | 概要 | 本デモでの扱い |
|------|------|----------------|
| **CIMD** (Client ID Metadata Document) | HTTPS URL を `client_id` として使う。AS がその URL からメタデータを取得 | ✅ 第一優先 |
| **DCR** (Dynamic Client Registration) | 初回接続時にクライアントが AS へ自己登録 | ⚠️ フォールバック |
| **事前登録** | Auth0 ダッシュボードで手動登録 | ❌ 非推奨（クライアントが増えるたびに作業が発生） |

### CIMD を選ぶ理由

Auth0 の DCR は登録済みクライアントの自動期限切れや未使用クライアントの自動削除機能がありません。DCR を使うとユーザー（AI エージェント）が増えるたびに Application が無限に増殖し、本番運用に耐えられなくなります。

CIMD では **クライアント側が HTTPS URL でホストするメタデータ文書が `client_id`** になります。Auth0 がその URL を fetch してクライアントを検証するため、Auth0 ダッシュボードに Application を作成する必要がありません。

---

## Auth0 設定

### 1. CIMD の有効化

Auth0 Dashboard → **Settings → Advanced** の **Settings** セクションで **Client ID Metadata Document Registration** トグルを ON にします。

有効化後、テナントの well-known エンドポイントで確認できます。

```bash
curl https://YOUR_TENANT.auth0.com/.well-known/oauth-authorization-server \
  | jq '.client_id_metadata_document_supported'
# → true
```

### 2. API の登録（MCP サーバー自身と downstream で 2 つ）

OBO Token Exchange のため、MCP サーバー自身とマイクロサービスは**別々の Auth0 API** として登録します。

#### 2a. downstream API（既存の API を流用）

既存の `https://api.nexuscrm.com` API をそのまま使います（マイクロサービスと共有、`API_AUDIENCE` に設定）。

Auth0 Dashboard → **Applications → APIs** → `NexusCRM API` を開き、以下を確認します。

- **Identifier**: `https://api.nexuscrm.com`
- **Signing Algorithm**: RS256
- **RBAC**: 有効（Enable RBAC）
- **Add Permissions in the Access Token**: 有効

**Permissions タブ**に以下のスコープが登録されていることを確認します。

```
read:accounts       create:accounts     update:accounts     delete:accounts
read:opportunities  create:opportunities update:opportunities delete:opportunities
read:contacts       create:contacts     update:contacts     delete:contacts
read:activities     create:activities   update:activities   delete:activities
read:users
```

#### 2b. MCP サーバー自身の API（新規登録）

Auth0 Dashboard → **Applications → APIs → Create API** で新規作成します（`AUTH0_AUDIENCE` に設定）。

| 項目 | 値 |
|---|---|
| Name | NexusCRM MCP Server |
| Identifier | `http://localhost:3006/mcp`（MCP サーバーの正規 URI。本番では `https://<mcp-host>/mcp`） |
| Signing Algorithm | RS256 |

MCP 仕様 (RFC 8707) の要請で、mcp-remote が送る `resource` パラメータと Identifier を一致させる必要があります。**Permissions タブ**には downstream API と同じスコープ一覧（`scopesSupported` として広告する分）を登録しておきます。

### 3. MCP クライアント用 Application の登録

#### Claude Desktop 用（Native アプリ）

後述の接続設定で説明する制約（mcp-remote の CIMD 非対応、Auth0 CIMD と Organizations の非互換）のため、Claude Desktop は事前登録した Native アプリを使用します。

Auth0 Dashboard → **Applications → Applications → Create Application**

| 項目 | 値 |
|---|---|
| Name | NexusCRM MCP (Claude Desktop) |
| Application Type | Native |

作成後、**Settings** タブで以下を設定：

| 項目 | 値 |
|---|---|
| Allowed Callback URLs | `http://localhost:12739/oauth/callback` |

**APIs タブ**で手順 2b の MCP サーバー API（Audience）を有効化します（user-delegated アクセス）。

> **注意**: アプリケーションの **APIs タブ**で設定します。API の "Machine to Machine Applications" タブ（`client_credentials` フロー専用）ではありません。

**Organizations タブ**で対象組織を割り当てます（手順 4 も参照）。

Settings タブから **Client ID** と **Client Secret** を控えておきます。このアプリは OBO Token Exchange の confidential client としても使うため、Client Secret も必要です（`AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` に設定）。

#### Claude Code 用（CIMD）

Claude Code は CIMD を使用するため、Auth0 への事前登録が必要です。

Auth0 Dashboard → **Applications → Applications → Create Application → Import from URL**

| 項目 | 値 |
|---|---|
| URL | `https://claude.ai/oauth/claude-code-client-metadata` |

作成されたアプリの **APIs タブ**で API（Audience）を有効化します。

> **制約**: Auth0 の CIMD で登録したアプリは 3rd party app 扱いになるため、Organizations をサポートしていません。現時点では Claude Code からの接続に `org_id` クレームが付与されず、`authenticate()` が拒否します。

### 4. Organizations の確認

NexusCRM は B2B マルチテナント構成のため、トークンに `org_id` クレームが含まれる必要があります。

Auth0 Dashboard → **Organizations** で、利用する Organization が作成済みであることを確認します。手順 3 で登録した Native アプリを対象組織の **Members/Applications タブ**で紐付けた後、「Business Users」の Login Flow を **「Prompt for Credential」** に設定します。これによりユーザーが認証時に組織の認証情報を入力するフローになり、`/authorize` リクエストに `organization` パラメータを渡すことなくトークンに `org_id` クレームが自動的に含まれます。

MCP サーバーの `authenticate()` は `org_id` クレームが存在しない場合に `Organization context required` エラーを返します。

### 5. 環境変数の設定

```bash
cp services/mcp/.env.example services/mcp/.env
```

`.env` を編集します。

```dotenv
PORT=3006
MCP_SERVER_URL=http://localhost:3006

AUTH0_DOMAIN=your-tenant.auth0.com          # スキームなし
AUTH0_AUDIENCE=http://localhost:3006/mcp    # MCP サーバー自身の audience（手順 2b）
API_AUDIENCE=https://api.nexuscrm.com       # downstream API の audience（手順 2a、マイクロサービスと共有）

# OBO Token Exchange 用の confidential client 認証情報（手順 3 の Native アプリ）
AUTH0_CLIENT_ID=your-mcp-client-id
AUTH0_CLIENT_SECRET=your-mcp-client-secret

ACCOUNTS_SERVICE_URL=http://localhost:3001
OPPORTUNITIES_SERVICE_URL=http://localhost:3002
CONTACTS_SERVICE_URL=http://localhost:3003
ACTIVITIES_SERVICE_URL=http://localhost:3004
```

---

## 起動

```bash
# 依存関係のインストール（初回のみ）
npm install --prefix services/mcp

# 開発サーバー起動
npm run dev --prefix services/mcp
```

起動後、CIMD サポートが広告されていることを確認します。

```bash
# CIMD サポートの確認（true が返ること）
curl http://localhost:3006/.well-known/oauth-authorization-server \
  | jq '.client_id_metadata_document_supported'

# 認可サーバーの情報確認
curl http://localhost:3006/.well-known/oauth-protected-resource
```

---

## AI クライアントへの接続設定

### Claude Desktop

**事前登録クライアントを使用する理由**:

1. **mcp-remote の CIMD 非対応**: `mcp-remote` 現行バージョン（v0.1.38）は CIMD をサポートしていません。`NodeOAuthClientProvider` に `clientMetadataUrl` が実装されておらず、動的クライアント登録（DCR）にフォールバックします。
2. **Auth0 CIMD と Organizations の非互換**: Auth0 の CIMD で登録されたクライアントは 3rd party app 扱いになるため、Organizations をサポートしていません。DCR 経由で登録されたクライアントも同様です。

上記の理由から、手順 3 で登録した Native アプリの `client_id` を `--static-oauth-client-info` で直接指定するワークアラウンドを使用します。

`~/Library/Application Support/Claude/claude_desktop_config.json` に追加します（`<YOUR_CLIENT_ID>` は手順 3 で控えた Client ID に置き換えてください）：

```json
{
  "mcpServers": {
    "nexuscrm": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3006/mcp",
        "12739",
        "--allow-http",
        "--static-oauth-client-info",
        "{\"client_id\":\"<YOUR_CLIENT_ID>\"}"
      ]
    }
  }
}
```

`12739` は mcp-remote がサーバー URL（`http://localhost:3006/mcp`）から決定論的に計算するコールバックポートです。

Claude Desktop を再起動すると認証フローが開始されます。ブラウザで Auth0 にサインインし、組織を選択してください。

### Claude Code

```bash
claude mcp add --transport http http://localhost:3006/mcp
```

Claude Code は CIMD を使用し、`https://claude.ai/oauth/claude-code-client-metadata` を `client_id` として認証します。Auth0 側で手順 3 の CIMD アプリ登録が必要です。

> **制約**: 手順 3 で触れた通り、CIMD アプリは Auth0 で 3rd party app 扱いになるため Organizations をサポートしておらず、現時点ではトークンに `org_id` クレームが付与されません。この制約が解消されるまで、Claude Code からの接続は利用できません。

### Cursor

Settings → MCP → Add Server で以下を入力します。

```
Server URL: http://localhost:3006/mcp
```

---

## Auth for MCP の実装

Auth for MCP は **Auth0 の認可サーバー機能** + **fastmcp の OAuth ディスカバリー** + **`@auth0/auth0-api-js` のトークン検証** の 3 層で構成されています。Auth0 専用の「Auth for MCP SDK」は存在せず、それぞれの役割を持つ既存の部品を組み合わせています。

| 役割 | 担当 |
|------|------|
| OAuth ディスカバリーエンドポイントの提供 (`/.well-known/*`) | `fastmcp` の `oauth` オプション |
| JWT トークンの検証 | `@auth0/auth0-api-js` |
| 認可サーバーとしての機能（PKCE、CIMD、DCR） | Auth0 テナント（GA 済み、設定不要） |

---

### Step 1 — fastmcp で OAuth ディスカバリーを有効化（`src/index.ts`）

`FastMCP` コンストラクタの `oauth` オプションを設定するだけで、fastmcp が `/.well-known/oauth-protected-resource`（RFC 9728）と `/.well-known/oauth-authorization-server` を自動的にサーブします。

`client_id_metadata_document_supported: true` を追加することで、CIMD に対応した AS メタデータをクライアントに広告します。

```typescript
// src/index.ts
import { FastMCP } from 'fastmcp';
import { authenticate, type MCPSession } from './auth';

const server = new FastMCP<MCPSession>({
  name: 'NexusCRM MCP Server',
  version: '1.0.0',
  authenticate,           // ← リクエストごとに呼ばれるトークン検証関数
  oauth: {
    enabled: true,

    // /.well-known/oauth-protected-resource の内容
    // AI クライアントはここで「どの認可サーバーを使うか」を知る
    protectedResource: {
      resource:             'http://localhost:3006/mcp', // MCP サーバー URL (RFC 9728 §2) — audience とは別物
      authorizationServers: ['https://your-tenant.auth0.com/'],
      jwksUri:              'https://your-tenant.auth0.com/.well-known/jwks.json',
      scopesSupported: ['read:accounts', 'create:accounts', /* ... */],
    },

    // /.well-known/oauth-authorization-server の内容
    // client_id_metadata_document_supported: true → CIMD を優先使用
    // registrationEndpoint → CIMD 非対応クライアント向け DCR フォールバック
    authorizationServer: {
      issuer:                              'https://your-tenant.auth0.com/',
      // audience= を埋め込む: mcp-remote は audience パラメータを付けないため、
      // ここに固定しないと Auth0 がオペーク トークンを発行してしまう。
      // 値は MCP サーバー自身の audience（downstream API の audience とは別物）。
      authorizationEndpoint:               'https://your-tenant.auth0.com/authorize?audience=http://localhost:3006/mcp',
      tokenEndpoint:                       'https://your-tenant.auth0.com/oauth/token',
      responseTypesSupported:              ['code'],
      codeChallengeMethodsSupported:       ['S256'],    // PKCE 必須
      grantTypesSupported:                 ['authorization_code', 'refresh_token'],
      client_id_metadata_document_supported: true,     // CIMD サポートを広告
      registrationEndpoint:               'https://your-tenant.auth0.com/oidc/register',
    } as any, // fastmcp の型定義が client_id_metadata_document_supported に未対応
  },
});
```

AI クライアントが `/mcp` にトークンなしでアクセスすると、fastmcp は自動的に以下を返します。

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="http://localhost:3006/.well-known/oauth-protected-resource"
```

これが MCP の OAuth ディスカバリーフローのエントリポイントです。

---

### Step 2 — `@auth0/auth0-api-js` でトークンを検証（`src/auth.ts`）

`authenticate` 関数は fastmcp から各リクエストごとに呼び出されます。`@auth0/auth0-api-js` の `ApiClient` が JWT 検証（署名・`iss`・`aud`・有効期限）を担います。

```typescript
// src/auth.ts
import { ApiClient, getToken } from '@auth0/auth0-api-js';
import type http from 'http';

// ApiClient はモジュールレベルで一度だけ初期化（JWKS をキャッシュ）。
// audience は MCP サーバー自身のもの（受信トークンの aud 検証用）。
// clientId/clientSecret は OBO token exchange (getTokenOnBehalfOf) が要求する confidential client 認証情報。
const apiClient = new ApiClient({
  domain:       'your-tenant.auth0.com',  // スキームなし
  audience:     'http://localhost:3006/mcp',
  clientId:     'your-mcp-client-id',
  clientSecret: 'your-mcp-client-secret',
});

export type MCPSession = {
  token:  string;   // 後でマイクロサービスへ転送するために保持
  sub:    string;   // Auth0 ユーザー ID
  orgId:  string;   // B2B マルチテナント: org_id クレーム
  scopes: string[]; // 付与されたスコープ一覧
};

export async function authenticate(
  request: http.IncomingMessage,
): Promise<MCPSession> {
  const token = getToken(
    request.headers as Record<string, string | string[] | undefined>,
  );

  // 検証失敗（期限切れ・署名不正など）は例外がスローされ fastmcp が 401 を返す
  const claims = await apiClient.verifyAccessToken({ accessToken: token });

  // B2B 必須: org_id がない = 組織コンテキストなし → 拒否
  const orgId = claims['org_id'] as string | undefined;
  if (!orgId) throw new Error('Organization context required');

  return {
    token,
    sub: claims.sub!,
    orgId,
    scopes: ((claims.scope as string) ?? '').split(' ').filter(Boolean),
  };
}
```

---

### Step 3 — ツールハンドラーでセッション情報を利用（`src/tools/*.ts`）

```typescript
// src/tools/accounts.ts（抜粋）
export const accountTools: Tool<MCPSession, any>[] = [
  {
    name: 'get_account',
    parameters: z.object({ id: z.string() }),
    execute: async (args, ctx) => {
      // ctx.session       → MCPSession（callService 内で OBO exchange に使われる）
      // ctx.session.orgId → org_id クレーム（テナント識別）
      const data = await callService(base, `/accounts/${args.id}`, 'GET', ctx.session!);
      return JSON.stringify(data, null, 2);
    },
  },
];
```

---

### Step 4 — OBO Token Exchange で downstream トークンを取得（`src/oboToken.ts` / `src/serviceClient.ts`）

MCP サーバーは受け取った Bearer トークンをそのまま転送せず、`apiClient.getTokenOnBehalfOf()` で `API_AUDIENCE` 向けの新しいトークンに交換します。交換後のトークンは `sub` / `org_id` クレームを保持したまま audience だけが変わります。交換結果は `sub:orgId` をキーに LRU キャッシュし（TTL はトークンの `expiresAt - 30s`）、API 呼び出しごとに Auth0 へリクエストしないようにします。

```typescript
// src/oboToken.ts
export async function getOboToken(session: MCPSession): Promise<string> {
  const key = `${session.sub}:${session.orgId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const result = await apiClient.getTokenOnBehalfOf(session.token, {
    audience: config.auth0.apiAudience,   // ← downstream API の audience（MCP 自身とは別）
    scope:    session.scopes.join(' '),
  });

  const ttlMs = Math.max(0, (result.expiresAt - 30) * 1000 - Date.now());
  cache.set(key, result.accessToken, { ttl: ttlMs });
  return result.accessToken;
}
```

```typescript
// src/serviceClient.ts
export async function callService(baseUrl, path, method, session: MCPSession, body?) {
  const token = await getOboToken(session);   // ← 交換後のトークン
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // ...
}
```

---

### CIMD フロー（全体像）

```
AI クライアント（CIMD 対応）

  1. POST /mcp  ← トークンなし
     → 401  WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"

  2. GET /.well-known/oauth-protected-resource
     → { authorization_servers: ["https://your-tenant.auth0.com/"] }

  3. GET https://your-tenant.auth0.com/.well-known/oauth-authorization-server
     → { client_id_metadata_document_supported: true,  ← CIMD サポートを確認
         authorization_endpoint: ".../authorize", ... }

  4. Authorization Request（client_id として HTTPS URL を使用）
     GET  https://your-tenant.auth0.com/authorize?
            client_id=https://client.example.com/mcp-metadata.json
            &redirect_uri=http://localhost:PORT/callback
            &code_challenge=...&code_challenge_method=S256

     Auth0 が https://client.example.com/mcp-metadata.json を fetch して検証
     → { client_id, client_name, redirect_uris: ["http://localhost:PORT/callback"] }

  5. POST https://your-tenant.auth0.com/oauth/token
     → { access_token: "eyJ...", token_type: "Bearer" }

  6. POST /mcp  Authorization: Bearer eyJ...
     → authenticate() で検証 → ツール実行
```

クライアントメタデータ文書の例:

```json
{
  "client_id": "https://app.example.com/mcp-client-metadata.json",
  "client_name": "Example MCP Client",
  "redirect_uris": [
    "http://127.0.0.1:3000/callback",
    "http://localhost:3000/callback"
  ],
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```
