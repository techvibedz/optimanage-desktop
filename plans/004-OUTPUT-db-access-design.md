# 004 — Design spike: remove the embedded DATABASE_URL from the installer

Status: decision document (spike). No application code, schema, or build config was changed to produce this doc.

## Anchor facts (verified against the live repo)

- `package.json` `build.extraResources` bundles `.env.production` into the packaged app (`package.json:55-58`), alongside `.env` (`package.json:51-54`), the Prisma client/runtime (`package.json:29-50`).
- `electron/main.ts:38-49` reads `.env.production` (when `app.isPackaged`, sourced from `process.resourcesPath`) or `.env` otherwise, parses `KEY=VALUE` lines, and writes them into `process.env`. `electron/main.ts:52-53` then constructs `new PrismaClient()` immediately after, with no further gate.
- `prisma/schema.prisma:5-9` — `datasource db { provider = "postgresql", url = env("DATABASE_URL"), directUrl = env("DIRECT_DATABASE_URL") }`. Direct Postgres connection, no API/PostgREST layer.
- `.gitignore:5-8` already lists `.env`, `.env.local`, `.env.production` — confirmed not tracked in git history for this worktree (`git status` clean, no `.env*` files appear in `git ls-files`). This part of the anchor facts is **already true** and needs no action beyond verifying it stays that way.
- `electron/main.ts` contains 110 direct `prisma.*` call sites (`git grep -n "prisma\." electron/main.ts | wc -l`) across 63 `ipcMain.handle(...)` registrations spanning ~13 domains: `auth`, `customers`, `orders` (+`orders:findByOrderNumber`, `orders:latestNumber`), `payments`, `prescriptions`, `frames`, `lensTypes`, `contactLenses`, `expenses`, `settings`, `users`, `dashboard` (+2 sub-channels), `sync` (+3 sub-channels), plus `mobileScanner`, `monitoring`, `updater`, `print`, `ai:scanOrdonnance`, `connectivity`. The plan's "~30" estimate undercounts the raw handle count but is the right order of magnitude for *domain* handlers once you collapse CRUD verbs; treat 63 handlers / 110 call sites as the real sizing number for migration effort.
- `electron/syncManager.ts:314` `processQueue(handlers, persistedIdMap, currentUserId)` is generic: it takes an injected `Record<string, (payload) => Promise<any>>` map keyed by action string (e.g. `customers:create`, `orders:create`, `payments:create`) and has **no Prisma calls of its own** — the actual Prisma access lives in closures built in `main.ts` and passed in. This is a clean seam: replacing what's *inside* those closures does not require touching the queue engine (backoff, quarantine, dead-letter, ID-remapping logic in `syncManager.ts:1-475` stays untouched under any option).
- Multi-tenancy today is `userId` column + `where: { userId }` filters in every Prisma query, enforced only in application code. `prisma/schema.prisma` shows `Customer`, `Prescription`(via Customer), `LensType`, `ContactLens`, `Frame`, `Order`, `Payment`, `Expense` all carry `userId` (nullable on `Payment`/`Setting`). `Order` has `@@unique([orderNumber, userId])` and the next-order-number logic (`electron/main.ts:1149-1167`) queries `prisma.order.findMany({ where: { userId } })` — **order numbering is already scoped per-`userId`, not a single global shared sequence.** This slightly de-risks (but does not eliminate) the O3 sequencing concern below.
- Auth is homegrown: `ipcMain.handle('auth:login', ...)` (`electron/main.ts:1372-1402`) does `prisma.user.findUnique({ where: { email } })` + `bcrypt.compare`. There is no `supabase.auth.*` call anywhere in the repo (`git grep` for `createClient(` / `supabase-js` usage across `electron/` and `src/` returns nothing) even though `@supabase/supabase-js` is a listed dependency (`package.json:96`) — it is currently unused. A log line referencing "Supabase credentials" (`electron/main.ts:1106`) is misleading; it means "the row in the User table hosted on Supabase Postgres," not "Supabase Auth." **Adopting Supabase Auth for O1 is a from-scratch integration, not a wire-up of something half-built.**

