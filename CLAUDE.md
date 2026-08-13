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
| auth0logs | 3007 | Auth0 Log Stream (Custom Webhook) receiver, demo-only |
| auth0events | 3008 | Auth0 Event Streams (Webhook) receiver — async `users` table sync |
| PostgreSQL | 5432 | Single shared DB |

### Health probe endpoints

All services expose Kubernetes-style probes (no auth required):

| Path | Liveness | Readiness |
|---|---|---|
| Microservices (Express) | `GET /healthz/live` → 200 | `GET /healthz/ready` → 200 / 503 (DB ping) |
| MCP (Express) | `GET /healthz/live` → 200 | `GET /healthz/ready` → 200 (static) |
| Frontend (Next.js) | `GET /api/healthz/live` → 200 | `GET /api/healthz/ready` → 200 (static) |

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
- `src/proxy.ts` — Next.js 16 middleware equivalent; mounts `/auth/login`, `/auth/logout`, `/auth/callback` routes; redirects unauthenticated users away from `/dashboard/*`
- Auth routes: `/auth/login`, `/auth/logout`, `/auth/callback` (not `/api/auth/*`)
- Organizations (B2B multi-tenant) are enabled; tokens are org-scoped

**Expired access token → permanent `invalid_grant` until re-login (fixed via proactive refresh in `proxy.ts`)**: Server Components cannot persist cookies (`@auth0/nextjs-auth0` v4 constraint — see [auth0/nextjs-auth0#2149](https://github.com/auth0/nextjs-auth0/issues/2149), closed doc-only via [PR #2273](https://github.com/auth0/nextjs-auth0/pull/2273); Auth0 has no plans to change SDK behavior here). Before the fix, `src/lib/serverFetch.ts` (used by every dashboard Server Component via `serverGet`/`serverPost`/`serverPatch`) called `auth0.getAccessToken()` directly. When the access token was expired, this successfully refreshed it against Auth0 (rotating/burning the old refresh token) but **could not save the new refresh token back to the cookie** — so the browser kept sending the now-already-consumed refresh token on every subsequent request, permanently failing with `Error [AccessTokenError] { code: 'failed_to_refresh_token', cause: Error [OAuth2Error] { code: 'invalid_grant' } }` (visible in server logs) until the user logged out and back in. This affected the whole app, not just the two `/debug/*` pages — `GET /dashboard` itself was returning 500 from the same unhandled error.

Fix: `src/proxy.ts` now proactively calls `auth0.getAccessToken(request, authRes)` (the exact pattern from `@auth0/nextjs-auth0`'s own `EXAMPLES.md`, "Refreshing an Access Token" → "In middleware") for every non-`/auth/*` request while a session exists, **before** any Server Component runs. Middleware *can* write `Set-Cookie` on `authRes`, so the refreshed token set is persisted there; by the time Server Components call `getAccessToken()` themselves, the cached token is already fresh and no refresh (thus no persistence problem) is triggered. The 5 frontend BFF routes under `src/app/api/*` (`mcp-debug`, `mcp-auth-failures`, `auth0-logs`, `mcp-resource-metadata`, `auth-server-metadata`) were also changed from a bare `auth0.getSession()` existence check to `try { await auth0.getAccessToken(); } catch { return 401 }` — `getSession()` never checks/refreshes token freshness at all, so it doesn't reflect whether the session can still actually authenticate; `getAccessToken()` does (and, called from a Route Handler rather than a Server Component, can persist the refresh too). This exact try/catch pattern is also Auth0's own documented recommendation for Route Handlers (same GitHub issue, maintainer reply).

Residual, deliberately not addressed: this only prevents *new* occurrences — a session whose refresh token has already been burned (e.g. from before this fix) must still re-login once; there's no way to un-invalidate an already-rotated-away refresh token. Also, if Refresh Token Rotation's reuse/overlap period is disabled on the Auth0 Application, concurrent requests can still race on rotation across genuinely separate requests (not just within one Server Component render); Auth0's own guidance for confidential server-side apps like this one is to configure an overlap period or disable rotation entirely in the Application's Advanced Settings → OAuth, which was not applied here since the code-level fix was sufficient for this demo.

### Microservice auth pattern

Every service uses `express-oauth2-jwt-bearer` to validate tokens. `src/middleware/auth.ts` exports:
- `checkJwt` — validates the JWT
- `requireOrg` — ensures `org_id` claim is present
- `requireReadAccounts`, `requireCreateAccounts`, etc. — permission scope guards
- `getTokenClaims(req)` — extracts `{ orgId, userId }` from the validated token

All routes apply `router.use(checkJwt, requireOrg)` at the top.

### OpenTelemetry Tracing

`account`, `opportunity`, `contact`, `activity`, `user`, and `mcp` each have a `src/tracing.ts` that is imported as the *very first* line of `src/index.ts` (before `express`, `pg`, etc.) — auto-instrumentation (`@opentelemetry/auto-instrumentations-node`, which covers `http`/`express`/`pg` in one package) patches `require()` internals, so it must register before the modules it instruments are first required. Since these services compile to CommonJS, `import` order in source matches `require()` execution order, so this ordering guarantee holds without needing a separate `node --require` preload step.

`OTEL_EXPORTER_OTLP_ENDPOINT` gates everything: `tracing.ts` skips `NodeSDK.start()` entirely when it's unset, so local dev (no Collector running) produces zero tracing-related output — no crashed process, no export-retry log spam. This was verified by starting `account` locally with the endpoint unset (no output) and set to an unreachable `http://localhost:4318` (still no output, even after generating a request and waiting past the batch-export interval).

Each service sends to the same OpenTelemetry Collector (`observability` namespace, already deployed outside this repo — its config isn't part of this codebase) via OTLP/HTTP, **not** OTLP/gRPC despite the Collector's `otlp` receiver listening on both `grpc:4317` and `http:4318`: the Collector's k8s Service only exposes `4318` (`otlp-http`) and `13133` (`health`) — `4317` isn't published, and it's fronted by an ALB (`type: NodePort`), which would need extra target-group configuration to carry gRPC (HTTP/2). Using the already-exposed HTTP port avoids touching the Collector's Service/ALB setup at all. Because of this, the exporter is `@opentelemetry/exporter-trace-otlp-http`, and `tracing.ts` appends `/v1/traces` to `OTEL_EXPORTER_OTLP_ENDPOINT` itself — this package does not auto-append the path the way env-var-only auto-configuration would.

Deliberately excluded from this pass: `auth0logs` and `auth0events` (webhook receivers, not part of the core request-tracing path being instrumented first), and metrics/logs signals (only traces were requested — the Collector config's `metrics` pipeline, e.g. `hostmetrics`/hostmetrics scrapers, is unrelated to what these services emit).

### MCP server (`services/mcp`)

Built with the official `@modelcontextprotocol/sdk` (^1.29.0) + Express — **not** a 3rd-party wrapper. (An earlier version used `fastmcp` ^4.3.2; migrated away after finding two OAuth implementation bugs in `fastmcp`'s dependency `mcp-proxy` — see `docs/known-issues.md`.) Exposes 18 CRM tools (CRUD for accounts, opportunities, contacts, activities + `list_opportunity_history` + `get_current_user`) at `/mcp` (Streamable HTTP transport).

`src/index.ts` instantiates a fresh `McpServer` + `StreamableHTTPServerTransport` **per request** inside `app.all('/mcp', captureAuthFailureHeader, requireBearerAuth({ verifier, resourceMetadataUrl }), async (req, res) => {...})` (`sessionIdGenerator: undefined`, matching the previous `stateless: false` behavior). `requireBearerAuth` (official SDK middleware) validates the Bearer token via `Auth0TokenVerifier` (`src/auth/verifier.ts`, implements `OAuthTokenVerifier`) and populates `req.auth`; each of the 18 tools is registered against that fresh server instance via `registerTool()` (`src/registerTool.ts`), which adapts the project's existing `ToolDef[]` array shape (`{name, description, inputSchema, annotations, execute(args, session)}`) onto the SDK's `server.registerTool(name, {description, inputSchema}, async (args, extra) => ({content: [...]}))` API — `inputSchema` is a raw Zod shape object, not `z.object(...)`.

Auth0's "Auth for MCP" feature only requires the **Protected Resource Metadata** endpoint (RFC 9728) to be served by the MCP server itself:
- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` — both serve the same manually-constructed `protectedResourceMetadata` object in `src/index.ts` (the second path is `getOAuthProtectedResourceMetadataUrl()`'s RFC 9728-correct path, which is also the value passed to `requireBearerAuth`'s `resourceMetadataUrl` option so 401 responses advertise it).

**`scopes_supported` deliberately excludes `offline_access`**: per the MCP spec's (2026-07-28) new [Refresh Tokens](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#refresh-tokens) section, "MCP Servers (Protected Resources) SHOULD NOT include `offline_access` in `WWW-Authenticate` scope or Protected Resource Metadata `scopes_supported`, as refresh tokens are not a resource requirement" — `offline_access` is a protocol-level flag requesting a refresh token, not a scope needed to access any tool/resource. This doesn't stop a client from requesting/receiving `offline_access` (Auth0 grants it based on the actual `/authorize` request, not on what's advertised here) — `getOboToken()` in `src/oboToken.ts` still filters it out of the token's actual granted scopes before the OBO exchange (see below), since Auth0 rejects it there regardless of whether it was advertised.

**`/.well-known/oauth-authorization-server` is deliberately NOT served on the MCP server's own domain.** Tracing `mcp-remote`'s actual discovery code confirmed it always fetches Authorization Server metadata directly from `protectedResource.authorization_servers[0]` (Auth0's own domain), never from the MCP server's domain — so mirroring/proxying AS metadata locally (as the previous fastmcp-based config did, including a `client_id_metadata_document_supported: true` flag and an audience-embedded `authorizationEndpoint`) has no effect on that client's discovery flow. CIMD/DCR support is a property of the Auth0 tenant, reflected automatically in Auth0's own AS metadata — no MCP-server-side advertisement needed. See `docs/known-issues.md` for the one open item this simplification leaves unverified (the audience-embedding workaround for opaque-vs-JWT tokens).

**Two distinct Auth0 audiences**: the MCP server plays a dual role per [Auth0's Auth for MCP architecture](https://auth0.com/ai/docs/mcp/get-started/call-your-apis-on-users-behalf) — a *resource server* when receiving requests from the MCP client, and a *client* when calling downstream APIs via OBO. Each role has its own Auth0 API registration and audience, and they must NOT be the same env var:
- `AUTH0_AUDIENCE` — the MCP server's own audience. Per MCP spec (RFC 8707), this **must equal the MCP server's canonical URI** (e.g. `http://localhost:3006/mcp`), because mcp-remote sends this exact value as the `resource` parameter and compares it against `protectedResource.resource` (RFC 9728). `ApiClient` in `src/auth/verifier.ts` uses this to validate the `aud` claim of tokens received from the MCP client.
- `API_AUDIENCE` — the downstream microservices' audience (e.g. `https://api.nexuscrm.com`), registered as a *separate* Auth0 API. Used only as the target `audience` in `getOboToken()` (`src/oboToken.ts`) for the OBO exchange — never for validating incoming tokens.

**RFC 9728 `resource` field**: `protectedResource.resource` must be the MCP server's own URL (e.g. `` `${config.mcpServerUrl}/mcp` `` = `http://localhost:3006/mcp`) — the same value as `AUTH0_AUDIENCE` by design (see above). mcp-remote v0.1.38 validates this and rejects mismatches.

**mcp-remote does not add an `audience=` parameter to `/authorize` requests**, which previously caused Auth0 to issue an opaque token instead of a JWT; the fastmcp-era workaround (embedding `?audience=` into a locally-mirrored `authorizationEndpoint`) never actually took effect per the discovery-flow finding above, so removing it during the SDK migration should be a no-op — but this needs re-verification against a real `mcp-remote` connection (see `docs/known-issues.md`). If opaque tokens reappear, look at Auth0-side API/tenant default-audience settings rather than reintroducing a local AS-metadata mirror.

**CIMD (Client ID Metadata Document)** support is a capability of the Auth0 tenant (Settings → Advanced → Client ID Metadata Document Registration), not something the MCP server needs to advertise — Auth0's own AS metadata reflects it automatically. DCR remains available as Auth0's fallback for clients that don't support CIMD. CIMD is preferred over DCR because Auth0 DCR has no client expiry or auto-deletion, causing unbounded Application object growth in production.

**CIMD + Auth0 Organizations**: CIMD/DCR-registered clients become 3rd-party apps in Auth0, which **cannot** be assigned to an Organization via the Application's own **Organizations tab** (that tab is 1st-party-only) — this is the mistake an earlier version of this note made, concluding org-scoped auth was impossible for such clients. It isn't: Auth0 has a *separate*, supported mechanism for exactly this case — [Enable Third-Party Application Access for an Organization](https://auth0.com/docs/manage-users/organizations/configure-organizations/enable-third-party-application-access). Required, on the **Organization** side (not the Application): (1) `third_party_client_access: allow` (Dashboard: Organizations → the org → Overview → "Allow Third-Party Application Access"), (2) the login Connection promoted to **domain-level** and enabled for that Organization, (3) the Organization's Login Flow set to **"Prompt for Credentials"** (or "Prompt for Organization") — since a 3rd-party client can't be relied on to send an `organization` parameter itself. With all three set, `org_id` **is** included in tokens issued to 3rd-party clients, including ones registered via CIMD's "Import from URL" (Management API `/api/v2/clients/cimd/register`, or Dashboard "Create Application → Import from URL" — see the mcp README's step 3). This is confirmed working in this project: a CIMD client was manually pre-registered this way, with `third_party_client_access` + "Prompt for Credentials" configured, and it authenticates successfully end-to-end via Claude's Connector UI against the Kubernetes-deployed endpoint — proving CIMD + Organizations is fully compatible when the Organization (not the Application) is configured correctly. Manual/eager CIMD pre-registration (vs. lazy fetch-on-first-`/authorize`) is spec-compliant either way — the MCP spec's [Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration#client-id-metadata-documents) page only constrains client-facing behavior (document shape, `client_id` = URL, redirect_uri validation), not *when* the AS fetches/caches the document.

**mcp-remote never attempts CIMD**: separately from the above, mcp-remote v0.1.38 does not implement `clientMetadataUrl`, so it always falls through to DCR regardless of Auth0 tenant support. Workaround for org-scoped access from `mcp-remote`: pre-register a Native app in Auth0, assign it to the Organization (1st-party path, not CIMD), and use `--static-oauth-client-info '{"client_id":"<ID>"}'` to bypass both DCR and CIMD. This is a distinct mechanism from the CIMD-via-Organization-settings approach above — `--static-oauth-client-info` sidesteps client registration entirely, whereas the CIMD approach registers a real (3rd-party) client and grants it Organization access explicitly.

**Claude Desktop callback port**: mcp-remote computes the callback port deterministically as `3335 + parseInt(md5(serverUrl).substring(0,4), 16) % 45816`. For `http://localhost:3006/mcp` the port is **12739** — register `http://localhost:12739/oauth/callback` as the Allowed Callback URL in the Auth0 Native app.

**Claude's Connector UI runs from Anthropic's cloud, not the user's machine**: unlike the `mcpServers` + `mcp-remote` config above (a local Node process that can reach `localhost`), Claude Desktop/claude.ai's built-in "Connector" feature has Anthropic's own backend broker call the MCP server directly — it can only reach a **publicly deployed** endpoint, never `localhost`, and only from Anthropic's fixed outbound range (`160.79.104.0/21`, per [Claude Platform IP addresses](https://platform.claude.com/docs/en/api/ip-addresses)). Symptom when this range isn't allowed through: Claude shows a generic "Couldn't reach" error with an `ofid_...` reference, while **both Auth0 and the mcp pod show zero log entries** — the request never left Anthropic's edge, so there's nothing to debug server-side. `nexuscrm-alb-secret`'s `security-groups` key is a personal-IP allowlist (VPN/home CIDRs only), which silently drops Anthropic's traffic. Fix: `helm/charts/nexuscrm/templates/ingress.yaml` supports a per-service `ingress.extraSecurityGroupsSecretKey` (set only on `mcp`, not `frontend`) that appends one more security group — referencing a **separate** Auth0-unrelated secret key (`nexuscrm-alb-secret`'s `mcp-extra-security-groups`) containing a SG that allows `160.79.104.0/21` on 443 — to the ALB's `security-groups` annotation. This keeps `frontend`'s personal-IP allowlist untouched while letting only `mcp` accept Claude's Connector traffic.

**OBO exchange rejects `offline_access`**: the MCP client's token legitimately carries `offline_access` in `scopes` (so mcp-remote/the Connector can refresh its own session), but forwarding that scope into `apiClient.getTokenOnBehalfOf()` fails with `failed_on_behalf_of_token_exchange: "Refresh tokens (offline_access scope) are not supported for on-behalf-of token exchange"` — an Auth0-side rejection, so it shows up as an Auth0 log entry (unlike the connectivity issue above). `getOboToken()` in `src/oboToken.ts` filters `offline_access` out of `session.scopes` before requesting the downstream token.

Token validation: `@auth0/auth0-api-js` (`ApiClient.verifyAccessToken`). `Auth0TokenVerifier.verifyAccessToken()` in `src/auth/verifier.ts` (implements the SDK's `OAuthTokenVerifier`) extracts `{ token, sub, orgId, scopes }` from the verified token and returns it as `MCPAuthInfo` (extends the SDK's `AuthInfo` with `sub`/`orgId`, since the standard type has no org concept); `requireBearerAuth` stores it on `req.auth`, and `index.ts` copies it into an `MCPSession` (`src/session.ts`) passed to every tool's `execute()`. Any thrown error is wrapped as `InvalidTokenError` (from `@modelcontextprotocol/sdk/server/auth/errors.js`) — required for `requireBearerAuth` to produce a 401 + `WWW-Authenticate` response instead of a 500.

**OBO (On-Behalf-Of) token exchange**: Per [MCP spec §Access Token Privilege Restriction](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations#access-token-privilege-restriction), the MCP server MUST NOT pass through the token it received from the MCP client to downstream APIs. Instead, `callService()` in `src/serviceClient.ts` calls `getOboToken(session)` from `src/oboToken.ts`, which uses `apiClient.getTokenOnBehalfOf()` (`@auth0/auth0-api-js`) to exchange the incoming token for a new token targeting `API_AUDIENCE` (the microservices' Auth0 API, distinct from the MCP server's own `AUTH0_AUDIENCE` — see "Two distinct Auth0 audiences" above). The exchanged token carries the same `sub` and `org_id` claims, so downstream microservices see the correct user and org context.

**OBO token caching**: `src/oboToken.ts` uses `lru-cache` (max 1000 entries) keyed by `sub:orgId`. TTL is derived from `result.expiresAt - 30s` to avoid using an expired token. Auth0 recommends caching exchanged tokens for their full lifetime rather than requesting a new one per API call. The `ApiClient` instance in `src/auth/verifier.ts` is exported and shared between `Auth0TokenVerifier.verifyAccessToken()` (token verification) and `getTokenOnBehalfOf()` (token exchange).

**OBO requires confidential client**: `apiClient` must be initialized with `clientId` + `clientSecret` (`AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET`). Use the same pre-registered Native app (already assigned to the Organization) that is used as the MCP client — or register a separate Machine-to-Machine app with the correct audience.

**Token debug viewer (demo/dev only)**: `getOboToken()` in `src/oboToken.ts` calls `recordExchange(toolName, session.token, accessToken, fromCache)` (`src/debug/store.ts`) on every OBO exchange — cache hit or miss. `src/index.ts` exposes this history at `GET /debug/tokens` / `DELETE /debug/tokens/:id` on the Express app; both routes are **unauthenticated** (raw JWTs are exposed) and gated behind `ENABLE_TOKEN_DEBUG !== 'false'`. Because of this, `callService()` in `src/serviceClient.ts` and every tool's `execute()` pass a `toolName` string literal (e.g. `'list_accounts'`) purely to label these records — it has no effect on the OBO exchange itself. The frontend surfaces this at `/debug/mcp-token` (page path; the BFF API route itself stays at `/api/mcp-debug`, see `frontend/src/app/api/mcp-debug/route.ts`) via a proxy that checks the caller has an active session, then fetches `${MCP_SERVICE_URL}/debug/tokens` directly (no Bearer token, since the debug endpoint itself doesn't require one). The same pattern backs `/debug/auth-failures`: a small Express middleware in `src/index.ts` (`captureAuthFailureHeader`) wraps `res.setHeader` to capture the exact `WWW-Authenticate` value `requireBearerAuth` sets on 401s, and hands it to `recordAuthFailure()` (`src/debug/authFailures.ts`) — this reads the real header value rather than reconstructing it, so it can't drift from actual server behavior.

**Owner-matching pattern (`get_current_user`)**: `src/tools/users.ts` exposes `get_current_user`, which resolves the caller's own user record via `session.sub` → `GET /users/:sub` on the `users` service (requires the `read:users` scope, already in `scopes_supported`). It takes no parameters. This lets an AI agent answer requests like "私の案件一覧を取得して" (my opportunities) or "私の担当顧客を取得して" (my accounts) without a dedicated per-entity filter tool: the agent calls `get_current_user` first to get the user ID, then compares it against the `owner_id` field in the results of list tools. Both `opportunities` and `accounts` have `owner_id`. This keeps the pattern reusable across any future entity that gains an owner concept, rather than baking owner-filtering into each list tool individually.

Tool files in `src/tools/*.ts` export `ToolDef[]` (`src/registerTool.ts`) — `{name, description, inputSchema, annotations?, execute(args, session)}` — kept intentionally close to the pre-migration `Tool<MCPSession, any>[]` shape so only `index.ts` and `registerTool.ts` needed to change when adapting to the official SDK. `registerTool()` adapts each entry onto `McpServer.registerTool()` per-request, wrapping thrown errors into `{content, isError: true}`. `args` stays `any` (a single shared type can't express 18 different Zod shapes); `session: MCPSession` stays properly typed.

**CIMD visualization (`azp` claim + `auth0logs`)**: `decodeJwt()` in `src/debug/jwt.ts` already returns the full JWT payload, so no MCP-server change was needed to expose the `azp` claim — the frontend's `/debug/mcp-token` page (`TokenPanel` with `showAzp`) reads it directly from the existing `mcpToken.payload` data and classifies it (URL → CIMD, `tpc_` prefix → DCR/3rd-party). To also show Auth0's *own* authentication log for CIMD clients in real time, a **separate microservice** `services/auth0logs` (port 3007) receives Auth0 Log Streams (Custom Webhook) pushes at `POST /webhooks/auth0-logs` — deliberately not added to `services/mcp` itself, since the MCP server's role should stay scoped to being an MCP resource server/OBO client, not a generic webhook receiver. This is surfaced on its **own page**, `/debug/mcp-discovery` (not `/debug/mcp-token` — a deliberately separate screen, since CIMD authentication happens at connection time, decoupled from any particular tool call shown in the token viewer), via `frontend/src/app/api/auth0-logs/route.ts`. The Log Stream is configured (Auth0-side) to only forward `type: "s"` (Success Login) events; `services/auth0logs`'s webhook handler additionally filters to only `recordEvent()` entries whose `requested_client_id` is URL-shaped (i.e. actually CIMD, not just any login) — both checks happen before storage, so the ring buffer never fills with irrelevant logins.

### `services/auth0logs` and the ALB security-group override

`auth0logs` carries **two** pod labels in `values.yaml` — `role: microservices` and `public: true` — matching **two** SecurityGroupPolicy resources at once (`microservices-sg-policy` and a new `public-sg-policy`). `role: microservices` reuses the existing SG that already allows inbound from `frontend`/`mcp` pods on port 3000, so the frontend's BFF can call `auth0logs` in-cluster. `public: true` is a new, reusable label matched by `public-sg-policy`, whose SG allows inbound from the project's shared "load balancer" SG (`kikeyama-lb-common-sg`) — needed because, unlike the other `role: microservices` members, `auth0logs` also receives traffic from its own public ALB (Auth0's Log Stream webhook). AWS's docs don't document what happens when a pod matches multiple SecurityGroupPolicy objects, but empirically in this project **the security groups from all matching policies are additive** — both apply simultaneously. `public: true` is designed to be reused by any future service that needs ALB inbound at the pod level, without needing a bespoke SecurityGroupPolicy each time. Separately, the **ALB-level** SG (for the public Ingress itself, not the pod) also had to be created new, since Auth0 Log Streams push from Auth0's own published outbound IP ranges (`https://cdn.auth0.com/ip-ranges.json`, per tenant region) — not from Anthropic's range, and not from personal IPs.

This is why `helm/charts/nexuscrm/templates/ingress.yaml` has *two* different security-group knobs, and they are not interchangeable:
- `ingress.extraSecurityGroupsSecretKey` (used by `mcp`) — **appends** one more SG to the shared personal-IP allowlist (`nexuscrm-alb-secret`'s `security-groups`). Right fit when the service still needs personal-IP access *plus* one more trusted source (e.g. Claude's Connector).
- `ingress.securityGroupsSecretKey` (used by `auth0logs`) — **replaces** the shared base entirely. Right fit when personal-IP access is irrelevant and only the new trusted source (Auth0's ranges) should ever reach this ALB.

Using the wrong knob for `auth0logs` (i.e. `extraSecurityGroupsSecretKey`) would have left the personal-IP allowlist mixed into an endpoint that only Auth0's servers should ever call.

The webhook itself is defense-in-depth, not just network-restricted: `POST /webhooks/auth0-logs` also checks the `Authorization` header against `LOG_STREAM_TOKEN` (set as the Log Stream's "Authorization Token" in the Auth0 dashboard) — the IP-range SG narrows *who can reach the ALB at all*, the header check narrows *whether that specific request is accepted*, independent of the network layer.

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

### Auth0 Event Streams によるユーザー同期 (`services/auth0events`)

The login-time sync above (`layout.tsx`) only updates a user's row when *that user* logs in. It can't react to changes made outside a login — e.g. an external IdP (Okta) provisioning a new user into Auth0 via SCIM, or removing them from an Organization — since nothing calls the frontend in that case. `services/auth0events` closes this gap: it receives [Auth0 Event Streams](https://auth0.com/docs/customize/events/create-an-event-stream) (Webhook delivery, `POST /webhooks/auth0-events`, `Authorization` header checked against `EVENT_STREAM_TOKEN` — same shared-secret pattern as `services/auth0logs`) and mirrors the change into the `user` service's existing `/users` API. Like `auth0logs`, it never touches the database directly — all writes go through `services/user`.

**Five events are subscribed**, and confirmed against real event payloads from a SCIM-provisioned tenant:
- `user.created` / `user.updated` — `data.object` is the Auth0 user object (`user_id`, `name`, `given_name`, `family_name`, `email`, `picture`, and — only on `user.updated` — `blocked`; **`email_verified` is never included**, so a naive full-overwrite PATCH would silently reset it to `false`. `presentProfileFields()` in `src/eventHandlers.ts` only includes keys that are actually present in the event, merged onto the existing row's values, to avoid this).
- `user.deleted` — same shape, but only `user_id` is needed; the row is never hard-deleted (see below).
- `organization.member.added` / `organization.member.deleted` — a *different* event family for Organization membership changes, confirmed to carry **no profile fields at all**: `data.object` is `{ organization: { id }, user: { user_id } }`.

**Why Management API is deliberately not used anywhere in this flow**: `organization.member.added` alone can't create a fully-populated row (no profile data in the payload), and the obvious fix — call Auth0's Management API `GET /api/v2/users/{user_id}` to backfill — was considered and rejected in favor of also subscribing to `user.created`, which (unlike the membership event) *does* carry the full profile. This avoids provisioning a second Management API grant/audience for the sync M2M app and avoids an extra external call per new user.

**The `user.created` → `organization.member.added` ordering problem, and how `UNASSIGNED_ORG_ID` solves it**: `users.org_id` is `NOT NULL` and event delivery order/at-least-once guarantees aren't documented by Auth0, so `user.created` (profile known, org not yet known) and `organization.member.added` (org known, profile not known) can arrive in either order, possibly duplicated. `services/user/src/constants.ts` defines `UNASSIGNED_ORG_ID = '__unassigned__'` — a sentinel that can never collide with a real Auth0 Organization ID (`org_...`). The flow:
- `user.created` → `POST /users/provisional` (`services/user/src/routes/users.ts`, mounted as its own `usersProvisionalRouter` at `/users/provisional` in `index.ts`, registered *before* `/users` so it isn't shadowed by `usersRouter`'s `/:id` routes) — upserts a row with `org_id = UNASSIGNED_ORG_ID` via `INSERT ... ON CONFLICT (id) DO UPDATE SET <profile columns only>`. `org_id` is deliberately excluded from the `DO UPDATE SET` list, so a late-arriving/duplicate `user.created` can never downgrade a row that's already been assigned a real org.
- `organization.member.added` → `PATCH /users/:id/org` — `UPDATE users SET org_id = $1 WHERE id = $2 AND org_id = UNASSIGNED_ORG_ID`. The `WHERE org_id = UNASSIGNED_ORG_ID` guard makes this a one-way, one-time transition: it 404s both on a genuinely-missing row and on a row that's already been assigned (so a duplicate delivery is a harmless no-op). If it 404s, `auth0events` (`src/eventHandlers.ts`) assumes the row is simply missing (`user.created` lost/reordered) and self-heals by calling `createProvisional(userId, {})` (empty profile) then retrying the org assignment — this reuses the same two endpoints rather than adding a third.

**Known, accepted limitation**: because `org_id` lives directly on the `users` row (one row per Auth0 `sub`, no membership table — see "User ID strategy" below), a user can only ever be assigned to one org through this flow. If a user is removed from Org A (`organization.member.deleted` → `blocked = true`, `org_id` left as-is, *not* reset to `UNASSIGNED_ORG_ID`) and later added to Org B, `PATCH /:id/org`'s guard won't match (current `org_id` is Org A's, not the sentinel) and the reassignment is silently skipped — this is treated as out of scope, consistent with the schema's existing single-org-per-user assumption, and would need a real membership table to fix properly.

The same `org_id`-is-never-reset behavior also applies to a rare manual-ops scenario: deleting a user in Auth0 and later re-creating a *different* Auth0 user with the same `user_id` (e.g. same external Okta id re-provisioned). `user.created`'s upsert (`POST /users/provisional`) correctly resets `blocked` back to whatever the new event says (it's one of the fields in `presentProfileFields()`/the route's dynamic `profileFields` list — this used to be missed for `blocked` specifically, since it isn't a "profile" field in the usual sense, until it was added), so the row stops being treated as deleted. But `org_id` is left untouched, same as above. If the re-created user is re-added to the *same* org, this is harmless (the stale `org_id` already has the right value, so `PATCH /:id/org`'s 404 — it doesn't match `UNASSIGNED_ORG_ID` — is a no-op that changes nothing). If re-added to a *different* org, it silently fails to reassign, same as the Org A → Org B case above.

**Why `organization.member.added`/`deleted` use a normal org-scoped M2M token, but `user.updated`/`deleted` need a new auth exception**: `organization.member.added`/`deleted` payloads include `organization.id`, so `auth0events` can request an M2M token scoped to that exact org (`client_credentials` with `organization=<id>` — same mechanism `services/mcp` doesn't use but Auth0 supports natively; token caching in `src/tokenClient.ts` mirrors `services/mcp/src/oboToken.ts`'s `lru-cache` pattern, keyed by org id) and call the *existing*, unmodified `GET`/`PATCH /users/:id` — the normal `requireOrg` + `WHERE org_id = $2` tenant-isolation filter (present on every resource table in this project, not just `users`) works exactly as it does for a real end-user token. But `user.updated`/`user.deleted` payloads carry no org context at all (a `user_id` is not itself scoped to an org in Auth0 — `org_id` only exists as a token claim), so there's no org to request a scoped token for — a genuine chicken-and-egg problem, since asking "which org is this user in" is exactly what `GET /users/:id` would answer, but that call itself requires already knowing the org. Rather than caching a `user_id → org_id` mapping in `auth0events` (rejected: an in-memory cache is lost on pod restart between `user.created`/`organization.member.added` and a later `user.updated`, and a persisted cache would just be a worse-normalized duplicate of `users.org_id` itself), `services/user/src/middleware/auth.ts` adds `isTrustedSyncClient(req)` (checks `gty === 'client-credentials'` + `sub` against `config.trustedSyncClientId`, itself `<AUTH0_SYNC_CLIENT_ID>@clients` — client-credentials token `sub`/`azp` always has this `@clients` suffix) and `requireOrgOrTrustedSyncClient` (passes if `isTrustedSyncClient`, otherwise defers to the ordinary `requireOrg`). `GET`/`PATCH /users/:id` use this instead of `requireOrg`, and when `isTrustedSyncClient(req)` is true, drop the `org_id` condition from their `WHERE` clause entirely (`WHERE id = $1` only) — this is a deliberate, narrow exception to this project's usual tenant-isolation guarantee, scoped to exactly these two routes and only reachable with a token for a client ID nothing else in the system is issued. `PATCH /:id` also reuses `isTrustedSyncClient` for its pre-existing self-only check (`req.params.id !== userId`), since a client-credentials token's own `sub` is the M2M client's identity, not the target user's. `GET /`, `POST /`, `PATCH /:id/org`, and `DELETE /:id` are untouched and still require a normal org-scoped token via `requireOrg`.

**Why the target user id is a request-body field on `POST /users/provisional`, but not on the other routes**: every other write route derives the row's `id` from the caller's own token (`getTokenClaims(req).userId`, i.e. `sub`) — correct for an end-user token, where the caller and the row being written are the same person. An M2M sync token's `sub` is the *client's* identity, never the target user's, so `/users/provisional` is the one route that must accept `id` explicitly in the body; it's safe only because the route is already gated by `requireTrustedSyncClient`.

**Rows are never hard-deleted by this sync flow.** `user.deleted` and `organization.member.deleted` both just set `blocked = true` (new column, `database/init.sql`) via `PATCH /:id`, preserving the existing row (and thus the `owner_id`/`created_by` name resolution on `accounts`/`opportunities`/`activities`). `blocked` is purely informational in this app today — `checkJwt` validates the Auth0-issued JWT itself, so if Auth0 actually blocks the account no token is issued in the first place; nothing currently reads this column to gate access. `organization.member.deleted`'s `blocked` is a deliberate reuse of Auth0's tenant-wide "blocked" semantics to mean "no longer valid for *this* org" — an approximation that holds only because of the single-org-per-user assumption above.

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
