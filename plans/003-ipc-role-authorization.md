# Plan 003: Enforce role authorization on user-admin IPC handlers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat be6919f..HEAD -- electron/main.ts`
> If `electron/main.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `be6919f`, 2026-06-25

## Why this matters

The schema's default user role is `ASSISTANT` (`prisma/schema.prisma:16`), yet
**no IPC handler checks the caller's role.** The user-management handlers
(`users:create`, `users:update`, `users:delete`) run for anyone who is logged in,
so an assistant can create an ADMIN account, change another user's password, or
delete users — full privilege escalation inside the app. The renderer hides these
controls by role, but that is cosmetic: the preload bridge exposes
`createUser`/`updateUser`/`deleteUser` to the whole renderer, callable from
devtools or a renderer bug. This plan adds a single server-side (main-process)
role gate on exactly the account-management handlers — the clear-cut privilege
boundary — without touching day-to-day data handlers that assistants legitimately
use (creating/editing orders, customers, payments).

## Current state

`electron/main.ts`.

- `currentUser` is the authoritative logged-in identity in the main process, and
  it carries `role`:
  ```ts
  // electron/main.ts:1048
  let currentUser = loadSession()
  // session shape: { id, email, name, role }   (electron/main.ts:1028)
  // set on login at 1381 / 1397; repaired from server at 1115
  ```
- The three handlers with **no role check** (`electron/main.ts:2445-2472`):
  ```ts
  ipcMain.handle('users:create', async (_e, userData: any) => {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10)
      const data = await prisma.user.create({ data: { email: userData.email, name: userData.name, password: hashedPassword, role: userData.role || 'ASSISTANT' }, select: {...} })
      localCache.cacheUser({ ...data, password: hashedPassword })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('users:update', async (_e, id: string, updates: any) => {
    try {
      if (updates.password) updates.password = await bcrypt.hash(updates.password, 10)
      const data = await prisma.user.update({ where: { id }, data: updates, select: {...} })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('users:delete', async (_e, id: string) => {
    try { await prisma.user.delete({ where: { id } }); return { success: true } }
    catch (err: any) { return { error: err.message } }
  })
  ```
- `users:list` (line 2427) reads only — leave it as-is (assistants may legitimately
  see the team list; this plan gates writes only).
- Handlers return errors as `{ error: string }` and successes as `{ data }` or
  `{ success: true }` — match that shape for the denial response.

### Repo conventions

- 2-space indent, no semicolons. Errors surface to the renderer as
  `{ error: '<message>' }`. The renderer shows that string to the user.
- `currentUser?.role` is the role string (`'ADMIN'` or `'ASSISTANT'`); the
  default-seeded offline admin is `'ADMIN'` (`electron/main.ts:136`).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors   |
| Tests     | `npm test`         | all pass (if 001 landed) |

## Scope

**In scope** (only `electron/main.ts`):
- Add one small helper near the other top-level helpers (e.g. just after
  `repairSessionUserId`, around line 1126) — `requireAdmin()`.
- Apply it at the top of `users:create`, `users:update`, `users:delete`.

**Out of scope** (do NOT touch):
- `users:list` and every data handler (customers/orders/payments/etc.) —
  assistants need these; restricting them would break the shop's daily workflow.
- The `params.userId`-trust issue (handlers scope by a renderer-supplied
  `userId`). Real but lower-risk and a much larger change — leave it; it is
  recorded as a follow-up in this plan's Maintenance notes.
- The preload bridge (`electron/preload.ts`) — the gate belongs in the main
  process, not by removing the API.

## Git workflow

- Branch: `advisor/003-ipc-role-authz`
- Commit style: conventional commits, e.g.
  `fix(security): require ADMIN role for user-management IPC`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a `requireAdmin` helper

Add near the other session helpers in `electron/main.ts` (after
`repairSessionUserId`, ~line 1126):
```ts
// Throw if the logged-in user is not an admin. Account management (create/edit/
// delete users) is the one privilege boundary enforced in the main process —
// the renderer's role-based hiding is cosmetic and bypassable from devtools.
function assertAdmin(): void {
  if (currentUser?.role !== 'ADMIN') {
    const err: any = new Error('Not authorized — administrator role required')
    err._forbidden = true
    throw err
  }
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Gate the three user-management handlers

At the very top of each handler body (inside the `try`, before any DB/bcrypt
call), add `assertAdmin()`:
- `users:create` — before `bcrypt.hash` (line ~2447).
- `users:update` — before the `if (updates.password)` line (~2459).
- `users:delete` — before `prisma.user.delete` (~2470).

Each handler's existing `catch (err: any) { return { error: err.message } }`
already converts the thrown error into `{ error: 'Not authorized — administrator
role required' }`, which the renderer displays. No catch changes needed.

**Verify**: `npx tsc --noEmit` → exit 0. `git grep -n 'assertAdmin()' electron/main.ts`
→ 3 call sites + 1 definition.

### Step 3: Confirm scope

`git status` lists only `electron/main.ts`.

**Verify**: `git diff --stat` → only `electron/main.ts`, ~10-15 lines added.

## Test plan

- These handlers live in the import-heavy `main.ts` and aren't unit-testable in
  isolation yet (deferred to the monolith split). **Do not** build a `main.ts`
  test harness here.
- Manual verification (document in commit body):
  1. Logged in as an ADMIN (e.g. the seeded `admin@optimanage.local`): create,
     edit, and delete a test user all succeed.
  2. Logged in as an ASSISTANT-role user: `createUser` / `updateUser` /
     `deleteUser` each return `{ error: 'Not authorized — administrator role
     required' }`; existing data handlers (create a customer, an order, a payment)
     still work.
- If plan 001's Vitest harness exists, a pure unit test of `assertAdmin` is
  optional but low-value (it reads module-level `currentUser`); skip unless trivial.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `assertAdmin()` is called at the top of `users:create`, `users:update`, `users:delete`
- [ ] `users:list` and all non-user data handlers are unchanged
- [ ] `git status` shows only `electron/main.ts` modified
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back if:

- The excerpts above don't match the live `main.ts` (drift).
- You find an existing role check elsewhere that this would double up or conflict
  with — report it before adding another.
- Gating these handlers appears to break a legitimate offline admin flow (the
  seeded offline admin is role `ADMIN`, so it should not — if it does, stop).

## Maintenance notes

- **Follow-up, deliberately deferred**: every data handler scopes by a
  renderer-supplied `params.userId` rather than `currentUser.id`
  (e.g. `customers:list` at `main.ts:1422`). A user could read/write another
  user's records by passing a different `userId`. Practical risk is low (the
  renderer only knows its own cuid), but a hardening pass should make write/scope
  handlers derive `userId` from `currentUser` and ignore the param. That is a
  larger, separate change.
- Remember this gate is **defense in depth, not the trust boundary** — see plan
  004: because the DB credentials ship inside the installer, a determined user
  can bypass the app entirely. 003 stops accidental/casual escalation within the
  running app; 004 addresses the underlying exposure.
- A reviewer should confirm only account-management handlers were gated, not data
  handlers (which would break assistants' daily work).