### Live Supabase state (read-only MCP tools — `list_tables`, `get_advisors`; no mutating calls made)

- `list_tables` confirms **RLS is disabled on all 14 public tables**, including `User`, `Customer`, `Prescription`, `Order`, `Payment`, `Expense`, `ContactLens`, `Frame`, `LensType`, `LensAddon`, `OrderFrame`, `Setting`, `_LensAddonToOrder`, `_prisma_migrations`.
- `get_advisors(type: security)` independently flags this as a **critical** advisory: `rls_disabled` — "These tables are fully exposed to the anon and authenticated roles used by Supabase client libraries — anyone with the anon key can read or modify every row." This is the live, current-state confirmation of the plan's claim that there is no DB-enforced isolation today. (Today's exposure is via the direct Postgres role in `DATABASE_URL`, not the anon key — but the advisory matters directly for Option O1, since switching to supabase-js without RLS policies would make the exposure *worse*, not better, until policies are written.)
- Row counts from `list_tables` (live production data, not test data): `Customer` 2,254 rows, `Prescription` 2,170 rows, `Order` 2,294 rows, `Payment` 2,710 rows, `Expense` 93 rows, `User` 5 rows, `Frame` 64 rows. This is the real blast radius, not a hypothetical.
- A secondary, unrelated advisory: Postgres version has pending security patches (`vulnerable_postgres_version`, WARN). Out of scope for this spike but worth a follow-up ticket.
- No remediation SQL was applied. `get_advisors` returned the `ENABLE ROW LEVEL SECURITY` statements for all 14 tables as informational output only; this document reproduces that fact but did not execute it.

No anchor fact mismatched the plan. No STOP condition was triggered — proceeding with full analysis.

---

## 1. Threat model & blast radius

The packaged installer (distributed publicly via GitHub Releases — `package.json:70-74`, `repo: techvibedz/optimanage-desktop`) ships a direct PostgreSQL connection string with, at minimum, full read/write on the `public` schema of a single shared database. Every optician who installs the app receives the **same credential**. There is no per-install scoping today (confirmed: no RLS, no per-tenant DB role, single `DATABASE_URL`/`DIRECT_DATABASE_URL` pair baked into one `.env.production`).

What an attacker who extracts the credential (trivial: unzip the ASAR/resources, `app.asar.unpacked` or `extraResources` is plaintext on disk, or just run `strings` on the installed `.env.production`) can do:

- **Read every optician's data**: all customers (2,254 rows live), all prescriptions (2,170 rows — health/medical data), all orders, all payments (2,710 rows — financial data), across every tenant, not just the attacker's own shop.
- **Write/delete arbitrarily**: forge orders, alter payment records, delete competitors' customer lists, drop tables (the role's exact grants weren't enumerable read-only here, but nothing in the schema or app code suggests a restricted role — Prisma's `directUrl` usage for migrations implies the role likely has DDL rights too).
- **Pivot via the `User` table**: read all bcrypt hashes and email addresses for every account on the platform, enabling offline cracking attempts against reused passwords.
- **No detection path**: no RLS, no audit log surfaced in this codebase, no per-tenant rate limiting. A bulk exfiltration query looks identical to a legitimate app session at the protocol level.

