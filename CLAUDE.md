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
| PostgreSQL | 5432 | Single shared DB |

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
