# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start all services concurrently (DB must be running separately)
npm run dev

# Start individual service
npm run dev --prefix services/account      # port 3001
npm run dev --prefix services/opportunity  # port 3002
npm run dev --prefix services/contact      # port 3003
npm run dev --prefix services/activity     # port 3004
npm run dev --prefix services/user         # port 3005
npm run dev --prefix services/mcp          # port 3006
npm run dev --prefix frontend              # port 3000

# Frontend only
cd frontend && npm run build
cd frontend && npm run lint

# Build a microservice
cd services/account && npm run build   # outputs to dist/

# Start PostgreSQL via Docker
docker compose up postgres -d

# Reset the database (destructive)
docker compose down -v && docker compose up postgres -d
```

Services run with `ts-node-dev --respawn --transpile-only`, so file changes auto-restart the service. No manual restart needed during development.

## Environment Setup

- **Frontend**: copy `frontend/.env.local.example` → `frontend/.env.local`
- **Each microservice**: copy `services/<name>/.env.example` → `services/<name>/.env`
- **Docker Compose**: copy `.env.example` → `.env`

Key difference: `AUTH0_DOMAIN` (frontend, no scheme) vs `AUTH0_ISSUER_BASE_URL` (microservices, full `https://` URL).

The `services/mcp` service uses `AUTH0_DOMAIN` (no scheme, same as frontend) with `@auth0/auth0-api-js` — not `AUTH0_ISSUER_BASE_URL`.

## Architecture

### Services and ports
| Service | Port | Responsibility |
|---|---|---|
| frontend (Next.js 14) | 3000 | UI + BFF API routes |
| account | 3001 | Accounts CRUD |
| opportunity | 3002 | Opportunities CRUD |
| contact | 3003 | Contacts CRUD |
| activity | 3004 | Activities CRUD |
| user | 3005 | Users sync & CRUD |
| mcp | 3006 | MCP server for AI agents |
| PostgreSQL | 5432 | Single shared DB |

### Health probe endpoints

All services expose Kubernetes-style probes (no auth required):

| Path | Liveness | Readiness |
|---|---|---|
| Microservices (Express) | `GET /healthz/live` → 200 | `GET /healthz/ready` → 200 / 503 (DB ping) |
| MCP (fastmcp/Hono) | `GET /healthz/live` → 200 | `GET /healthz/ready` → 200 (static) |
| Frontend (Next.js) | `GET /api/healthz/live` → 200 | `GET /api/healthz/ready` → 200 (static) |

**Adding custom routes to the MCP server**: `server.getApp()` returns the underlying Hono app instance after `server.start()`. Use it to register routes that fastmcp doesn't expose natively (e.g. health probes):
```ts
const honoApp = server.getApp();
honoApp.get('/healthz/live', (c) => c.json({ status: 'ok' }));
```

### Two data-fetch paths in the frontend

**Server Components → microservices directly** via `src/lib/serverFetch.ts`:
```ts
serverGet('accounts', '/accounts')          // calls localhost:3001/accounts
serverGet('activities', `/activities/${id}`) // calls localhost:3004/activities/:id
```
`src/lib/serverFetch.ts` also exports `serverPost` and `serverPatch` for server-side writes (used in `layout.tsx` for user sync).

`auth0.getAccessToken()` works correctly in Server Component context. All dashboard page files use `export const dynamic = 'force-dynamic'` to bypass Next.js Router Cache.

**Client Components → BFF API routes** via `src/lib/api.ts`:
```ts
api.accounts.create(body)   // POST /api/accounts → serviceProxy → localhost:3001
api.activities.update(id, body)  // PATCH /api/activities/:id → serviceProxy → localhost:3004
```
The BFF lives at `src/app/api/*/route.ts`. Each route handler calls `proxyToService()` from `src/lib/serviceProxy.ts`, which injects the Bearer token.

**Critical**: Do NOT call internal BFF routes from Server Components via `fetch()`. `auth0.getAccessToken()` fails in Route Handlers when called from server-to-server internal fetches (returns `missing_session`). Always use `serverGet` for server-side reads.

### Auth0 (@auth0/nextjs-auth0 v4)

- `src/lib/auth0.ts` — single `Auth0Client` instance used everywhere
- `src/middleware.ts` — mounts `/auth/login`, `/auth/logout`, `/auth/callback` routes; redirects unauthenticated users away from `/dashboard/*`
- Auth routes: `/auth/login`, `/auth/logout`, `/auth/callback` (not `/api/auth/*`)
- Organizations (B2B multi-tenant) are enabled; tokens are org-scoped

### Microservice auth pattern

Every service uses `express-oauth2-jwt-bearer` to validate tokens. `src/middleware/auth.ts` exports:
- `checkJwt` — validates the JWT
- `requireOrg` — ensures `org_id` claim is present
- `requireReadAccounts`, `requireCreateAccounts`, etc. — permission scope guards
- `getTokenClaims(req)` — extracts `{ orgId, userId }` from the validated token

All routes apply `router.use(checkJwt, requireOrg)` at the top.

### MCP server (`services/mcp`)

