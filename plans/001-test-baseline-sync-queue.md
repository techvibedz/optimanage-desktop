# Plan 001: Establish a test baseline (Vitest) for the sync queue

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat be6919f..HEAD -- electron/syncManager.ts package.json`
> If `electron/syncManager.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `be6919f`, 2026-06-25

## Why this matters

`electron/syncManager.ts` (475 lines) is the heart of the offline-first app: it
decides when a queued record is retried, quarantined, revived, deduplicated, or
dropped. It has had ~10 bug-fix releases (v1.5.0 → v1.6.0), each fixing a money
or data-loss bug that shipped to opticians blind, because **the repo has zero
automated tests** (`package.json` has no `test` script; there are no `*.test.*`
files). This plan stands up Vitest and locks the queue's current, hard-won
behavior in unit tests so the next change can't silently regress it. It is also
a prerequisite for safely refactoring the `main.ts` monolith later.

## Current state

- `electron/syncManager.ts` — the offline sync queue. Persists to JSON files
  under Electron's `userData` dir. Imports `{ app, net } from 'electron'` at the
  top (line 1), so any test must mock `electron`.
- It already **exports** these testable functions: `withTimeout`, `isOnline`,
  `addToQueue`, `getQueueLength`, `getQueue`, `getQueueLengthForUser`,
  `removeFromQueue`, `updateCreatePayload`, `getQuarantine`,
  `getQuarantineLength`, `requeueFromQuarantine`, `requeueResolvedQuarantine`,
  `removeFromQuarantine`, `discardItem`, `processQueue`.
- It has two **non-exported** pure helpers that are worth testing directly:
  ```ts
  // electron/syncManager.ts:38-40
  function backoffMs(retries: number): number {
    return Math.min(5 * 60_000, 1000 * Math.pow(2, Math.min(retries, 8)))
  }
  // electron/syncManager.ts:148-154
  function isTransientReason(reason: string | undefined): boolean {
    const r = (reason || '').toLowerCase()
    return r.includes('handler timeout') || r.includes("can't reach database server")
      || r.includes('econnrefused') || r.includes('etimedout') || r.includes('enotfound')
      || r.includes('p1001') || r.includes('p1002')
      || r.includes('connection pool') || r.includes('socket')
  }
  ```
- File paths are derived from `app.getPath('userData')`:
  ```ts
  // electron/syncManager.ts:43-46
  const getQueuePath = () => path.join(app.getPath('userData'), 'sync-queue.json')
  const getQuarantinePath = () => path.join(app.getPath('userData'), 'sync-quarantine.json')
  ```
- Key behaviors the tests must lock (all in `electron/syncManager.ts`):
  - `addToQueue` dedupes a `:create` for the same id (lines 223-245): a second
    `:create` with the same `(action,id)` is ignored; a non-`:create` updates the payload.
  - `processQueue` sorts by priority `customers→prescriptions→orders→payments`
    (line 346), replaces `local_` refs from the idMap (lines 368-379), and on a
    handler returning `{id}` records a `local_→real` mapping (lines 383-387).
  - On `P2002` (unique constraint) a queue item is **dropped as already-synced**,
    counted as processed (lines 415-422).
  - A connection error / timeout **aborts the run** and leaves remaining items
    queued; a timeout bumps `transientRetries` (never `retries`) and stamps
    `nextRetryAt` (lines 393-412).
  - A `:create` that exhausts 20 `retries` is **quarantined, never dropped**;
    a non-`:create` is dropped (lines 452-462).
  - `requeueResolvedQuarantine` revives an item when its reason is transient OR
    every `local_` FK in its payload now resolves in the idMap (lines 164-179).
  - `discardItem` removes matching entries from both queue and quarantine (lines 194-211).
  - `commitItemOutcome` reconciles against the **latest** file, not a snapshot
    (lines 297-312) — an item `addToQueue`'d mid-run survives; a removed one stays removed.

### Repo conventions to match

- TypeScript, strict mode (`tsconfig.json` has `"strict": true`). 2-space indent,
  no semicolons (see any `electron/*.ts` file). Match this style in test files.
