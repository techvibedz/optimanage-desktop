# Plan 004: Design spike — remove the embedded DATABASE_URL from the installer

> **Executor instructions**: This is a **design/spike** plan. Its deliverable is
> a decision document, **not** a code change. Do NOT modify application source,
> the schema, or build config. Produce `plans/004-OUTPUT-db-access-design.md`
> with the analysis and a recommendation, then update the status row in
> `plans/README.md` and STOP for human review. Implementation is a separate
> plan that this spike will define.
>
> **Drift check (run first)**: `git diff --stat be6919f..HEAD -- package.json electron/main.ts prisma/schema.prisma`
> If these changed since this plan was written, re-read them before analyzing.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH (architectural — touches every data path; that's why this is a spike first)
- **Depends on**: none (but implementation should follow 001 so the data layer is test-covered)
- **Category**: security
- **Planned at**: commit `be6919f`, 2026-06-25

## Why this matters

Every installed copy of this app ships a **direct PostgreSQL connection string**
inside its own resources, and connects to a **shared, multi-tenant** database
with it. That means anyone who installs the app (it is distributed to opticians
via GitHub Releases) holds full read/write credentials to **every** optician's
data — customers, prescriptions (health data), payments, the lot. There is no
server-side trust boundary: the desktop app *is* a trusted DB client. Plan 003
stops casual escalation inside the running app, but it cannot help here — the
credential is on disk and the DB is reachable from anywhere. This spike does not
fix the exposure; it produces the **decision** on how to, with enough analysis
that the chosen path can be turned into an implementation plan with confidence.
Getting this wrong (e.g. a migration that breaks offline mode) would be worse
than the status quo, which is exactly why it is a spike, not a direct change.

## Current state (the facts to anchor the analysis — verify each before writing)

- The connection string is copied into the packaged app as `extraResources`:
  ```jsonc
  // package.json  (build.extraResources)
  { "from": ".env.production", "to": ".env.production" }
  ```
  `.env.production` contains `DATABASE_URL` and `DIRECT_DATABASE_URL`
  (credential type: PostgreSQL/Supabase direct connection URI — **do not copy the
  values into the output doc; reference them as "the DATABASE_URL in
  .env.production" only**).
- At runtime the main process reads that file and sets `process.env`:
  ```ts
  // electron/main.ts:38-49
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env.production')
    : path.join(app.getAppPath(), '.env')
  // ...parses KEY=VALUE lines into process.env
  ```
- Prisma uses it directly; there is no API server in between:
  ```prisma
  // prisma/schema.prisma:5-9
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_DATABASE_URL")
  }
  ```
- The DB is **Supabase** (the MCP server and connection style confirm it), which
  means **Row Level Security (RLS) + a scoped anon/publishable key + PostgREST or
  the supabase-js client** is an available, first-class alternative to a direct
  Postgres connection.
- All data access flows through ~30 `ipcMain.handle(...)` handlers in
  `electron/main.ts`, each with an **online (Prisma)** branch and an **offline
  (SQLite cache + sync queue)** branch. Any redesign must preserve the offline
  branch and the sync model in `electron/syncManager.ts`.
- Multi-tenancy is by `userId` columns and Prisma `where: { userId }` filters —
  there is no DB-enforced isolation today (`prisma/schema.prisma` has `@@index`
  on `userId` but no RLS).

## Deliverable

Create `plans/004-OUTPUT-db-access-design.md` containing:

1. **Threat model & blast radius** (½ page): what an attacker can do today with
   the shipped credential; what data classes are exposed (note prescriptions are
   health data, which may carry legal/regulatory weight in the deployment region —
   the app targets Algeria; flag, don't adjudicate).
2. **Options analysis** — for each option below: how it removes the exposure,
   how it preserves offline mode + the existing sync queue, rough effort, and the
   migration risk. At minimum evaluate:
   - **(O1) Supabase RLS + scoped key.** Replace Prisma-direct with supabase-js
     using the publishable/anon key; enforce per-user isolation with RLS policies
     keyed on the authenticated user; keep auth via Supabase Auth (or a custom JWT
     the policies trust). Note the large rewrite of every handler's online branch
     and the loss of Prisma's query ergonomics.
   - **(O2) Thin backend API.** Stand up a minimal server (the credential lives
     only there) exposing the same operations the IPC handlers need; the desktop
     app calls it with a per-user token and falls back to the SQLite cache when
     offline. Note hosting/ops cost and that the sync queue now POSTs to the API
     instead of Prisma.
   - **(O3) Per-tenant credentials / least privilege.** If a full backend is out
     of reach short-term, scope each install's credential to one tenant
     (separate DB roles/schemas or connection-time role) so a leaked credential
     exposes one shop, not all. Note this is mitigation, not elimination, and how
     it interacts with the shared-sequence order numbering.
3. **Recommendation**: one option, with the reasoning, and an explicit note on
   what it costs offline mode (if anything).
4. **Implementation outline**: the steps a follow-up implementation plan would
   contain for the recommended option, including how each of the ~30 handlers and
   the sync queue would change, and a rollback story.
5. **Interim mitigation** (cheap, do-now): regardless of the long-term choice,
   list quick risk reducers and confirm whether they're already true —
   credential rotation cadence, restricting the DB role's privileges, IP
   allowlisting if the deployment allows it, and ensuring `.env.production` is not
   in source control (note: `.gitignore` already lists `.env.production`).

## Scope

**In scope**: reading the codebase, the Supabase project config (via the
available `supabase` MCP tools — `list_tables`, `get_advisors`, `list_extensions`
to check whether RLS is enabled and what advisors flag), and writing the output
doc.

**Out of scope** (do NOT do in this plan):
- Any change to `package.json`, `.env*`, `prisma/schema.prisma`, or handler code.
- Creating or rotating real credentials. Recommend rotation in the doc; do not
  perform it.
- Enabling/altering RLS policies on the live project. The spike *reads* config;
  it does not mutate it.

## Commands / tools you will need

- `git grep -n "prisma\\." electron/main.ts | wc -l` — count of direct Prisma
  calls to migrate (sizing input for the options).
- Supabase MCP (read-only): `list_tables`, `get_advisors` (security advisors will
  likely already flag missing RLS), `list_extensions`. Use these to ground the
  RLS option in the project's actual state. **Do not** call any mutating Supabase
  tool (`apply_migration`, `execute_sql` with writes, branch/reset tools).

## Done criteria

- [ ] `plans/004-OUTPUT-db-access-design.md` exists with all five deliverable sections
- [ ] The doc names a single recommended option with reasoning and an offline-mode impact note
- [ ] The doc contains an implementation outline concrete enough to become a follow-up plan
- [ ] **No** application source, schema, build config, or `.env*` file was modified (`git status` shows only files under `plans/`)
- [ ] **No** secret values appear anywhere in the doc — credential *locations* and *types* only
- [ ] No mutating Supabase MCP tool was called
- [ ] `plans/README.md` status row for 004 updated, with a one-line pointer to the output doc

## STOP conditions

Stop and report back if:

- The anchoring facts above don't match the live repo (the build no longer bundles
  `.env.production`, or the schema no longer uses a direct Postgres URL) — the
  exposure may already be addressed; report what you found.
- You're tempted to start implementing the migration. Don't — that's a separate
  plan the human approves after reading this spike.
- The Supabase advisors or config reveal something materially changing the threat
  model (e.g. RLS is already enabled) — capture it and still finish the doc.

## Maintenance notes

- This spike's recommended implementation will be large and should land **after**
  plan 001 (tests), so the data-layer rewrite has a safety net.
- Whoever implements the recommendation must preserve: offline create/read via the
  SQLite cache, the sync queue's idempotency guarantees, and the shared
  online/offline order-number sequence (`computeNextOrderNumber`, `main.ts:1166`).
- A reviewer of the output doc should sanity-check that the recommended option
  actually removes the credential from the client, not just obscures it.