Built with `fastmcp` ^4.3.2. Exposes 18 CRM tools (CRUD for accounts, opportunities, contacts, activities + `list_opportunity_history` + `get_current_user`) at `/mcp` (HTTP Streamable transport).

Auth0's "Auth for MCP" feature is enabled via the `oauth` block in `src/index.ts`:
- `/.well-known/oauth-protected-resource` — RFC 9728 metadata, served by fastmcp automatically
- `/.well-known/oauth-authorization-server` — points AI clients to Auth0 for token issuance

**Two distinct Auth0 audiences**: the MCP server plays a dual role per [Auth0's Auth for MCP architecture](https://auth0.com/ai/docs/mcp/get-started/call-your-apis-on-users-behalf) — a *resource server* when receiving requests from the MCP client, and a *client* when calling downstream APIs via OBO. Each role has its own Auth0 API registration and audience, and they must NOT be the same env var:
- `AUTH0_AUDIENCE` — the MCP server's own audience. Per MCP spec (RFC 8707), this **must equal the MCP server's canonical URI** (e.g. `http://localhost:3006/mcp`), because mcp-remote sends this exact value as the `resource` parameter and compares it against `protectedResource.resource` (RFC 9728). `ApiClient` in `src/auth.ts` uses this to validate the `aud` claim of tokens received from the MCP client.
- `API_AUDIENCE` — the downstream microservices' audience (e.g. `https://api.nexuscrm.com`), registered as a *separate* Auth0 API. Used only as the target `audience` in `getOboToken()` (`src/oboToken.ts`) for the OBO exchange — never for validating incoming tokens.

**RFC 9728 `resource` field**: `protectedResource.resource` must be the MCP server's own URL (e.g. `` `${config.mcpServerUrl}/mcp` `` = `http://localhost:3006/mcp`) — the same value as `AUTH0_AUDIENCE` by design (see above). mcp-remote v0.1.38 validates this and rejects mismatches.

**`authorizationEndpoint` includes `?audience=`**: mcp-remote does not add an `audience=` parameter to auth requests. Without it, Auth0 issues an opaque token instead of a JWT. Fix: embed it directly — `` `https://${config.auth0.domain}/authorize?audience=${config.auth0.audience}` ``.

**CIMD (Client ID Metadata Document)** is the primary client registration mechanism. `client_id_metadata_document_supported: true` is set in the `authorizationServer` block with `as any` cast because fastmcp's TypeScript type predates this field. DCR (`registrationEndpoint`) is kept as fallback. Auth0 tenant prerequisite: **Settings → Advanced → Client ID Metadata Document Registration** must be enabled. CIMD is preferred over DCR because Auth0 DCR has no client expiry or auto-deletion, causing unbounded Application object growth in production.

**CIMD + Auth0 Organizations limitation**: CIMD-registered clients become 3rd party apps in Auth0, which cannot be assigned to Organizations → `org_id` claim is never included in the token → `authenticate()` throws `'Organization context required'`. Workaround: pre-register a Native app in Auth0, assign it to the Organization, and use `--static-oauth-client-info '{"client_id":"<ID>"}'` with mcp-remote to bypass both DCR and CIMD. mcp-remote v0.1.38 does not implement `clientMetadataUrl`, so CIMD is never attempted anyway — it always falls through to DCR.

**Claude Desktop callback port**: mcp-remote computes the callback port deterministically as `3335 + parseInt(md5(serverUrl).substring(0,4), 16) % 45816`. For `http://localhost:3006/mcp` the port is **12739** — register `http://localhost:12739/oauth/callback` as the Allowed Callback URL in the Auth0 Native app.

Token validation: `@auth0/auth0-api-js` (`ApiClient.verifyAccessToken` + `getToken`). The `authenticate` function in `src/auth.ts` extracts `{ token, sub, orgId, scopes }` from the verified token and stores it in `ctx.session` for each tool handler.

**OBO (On-Behalf-Of) token exchange**: Per [MCP spec §authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#access-token-privilege-restriction), the MCP server MUST NOT pass through the token it received from the MCP client to downstream APIs. Instead, `callService()` in `src/serviceClient.ts` calls `getOboToken(session)` from `src/oboToken.ts`, which uses `apiClient.getTokenOnBehalfOf()` (`@auth0/auth0-api-js`) to exchange the incoming token for a new token targeting `API_AUDIENCE` (the microservices' Auth0 API, distinct from the MCP server's own `AUTH0_AUDIENCE` — see "Two distinct Auth0 audiences" above). The exchanged token carries the same `sub` and `org_id` claims, so downstream microservices see the correct user and org context.

**OBO token caching**: `src/oboToken.ts` uses `lru-cache` (max 1000 entries) keyed by `sub:orgId`. TTL is derived from `result.expiresAt - 30s` to avoid using an expired token. Auth0 recommends caching exchanged tokens for their full lifetime rather than requesting a new one per API call. The `ApiClient` instance in `src/auth.ts` is exported and shared between `authenticate()` (token verification) and `getTokenOnBehalfOf()` (token exchange).

**OBO requires confidential client**: `apiClient` must be initialized with `clientId` + `clientSecret` (`AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET`). Use the same pre-registered Native app (already assigned to the Organization) that is used as the MCP client — or register a separate Machine-to-Machine app with the correct audience.

**Token debug viewer (demo/dev only)**: `getOboToken()` in `src/oboToken.ts` calls `recordExchange(toolName, session.token, accessToken, fromCache)` (`src/debug/store.ts`) on every OBO exchange — cache hit or miss. `src/index.ts` exposes this history at `GET /debug/tokens` / `DELETE /debug/tokens/:id` on the Hono app; both routes are **unauthenticated** (raw JWTs are exposed) and gated behind `ENABLE_TOKEN_DEBUG !== 'false'`. Because of this, `callService()` in `src/serviceClient.ts` and every tool's `execute()` pass a `toolName` string literal (e.g. `'list_accounts'`) purely to label these records — it has no effect on the OBO exchange itself. The frontend surfaces this at `/mcp-debug` via a BFF proxy (`frontend/src/app/api/mcp-debug/route.ts`) that checks the caller has an active session, then fetches `${MCP_SERVICE_URL}/debug/tokens` directly (no Bearer token, since the debug endpoint itself doesn't require one).

**Owner-matching pattern (`get_current_user`)**: `src/tools/users.ts` exposes `get_current_user`, which resolves the caller's own user record via `ctx.session.sub` → `GET /users/:sub` on the `users` service (requires the `read:users` scope, already in `scopesSupported`). It takes no parameters. This lets an AI agent answer requests like "私の案件一覧を取得して" (my opportunities) or "私の担当顧客を取得して" (my accounts) without a dedicated per-entity filter tool: the agent calls `get_current_user` first to get the user ID, then compares it against the `owner_id` field in the results of list tools. Both `opportunities` and `accounts` have `owner_id`. This keeps the pattern reusable across any future entity that gains an owner concept, rather than baking owner-filtering into each list tool individually.

Tool files in `src/tools/*.ts` are typed as `Tool<MCPSession, any>[]` because fastmcp's `addTools` requires all tools share a single `Params` generic; `any` keeps `args` accessible while keeping `ctx: Context<MCPSession>` properly typed.

### User ID strategy

Auth0 `sub` (`auth0|xxxxx`) is used as the primary key of the `users` table and as the value stored in `owner_id` / `created_by` columns. An app-specific UUID was considered but rejected: this project uses Auth0 Organizations with a single Connection, so `sub` is stable and never changes. See `docs/adr-user-id-strategy.md` for the full rationale and the conditions under which this decision should be revisited.

### Database

Single PostgreSQL instance shared by all four microservices. Schema in `database/init.sql`. The `activity_contacts` junction table enables many-to-many between activities and contacts.

There are no migration files — schema changes require either:
1. `ALTER TABLE` on the running container: `docker exec nexuscrm-db psql -U nexuscrm_user -d nexuscrm_db -c "..."`
2. Destroying and recreating the volume (resets all data): `docker compose down -v`

Always update both the running DB (option 1) and `database/init.sql` when changing the schema.

### User sync pattern

`app/(dashboard)/layout.tsx` syncs the logged-in user's Auth0 profile to the user service on every dashboard page load:
1. `auth0.getSession()` → extract profile fields (name, email, picture, etc.)
2. `serverGet('users', '/users/:sub')` — check if user exists
3. If missing: `serverPost('users', '/users', profile)` — requires `create:users` scope
4. If exists: `serverPatch('users', '/users/:sub', profile)` — requires `update:users` scope

User names are resolved in Server Components by fetching `serverGet('users', '/users')` and building a `Map<id, name>` with `userDisplayName(user)` from `src/types/index.ts`.

The `users` table uses Auth0 `sub` as primary key. Schema in `database/init.sql`.

### Frontend component patterns

- **Server Components** (`app/(dashboard)/*/page.tsx`): fetch data with `serverGet`, render HTML
- **Client Components** (`components/forms/*.tsx`): handle mutations via `api.*`, manage form state with `useState`
- **`NumberInput` component** (`components/ui/NumberInput.tsx`): dual-input pattern for currency fields — visible `type="text"` with comma formatting, hidden `type="hidden"` with raw value for FormData
- **Tailwind classes**: `btn-primary`, `btn-secondary`, `btn-danger`, `input` are custom utility classes defined in `globals.css`
- **Post-mutation navigation**: always call `router.push(destination)` first, then `router.refresh()`. Reversing the order refreshes the current (pre-navigation) route's cache instead of the destination's, leaving the destination page stale.

# Compact instructions

When compacting (summarizing) the conversation, follow these guidelines:

- Do not retain full contents of source code files. Keep only file paths and a summary of the changes.
- Prioritize retaining recent work (diffs, current task, next steps).
- For past resolved bugs or discussions, keep only the conclusion and omit the details.

## Avoid large file reads

Do not read generated/lock files in full (e.g. `package-lock.json`, `*.tsbuildinfo`). If you need to check a specific dependency or entry, use `grep`/`Bash` to extract only the relevant lines instead of the `Read` tool on the whole file.
