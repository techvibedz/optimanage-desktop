# Plan 002: Make online payment & order money-writes atomic/idempotent

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

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (recommended — so this change is test-covered; not strictly required)
- **Category**: bug
- **Planned at**: commit `be6919f`, 2026-06-25

## Why this matters

The **offline sync path** for money was hardened over several releases: payments
are inserted and the order balance updated inside a single `prisma.$transaction`
(so a retry can never record a payment without its balance change), and deposits
use a deterministic `DEP-${orderId}` receipt so a re-run can't double-charge.
The **online path does neither.** `payments:create` inserts the payment, then
separately reads and updates the order balance — if the process dies or the
balance update throws in between, the payment exists but `balanceDue` is wrong
(money silently miscounted). `orders:create` mints a **random** deposit receipt
with no idempotency guard, so a retried/double-submitted order creates a second
deposit payment. This plan brings the online path up to the same proven standard
as the sync path — same patterns, already in this file.

## Current state

`electron/main.ts`, `registerIpcHandlers()`.

**(A) `payments:create` online path — NOT transactional (lines 2210-2233):**
```ts
ipcMain.handle('payments:create', async (_e, payment: any) => {
  try {
    requireDb()
    if (!payment.receiptNumber) {
      payment.receiptNumber = `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
    const data = await prisma.payment.create({ data: payment })
    markDbReachable()

    if (payment.orderId) {
      const order = await prisma.order.findUnique({ where: { id: payment.orderId }, select: { balanceDue: true, depositAmount: true } })
      if (order) {
        await prisma.order.update({
          where: { id: payment.orderId },
          data: {
            balanceDue: Math.max(0, (order.balanceDue || 0) - payment.amount),
            depositAmount: (order.depositAmount || 0) + payment.amount,
          },
        })
      }
    }
    localCache.cachePayment(data)
    return { data }
  } catch (err: any) { /* offline fallback — unchanged */ }
})
```

**(B) `orders:create` online deposit — random receipt, no idempotency (lines 1672-1691):**
```ts
if (depositAmount && depositAmount > 0) {
  await prisma.payment.create({
    data: {
      orderId: data.id,
      amount: depositAmount,
      paymentMethod: 'cash',
      receiptNumber: `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reference: 'Initial deposit',
      paymentDate: new Date(),
      userId: orderData.userId,
    },
  })
}
if (frameId) {
  await prisma.frame.updateMany({
    where: { id: frameId, stock: { gt: 0 } },
    data: { stock: { decrement: 1 } },
  })
}
```

**The proven pattern to copy is already in this file** — the sync handlers:
- Transactional payment + balance (lines 702-711):
  ```ts
  const data = await prisma.$transaction(async (tx: any) => {
    const created = await tx.payment.create({ data: picked })
    if (picked.orderId) {
      const order = await tx.order.findUnique({ where: { id: picked.orderId }, select: { balanceDue: true, depositAmount: true } })
      if (order) {
        await tx.order.update({ where: { id: picked.orderId }, data: { balanceDue: Math.max(0, (order.balanceDue || 0) - picked.amount), depositAmount: (order.depositAmount || 0) + picked.amount } })
      }
    }
    return created
  })
  ```
- Idempotent deposit with deterministic receipt (lines 593-599):
  ```ts
  const depositReceipt = `DEP-${data.id}`
  const existingDeposit = await prisma.payment.findUnique({ where: { receiptNumber: depositReceipt }, select: { id: true } })
  if (!existingDeposit) {
    await prisma.payment.create({
      data: { orderId: data.id, amount: depositAmount, paymentMethod: 'cash', receiptNumber: depositReceipt, reference: 'Initial deposit', paymentDate: depositDate, createdAt: depositDate, userId: picked.userId }
    })
  }
  ```

`Payment.receiptNumber` is `@unique` in `prisma/schema.prisma:232`, which is what
makes `DEP-${orderId}` a safe idempotency key (one deposit per order).

### Repo conventions

- 2-space indent, no semicolons. `any`-typed Prisma results are the norm here.
- Match the exact field set and `Math.max(0, ...)` clamp already used in both the
  online and sync versions — do not change the balance math, only its atomicity.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors   |
| Tests     | `npm test`         | all pass (if 001 landed) |

This change has no offline/unit harness for `main.ts` handlers; `tsc` plus the
manual smoke test below are the gates.

## Scope

**In scope** (only edit these two handlers in `electron/main.ts`):
- `payments:create` online branch (the `try` block, ~lines 2210-2233).
- `orders:create` online deposit + stock block (~lines 1672-1691).

**Out of scope** (do NOT touch):
- The **offline `catch` branches** of either handler — they already queue
  correctly and feed the hardened sync path.
- The **sync handlers** (lines 675-714 payments, 476-611 orders) — they are the
  reference, already correct.
- `createOrderSafe` and the order-number logic — unrelated to atomicity here.
- Do not introduce idempotency to `payments:create`'s *user-initiated* receipt
  (the random `RCT-` one): a manually entered payment is a deliberate single
  action; only the **balance update** needs to be atomic with the insert.

## Git workflow

- Branch: `advisor/002-atomic-money-writes`
- Commit style: conventional commits, e.g.
  `fix(payments): make online payment + balance update atomic`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Wrap `payments:create` online insert + balance update in a transaction

Replace the separate `prisma.payment.create(...)` + `if (payment.orderId) {...}`
block (lines 2216-2230) with a single `prisma.$transaction` that mirrors the sync
handler at lines 702-711 — insert the payment and update the balance on the same
`tx`. Keep `markDbReachable()` and `localCache.cachePayment(data)` exactly where
they are (after the transaction resolves). The returned `data` must remain the
created payment record.

**Verify**: `npx tsc --noEmit` → exit 0. `git diff` shows the two DB calls now
inside one `$transaction`, balance math unchanged.

### Step 2: Make the `orders:create` online deposit idempotent

In the `orders:create` online branch, change the deposit insert (lines 1672-1683)
to use the deterministic-receipt pattern from the sync handler (lines 593-599):
compute `const depositReceipt = \`DEP-${data.id}\``, `findUnique` by that
receipt, and only `create` the deposit if none exists. Keep `paymentMethod: 'cash'`,
`reference: 'Initial deposit'`, `userId: orderData.userId`. Leave the
`frame.updateMany` stock decrement immediately after, unchanged.

**Verify**: `npx tsc --noEmit` → exit 0. `git diff` shows the deposit now keyed on
`DEP-${data.id}` with a findUnique guard, no `Math.random()` in this block.

### Step 3: Smoke-check the change set

`git status` should list only `electron/main.ts` modified.

**Verify**: `git diff --stat` → only `electron/main.ts`, roughly 10-20 lines changed.

## Test plan

- If plan 001 landed, the sync-path equivalents are already covered. This plan
  changes online handlers that are not yet unit-testable in isolation (they live
  in the import-heavy `main.ts`). **Do not** create a new harness for `main.ts`
  here — that is deferred to the monolith-split work.
- Manual smoke test (document the result in the PR/commit body), if a dev DB is
  reachable:
  1. Online, create an order with a non-zero deposit → exactly one `DEP-<id>`
     payment row exists; `balanceDue = totalPrice − deposit`.
  2. Add a second payment to that order → `balanceDue` decreases by exactly the
     payment amount and `depositAmount` increases by it (one atomic step).
  3. Re-trigger the same order create (simulate a double submit with the same
     resulting order id) → still exactly one `DEP-<id>` deposit (no duplicate).
- If no dev DB is available, state that in the commit body; `tsc` is then the only
  automated gate.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0 (if 001 landed; otherwise note "no tests")
- [ ] `payments:create` online insert + balance update are inside one `prisma.$transaction`
- [ ] `orders:create` online deposit uses `DEP-${data.id}` + findUnique guard (no `Math.random()` deposit receipt)
- [ ] `git status` shows only `electron/main.ts` modified
- [ ] `plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back if:

- The excerpts above don't match the live `main.ts` (drift since `be6919f`).
- The offline `catch` branch turns out to share code you'd have to change to make
  the online path atomic — report it; do not modify offline behavior.
- `prisma.$transaction` isn't available on the client version in use
  (`@prisma/client` 5.22.0 supports it — if an error says otherwise, stop).

## Maintenance notes

- The online and sync money paths now share the same two patterns but are still
  duplicated by hand. The "collapse duplicated online/offline branches" direction
  item (see `plans/README.md`) would remove this drift permanently; until then, a
  reviewer changing one money path must change the other.
- A reviewer should verify the balance math (`Math.max(0, balanceDue - amount)`,
  `depositAmount + amount`) is byte-for-byte identical to the sync handler.