Data classification: `Prescription` rows are health data. The product targets opticians in Algeria. This raises the stakes beyond a generic data breach — health-data handling may carry legal/regulatory weight under Algerian data-protection rules and/or telemedicine-adjacent regulation (not adjudicated here; flagged for legal review, not a technical conclusion this doc can reach). Payment data is financial PII with its own regulatory exposure (cardholder/bank data handling, even if no raw card numbers are stored — the schema wasn't checked for that level of detail and should be in a follow-up).

Net: this is a full multi-tenant breach waiting on one person downloading the app and reading a text file. It is not a theoretical risk — RLS being off was independently confirmed by Supabase's own security advisor as a "critical" finding live, on the production project.

---

## 2. Options analysis

### O1 — Supabase RLS + scoped key (supabase-js, anon/publishable key, RLS policies)

**How it removes the exposure**: the desktop app no longer holds a credential with raw table access. It holds a long-lived publishable/anon key (safe to ship — it's designed to be public) plus a per-user session token obtained via login. Every query goes through PostgREST, which evaluates RLS policies server-side using `auth.uid()` (Supabase Auth) or a custom JWT claim. A leaked anon key alone gets an attacker nothing without a valid session; a leaked session token only exposes that one user's RLS-scoped rows.

**Offline mode / sync queue impact**: this is the costly part. supabase-js's PostgREST client is a thin HTTP wrapper — it does not replace Prisma's query builder, relations, or transactions. Every one of the 110 Prisma call sites across the ~63 handlers needs hand-rewriting to `supabase.from(...).select(...)` / `.insert(...)` style calls, including everywhere Prisma's `include`/`select`-with-relations or `@@unique` compound-key lookups are used (e.g. the `orderNumber_userId` compound lookup at `electron/main.ts:551`). The *online* branch of every handler changes; the *offline* SQLite branch (`electron/localCache.ts`, 973 lines) and the sync queue engine (`electron/syncManager.ts`) do not need structural changes — `processQueue`'s handler-injection seam means you swap what each handler's online half does, not the queue mechanics. But the migration surface inside `main.ts` is the single largest piece of work in any option here.

**Auth**: must be built from scratch — there is no existing Supabase Auth integration (verified: zero `createClient`/`supabase.auth` calls in the repo). Either adopt Supabase Auth (replaces the current bcrypt+`User`-table login, which itself needs a user-migration step to move existing accounts/password hashes) or mint custom JWTs server-side and verify them via RLS's JWT claims — the latter needs *some* server component, partially collapsing this into O2.

**Effort**: high. Touches every handler, requires a full RLS policy set per table (14 tables) written and tested before cutover (cutting over to supabase-js before RLS policies exist would, per the live advisory, make exposure *worse* since the anon key with no RLS is fully open), and a real auth migration.

**Migration risk**: high. Policy bugs are easy to get subtly wrong (e.g. a policy that's too permissive defeats the entire point silently; one that's too strict breaks a handler in production). No staging tenant separation exists today to test against safely without `create_branch` (a Supabase branch was available as an MCP tool but was correctly NOT used here per scope — would be the right tool in the implementation phase).

### O2 — Thin backend API holding the credential

**How it removes the exposure**: a minimal server (could be a single Node/Express or Fastify service, or Supabase Edge Functions) is the only thing that ever sees `DATABASE_URL`. The desktop app authenticates (username/password, same as today) against the API and gets a per-user token (JWT or session). All "online" reads/writes go through HTTP endpoints that the API implements using the *existing* Prisma schema and (largely) the existing Prisma query logic — meaning a meaningful fraction of the current handler bodies can be **lifted nearly as-is** into API route handlers, then the desktop-side handler is rewritten to call `fetch(apiUrl, ...)` instead of `prisma.*` directly. Sync queue: `processQueue`'s injected handlers swap their Prisma calls for `fetch` calls to the API; same seam as O1, smaller rewrite per handler because the request/response shape can mirror what Prisma already returns.

**Offline mode**: unaffected in shape — the offline branch stays exactly as-is (SQLite cache, same queue, same quarantine/backoff logic). The online branch becomes "call API" instead of "call Postgres directly," which is a smaller conceptual jump than rewriting to PostgREST query syntax, and Prisma's ergonomics (relations, transactions, the existing 110 call sites' shapes) are preserved server-side, not lost.

**Effort**: medium. Still touches every handler's online branch (has to, no matter which option), but each rewrite is "swap `prisma.x.y()` for `apiClient.x.y()`" rather than relearning PostgREST semantics, and the server-side logic can be near-copy-paste from the current handler bodies.

**Migration risk**: medium. New moving part: a server to host, deploy, monitor, and keep available (this app's whole offline-first design exists *because* opticians' internet is unreliable — an unreachable API must degrade to the existing offline path, which the code already has hooks for via `isOnline()`/`markDbUnreachable()` in `syncManager.ts`/`main.ts`). Hosting/ops cost is new and ongoing (compute, TLS cert, uptime monitoring, who's on call) — this is the main argument against O2 for a small team, balanced against it being the most "boring," well-understood, debuggable shape.

### O3 — Per-tenant credentials / least privilege (separate DB roles or schemas per shop)

**How it reduces (not removes) the exposure**: each installed copy gets a distinct Postgres role scoped (via `GRANT`/schema-level permissions, or row-security keyed to the role) to one tenant's rows. A leaked credential exposes one optician's shop, not all 2,254 customers across the platform.

**Offline mode / sync queue**: no change to the offline branch or queue *mechanics*. But provisioning becomes a real operational burden: every new optician install needs its own role + credential generated and distributed (today it's one static file baked at build time for every install — this breaks that "one build artifact for everyone" model and requires either per-customer build variants or a provisioning step at first run, which itself needs *some* trusted channel to deliver the per-tenant credential — i.e., you end up needing a small backend anyway to safely hand out the per-tenant secret, which makes this option not stand fully on its own).

**Order-number sequencing interaction**: lower risk than the plan's caution suggested — verified `Order` is already `@@unique([orderNumber, userId])`-scoped and the next-number query is already `where: { userId }`, not a single shared global sequence. So per-tenant schema/role separation doesn't break order numbering logic. The bigger snag is that "tenant" and "`userId`" aren't proven to be the same boundary today — multiple `User` rows could belong to the same shop (e.g. owner + assistant accounts), and the schema has no `Shop`/`Tenant` table; defining the tenant boundary is undone modeling work this option would need first.

**Effort**: medium-low for the DB-side change (per-role grants are cheap to write), but high hidden cost in build/release tooling (per-tenant artifacts or a provisioning flow) and zero reduction in *individual* breach severity — one shop's full health/financial data is still fully exposed to whoever holds that one credential.

**Verdict on O3**: this is a mitigation that shrinks blast radius, not a fix for the underlying problem (still a bare DB credential sitting in a shippable file, just scoped smaller). Worth doing as a stopgap (see Section 5) but not a destination.

---

## 3. Recommendation

**Recommend O2 — thin backend API.**

Reasoning:
- It is the only option that fully removes the credential from every installed copy (same as O1) while preserving the existing Prisma data-access code almost verbatim on the server side — the 110 call sites' *logic* survives, only their *location* moves. O1 requires re-deriving that same logic in PostgREST/RLS terms, which is strictly more work and carries the live-confirmed risk of an interim window where RLS policies are incomplete and the anon key is wide open (the advisory's own warning).
- It needs no new auth system invention — the current bcrypt + `User` table login can be lifted into the API basically unchanged; sessions become API tokens instead of an in-process `currentUser` variable.
- O3 doesn't remove the exposure at all (explicit non-goal acknowledged in the plan), and adds release-process complexity disproportionate to the partial benefit it buys; it's a good *now* stopgap, not the destination.

**Offline-mode cost**: none to the offline path's behavior or guarantees — SQLite caching, the sync queue, quarantine/dead-letter handling, backoff, and ID-remapping in `electron/syncManager.ts` are untouched in shape, because `processQueue`'s handler-injection design already isolates "how a synced item reaches the database" from "the queue's bookkeeping." What *does* change: the failure mode when only the API (not the raw DB) is unreachable becomes a new case to test — today `isNetworkError`/`markDbUnreachable` in `main.ts` reason about Postgres connection errors; after this change they need to reason about HTTP/API errors instead. That's a rewrite of the *online-branch error classification*, not a redesign of the offline system.

---

## 4. Implementation outline (for a follow-up plan)

1. **Stand up the API** (new repo or new directory in this one): Node/Express/Fastify (or Supabase Edge Functions, which would also dodge separate hosting — worth comparing in the follow-up plan) holding `DATABASE_URL`/`DIRECT_DATABASE_URL` and the existing `prisma/schema.prisma`. Port the bodies of the 63 handlers' online branches into REST (or RPC-style) endpoints — most of this is moving code, not rewriting it, since the Prisma calls themselves don't need to change, only their caller.
2. **Auth**: add a login endpoint (`POST /auth/login`) that does what `auth:login` does today (bcrypt compare against `User`), returns a short-lived access token + refresh token (JWT, signed server-side). Add token verification middleware on every other endpoint.
3. **Desktop-side client**: introduce a single `apiClient` module in `electron/` exposing the same shapes the handlers already expect (`{ data }` / `{ error }`), so each handler's online branch becomes a one-line swap from `await prisma.x.y(...)` to `await apiClient.x.y(...)`. Do this domain-by-domain (customers, then orders, then payments, ...) so each is independently testable and revertible, rather than one big-bang rewrite of all 63 handlers.
4. **Sync queue**: update the `handlers` map built in `main.ts` and passed into `syncManager.processQueue(...)` so each action's handler calls the API client instead of Prisma directly — `syncManager.ts` itself needs no changes.
5. **Network-failure classification**: update `isNetworkError`/`markDbUnreachable` (currently tuned for Postgres connection errors) to also classify API-unreachable / 5xx / timeout as "go offline," preserving today's offline fallback behavior.
6. **Build/package changes** (explicitly out of scope to perform now, but to plan): remove the `.env.production` → resources copy and the `DATABASE_URL`/`DIRECT_DATABASE_URL` env vars from what ships; replace with an `API_BASE_URL` (safe to ship, it's just a hostname) baked in instead.
7. **Cutover/rollback story**: ship the API-backed build behind a feature flag or staged rollout (e.g. a config value read at startup deciding Prisma-direct vs API-backed, so a bad release can flip back without a new build); keep the old direct-Prisma code path alive (commented/flagged, not deleted) for one release cycle as the rollback path, then remove it once the API path is proven in the field across all ~13 handler domains. Roll out domain-by-domain if the API framework supports partial routing (e.g. ship `customers`/`orders` first, leave `payments` on direct-Prisma until confidence is established, given payments are the highest-stakes data class).
8. **Decommission**: once 100% of installs are confirmed on the API path (telemetry/version check), rotate the shared DB credential (it's been exposed in every prior installer) and delete it from the API's own config rotation history too.

---

## 5. Interim mitigation (cheap, do now — does not require the above)

- **Rotate the shared `DATABASE_URL`/`DIRECT_DATABASE_URL` credential now**, and on a recurring cadence (e.g. quarterly) until the real fix ships — every existing installed copy already has the current one memorized/extractable, so rotation is the only lever that invalidates already-leaked copies.
- **Restrict the DB role's privileges** to exactly what the app needs (no superuser, no `DROP`/`CREATE` on `public` beyond what Prisma migrations require — and ideally migrations run from a separate, more-privileged role that never ships in `extraResources`, while the app's runtime role gets only `SELECT`/`INSERT`/`UPDATE`/`DELETE` on the 14 application tables).
- **IP allowlisting**: likely not practical given opticians connect from arbitrary residential/business networks across many locations — flagging as probably infeasible rather than recommending it; note for the follow-up plan to confirm with Supabase's network restriction support before ruling out fully.
- **Confirm `.env.production` stays out of source control**: verified — `.gitignore:8` already lists `.env.production` (alongside `.env` and `.env.local` at lines 5-6), and no `.env*` file is tracked in this repo's git history for this worktree. No action needed here beyond keeping this line in `.gitignore` as new contributors are onboarded.
- **Enable RLS is NOT recommended as an interim step on its own** — per the live advisory, turning RLS on with no policies blocks all access (breaks the app for every installed copy still using direct Prisma), and turning it on with permissive "allow all" policies provides zero protection while creating false confidence. RLS is correctly sequenced as part of O1 only, with policies authored and tested before any client cuts over to the anon key.