- This repo uses **Vite 6** already (`vite.config.ts`). Vitest is the natural fit
  (shares the Vite config/transform). Do not introduce Jest.
- No test framework is currently installed — you will add Vitest as a dev dep.

## Commands you will need

| Purpose   | Command                         | Expected on success      |
|-----------|---------------------------------|--------------------------|
| Install   | `npm install`                   | exit 0                   |
| Typecheck | `npx tsc --noEmit`              | exit 0, no errors        |
| Tests     | `npm test`                      | all pass                 |
| One file  | `npx vitest run electron/syncManager.test.ts` | all pass   |

Note: this is an npm project (`package-lock.json` present). Use `npm`, not pnpm/yarn.

## Suggested executor toolkit

- If a `vite-patterns` or `verification-loop` skill is available, consult it for
  Vitest-with-Vite config conventions. Otherwise the config below is sufficient.

## Scope

**In scope** (the only files you should create/modify):
- `package.json` — add `vitest` dev dep + `test` / `test:run` scripts.
- `vitest.config.ts` (create) — Vitest config with an `electron` mock alias.
- `electron/__mocks__/electron.ts` (create) — minimal mock of `app`/`net`.
- `electron/syncManager.test.ts` (create) — the tests.
- `electron/syncManager.ts` — **only** to add `export` in front of `backoffMs`
  and `isTransientReason` (two words, no logic change). Nothing else.

**Out of scope** (do NOT touch):
- Any logic inside `syncManager.ts` beyond adding the two `export` keywords. If a
  test reveals a bug, **do not fix it** — record it in `plans/README.md` notes and
  STOP. This plan locks current behavior; behavior changes belong in their own plan.
- `electron/main.ts`, `electron/localCache.ts` — not tested here (they import the
  full Electron app and Prisma; testing them needs the monolith split, deferred).

## Git workflow

- Branch: `advisor/001-test-baseline`
- Commit style: conventional commits (see `git log`, e.g.
  `test(sync): add Vitest baseline for sync queue`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install Vitest and add scripts

Run `npm install -D vitest@^2`. Then add to `package.json` `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Verify**: `npx vitest --version` → prints a 2.x version. `npm run test` →
exits non-zero with "No test files found" (expected — none yet).

### Step 2: Add the electron mock and Vitest config

Create `electron/__mocks__/electron.ts`:
```ts
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// Each import gets a fresh temp userData dir so queue files never collide
// between test files. Tests clear it themselves via clearSyncFiles() helper.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'optic-sync-test-'))

export const app = {
  getPath: (name: string) => (name === 'userData' ? userData : userData),
}
// Default: online. Tests override net.isOnline via vi.mocked if needed.
export const net = {
  isOnline: () => true,
}
export const __userData = userData
```

Create `vitest.config.ts` at repo root:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts'],
  },
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'electron/__mocks__/electron.ts'),
    },
  },
})
```

**Verify**: `npx tsc --noEmit` → exit 0 (the mock and config are valid TS).

### Step 3: Export the two pure helpers

In `electron/syncManager.ts`, add `export` to exactly these two declarations:
- `function backoffMs(` → `export function backoffMs(` (line ~38)
- `function isTransientReason(` → `export function isTransientReason(` (line ~148)

No other change to the file.

**Verify**: `npx tsc --noEmit` → exit 0. `git diff electron/syncManager.ts` shows
only two lines changed, both adding `export`.

### Step 4: Write the tests

Create `electron/syncManager.test.ts`. Use this skeleton and fill in the cases
listed under "Test plan". To isolate each test, clear the queue/quarantine files
before each test by re-reading and discarding, or by removing the JSON files via
the mock's `__userData` dir.

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as sm from './syncManager'
import { __userData } from './__mocks__/electron'

function clearSyncFiles() {
  for (const f of ['sync-queue.json', 'sync-quarantine.json']) {
    for (const suffix of ['', '.tmp', '.bak']) {
      const p = path.join(__userData, f + suffix)
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
  }
}

beforeEach(() => clearSyncFiles())

describe('backoffMs', () => {
  it('grows exponentially and caps at 5 minutes', () => {
    expect(sm.backoffMs(1)).toBe(2000)
    expect(sm.backoffMs(2)).toBe(4000)
    expect(sm.backoffMs(3)).toBe(8000)
    expect(sm.backoffMs(100)).toBe(5 * 60_000) // capped
  })
})

// ...further describe blocks per the Test plan
```

For `processQueue` tests, pass a `handlers` map of fake async functions (e.g.
`{ 'orders:create': async () => ({ id: 'srv_1' }) }`) and assert on the returned
processed count and the resulting queue/quarantine state via `sm.getQueue()` /
`sm.getQuarantine()`. To simulate a unique-constraint drop, throw
`Object.assign(new Error('unique'), { code: 'P2002' })` from a handler. To
simulate a connection abort, throw `Object.assign(new Error('x'), { code: 'P1001' })`.

**Verify**: `npm test` → all tests pass.

## Test plan

New file `electron/syncManager.test.ts`. Cover at minimum:

- **`backoffMs`**: 1→2000, 2→4000, 3→8000, large→capped at 300000.
- **`isTransientReason`**: true for "handler timeout", "P1001", "ECONNREFUSED",
  "socket"; false for "unique constraint", "validation error", undefined.
- **`addToQueue`**: queuing two `orders:create` with the same id keeps one item;
  a `customers:update` for an existing id updates its payload.
- **`processQueue` happy path**: one `orders:create` whose handler returns
  `{id:'srv_1'}` → returns 1, queue empties, and a later `payments:create`
  referencing that `local_` id gets the ref replaced (seed the idMap via the
  order result; assert the payment handler receives the real id).
- **`processQueue` P2002**: handler throws `code:'P2002'` → item removed, counted
  as processed, not quarantined.
- **`processQueue` connection abort**: handler throws `code:'P1001'` → run aborts,
  item remains in queue with retries unchanged.
- **`processQueue` 20-retry quarantine**: a `payments:create` whose handler always
  throws a non-FK validation error eventually lands in quarantine (not dropped);
  a `customers:update` in the same situation is dropped. (You can speed this up by
  asserting after enough passes, or by pre-seeding `retries:19` via `addToQueue`
  + manual file edit — document whichever you choose in a comment.)
- **`requeueResolvedQuarantine`**: a quarantined `payments:create` with payload
  `orderId:'local_x'` is revived once the idMap contains `local_x`; one with a
  transient reason is revived unconditionally; one with a data error and no
  resolvable refs stays quarantined.
- **`discardItem`**: removes from both queue and quarantine, returns the count.

There is no existing test to model after (this is the first). Keep each test
self-contained and order-independent (the `beforeEach` clears state).

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 with at least 8 passing tests across the cases above
- [ ] `git diff electron/syncManager.ts` shows only two added `export` keywords
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 001 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live `syncManager.ts` (drift).
- A test reveals what looks like a real bug in current behavior. **Do not fix it
  here** — note it in `plans/README.md` and stop; behavior fixes are out of scope.
- The `electron` import can't be mocked via the alias (e.g. Vitest resolves the
  real module). Report the error rather than rewriting `syncManager.ts` imports.
- Tests prove flaky/timing-dependent (e.g. asserting exact `nextRetryAt`
  wall-clock values). Prefer asserting on counts/state, not timestamps.

## Maintenance notes

- When the `main.ts` monolith is split (deferred plan), extract its pure helpers
  (`parseOrderNum`, `formatOrderNumber`, `pickFields`, `findServerOrderTwin`
  matching) into an importable module and add tests here too.
- The whole-JSON `local_` string-substitution in `processQueue` (lines 368-379)
  is a known latent corruption risk; a test here that feeds a payload with a
  `local_` substring inside a notes field would document current behavior and
  protect a future fix.
- A reviewer should confirm no production logic changed — the diff to
  `syncManager.ts` must be only the two `export` words.
