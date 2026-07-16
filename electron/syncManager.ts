import { app, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// ─── Types ───────────────────────────────────────────────────────────────────
export interface QueueItem {
  id: string          // the local_xxx ID given to the record in SQLite
  action: string      // e.g. 'customers:create', 'orders:create', 'payments:create'
  payload: any        // the original data sent by the frontend
  createdAt: string
  retries: number
  userId?: string     // which user created this item — prevents cross-account sync
  nextRetryAt?: string // ISO time before which this item is skipped (exponential backoff)
  transientRetries?: number // timeout/stall retries — backoff only, NEVER counts toward quarantine
}

// ─── Reliability tuning ────────────────────────────────────────────────────────
// A single handler must never hang the whole sync loop. If a Prisma call stalls
// (common on a half-open socket after an offline→online flip), we time it out so
// processQueue always resolves and the in-progress flag is always released.
const HANDLER_TIMEOUT_MS = 25_000

// Race a handler against a timeout. Rejects with a timeout error instead of
// hanging forever. Idempotency guards (order number / receipt number lookups)
// make a retry after a false-timeout safe.
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Handler timeout after ${ms}ms for ${label}`)), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

// Exponential backoff (capped) so a failing item doesn't hammer the DB every 5s.
// retries 1→2s, 2→4s, 3→8s … capped at 5 minutes.
export function backoffMs(retries: number): number {
  return Math.min(5 * 60_000, 1000 * Math.pow(2, Math.min(retries, 8)))
}

// ─── Queue file path ─────────────────────────────────────────────────────────
const getQueuePath = () => path.join(app.getPath('userData'), 'sync-queue.json')
// Dead-letter file: items that exhausted their retries are MOVED here instead of
// being dropped, so financial data (payments) is never silently lost.
const getQuarantinePath = () => path.join(app.getPath('userData'), 'sync-quarantine.json')

// ─── Read / Write helpers ────────────────────────────────────────────────────
// Crash-safe persistence: write to a .tmp file then rename into place, keeping
// the previous version as .bak. A crash mid-write can no longer corrupt the
// queue JSON — and even if the main file IS damaged, reads fall back to the
// .tmp (newest complete write) then .bak (previous version) instead of
// silently returning an empty queue and losing every pending item.
function safeWriteJson(filePath: string, value: unknown): void {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  try { if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.bak`) } catch { /* best effort */ }
  fs.renameSync(tmp, filePath)
}

function safeReadJsonArray(filePath: string): any[] | null {
  for (const candidate of [filePath, `${filePath}.tmp`, `${filePath}.bak`]) {
    try {
      if (!fs.existsSync(candidate)) continue
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8'))
      if (Array.isArray(parsed)) {
        if (candidate !== filePath) {
          console.warn(`[SyncManager] ⚠ Recovered ${path.basename(filePath)} from ${path.basename(candidate)} (${parsed.length} items)`)
        }
        return parsed
      }
    } catch { /* damaged — try next candidate */ }
  }
  return null
}

function readQueue(): QueueItem[] {
  return (safeReadJsonArray(getQueuePath()) as QueueItem[] | null) ?? []
}

function writeQueue(queue: QueueItem[]): void {
  try {
    safeWriteJson(getQueuePath(), queue)
  } catch (err) {
    console.error('[SyncManager] Failed to write queue:', err)
  }
}

// ─── Quarantine (dead-letter) helpers ────────────────────────────────────────
export interface QuarantineItem extends QueueItem {
  quarantinedAt: string
  reason: string
}

function readQuarantine(): QuarantineItem[] {
  return (safeReadJsonArray(getQuarantinePath()) as QuarantineItem[] | null) ?? []
}

function writeQuarantine(items: QuarantineItem[]): void {
  try {
    safeWriteJson(getQuarantinePath(), items)
  } catch (err) {
    console.error('[SyncManager] Failed to write quarantine:', err)
  }
}

function quarantineItem(item: QueueItem, reason: string): void {
  const items = readQuarantine()
  if (items.some(q => q.id === item.id && q.action === item.action)) return
  items.push({ ...item, quarantinedAt: new Date().toISOString(), reason })
  writeQuarantine(items)
  console.warn(`[SyncManager] ⚠ Quarantined ${item.action} (${item.id}) — ${reason}. Data preserved, NOT dropped.`)
}

export function getQuarantine(): QuarantineItem[] {
  return readQuarantine()
}

export function getQuarantineLength(): number {
  return readQuarantine().length
}

/** Move a quarantined item back into the live queue so it is retried (e.g. after a manual relink). */
export function requeueFromQuarantine(localId: string): boolean {
  const items = readQuarantine()
  const idx = items.findIndex(q => q.id === localId)
  if (idx === -1) return false
  const [item] = items.splice(idx, 1)
  writeQuarantine(items)
  const queue = readQueue()
  if (!queue.some(q => q.id === item.id && q.action === item.action)) {
    const { quarantinedAt: _q, reason: _r, nextRetryAt: _n, transientRetries: _t, ...rest } = item as any
    queue.push({ ...rest, retries: 0 })
    writeQueue(queue)
  }
  console.log(`[SyncManager] Re-queued ${item.action} (${localId}) from quarantine`)
  return true
}

// FK fields that may carry unresolved local_ references in a queued payload.
const LOCAL_FK_FIELDS = ['customerId', 'prescriptionId', 'orderId', 'frameId', 'lensTypeId',
  'vlRightEyeLensTypeId', 'vlLeftEyeLensTypeId', 'vpRightEyeLensTypeId', 'vpLeftEyeLensTypeId',
  'supplierId']

// Reasons that describe a stalled connection rather than bad data. Items
// quarantined for these (by older app versions) deserve another chance once
// the connection is healthy again.
export function isTransientReason(reason: string | undefined): boolean {
  const r = (reason || '').toLowerCase()
  return r.includes('handler timeout') || r.includes("can't reach database server")
    || r.includes('econnrefused') || r.includes('etimedout') || r.includes('enotfound')
    || r.includes('p1001') || r.includes('p1002')
    || r.includes('connection pool') || r.includes('socket')
}

/**
 * Quarantine is no longer a dead end: automatically move items back into the
 * live queue when whatever blocked them has healed —
 *  • every local_ FK reference in the payload now has a known server mapping
 *    (e.g. the parent order/customer synced later, or the user relinked it), or
 *  • the quarantine reason was a transient connection stall, not bad data.
 * Called at the start of every sync pass, so recovery needs no manual action.
 */
export function requeueResolvedQuarantine(idMap: Record<string, string>): number {
  const items = readQuarantine()
  if (items.length === 0) return 0
  let revived = 0
  for (const q of items) {
    let revive = isTransientReason(q.reason)
    if (!revive && q.action.endsWith(':create') && q.payload && typeof q.payload === 'object') {
      const localRefs = LOCAL_FK_FIELDS.filter(f =>
        typeof q.payload[f] === 'string' && q.payload[f].startsWith('local_'))
      revive = localRefs.length > 0 && localRefs.every(f => !!idMap[q.payload[f]])
    }
    if (revive && requeueFromQuarantine(q.id)) revived++
  }
  if (revived > 0) console.log(`[SyncManager] ♻ Auto-revived ${revived} quarantined item(s) — blockers have healed`)
  return revived
}

export function removeFromQuarantine(localId: string): void {
  const items = readQuarantine()
  const filtered = items.filter(q => q.id !== localId)
  if (filtered.length !== items.length) writeQuarantine(filtered)
}

/**
 * Manually discard a stuck item from BOTH the live queue and the quarantine.
 * Used by the Sync Repair panel when the user has confirmed the record is fine
 * (already on the server / no longer needed) and just wants the stuck item gone.
 * Matches on local id; an optional action narrows it to one specific queued op.
 * Returns how many entries were removed across both files.
 */
export function discardItem(localId: string, action?: string): number {
  let removed = 0
  const matches = (i: { id: string; action: string }) =>
    i.id === localId && (!action || i.action === action)

  const queue = readQueue()
  const keptQueue = queue.filter(i => !matches(i))
  removed += queue.length - keptQueue.length
  if (keptQueue.length !== queue.length) writeQueue(keptQueue)

  const quarantine = readQuarantine()
  const keptQ = quarantine.filter(i => !matches(i))
  removed += quarantine.length - keptQ.length
  if (keptQ.length !== quarantine.length) writeQuarantine(keptQ)

  if (removed > 0) console.log(`[SyncManager] Discarded ${removed} item(s) for ${localId}${action ? ` (${action})` : ''}`)
  return removed
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function isOnline(): boolean {
  try {
    return net.isOnline()
  } catch {
    return true
  }
}

export function addToQueue(action: string, payload: any, localId: string, userId?: string): void {
  const queue = readQueue()
  const existing = queue.find(item => item.action === action && item.id === localId)
  if (existing) {
    if (!action.endsWith(':create')) {
      existing.payload = payload
      if (userId) existing.userId = userId
      writeQueue(queue)
      console.log(`[SyncManager] Updated queued ${action} (${localId}). Queue size: ${queue.length}`)
    }
    return
  }
  queue.push({
    id: localId,
    action,
    payload,
    createdAt: new Date().toISOString(),
    retries: 0,
    userId,
  })
  writeQueue(queue)
  console.log(`[SyncManager] Queued ${action} (${localId}). Queue size: ${queue.length}`)
}

export function getQueueLength(): number {
  return readQueue().length
}

export function getQueue(): QueueItem[] {
  return readQueue()
}

export function removeFromQueue(localId: string): void {
  const queue = readQueue()
  const filtered = queue.filter(item => item.id !== localId)
  if (filtered.length !== queue.length) {
    writeQueue(filtered)
    console.log(`[SyncManager] Removed ${queue.length - filtered.length} queue item(s) for ${localId}`)
  }
}

export function updateCreatePayload(localId: string, updates: Record<string, any>): boolean {
  const queue = readQueue()
  const item = queue.find(i => i.id === localId && i.action.endsWith(':create'))
  if (item) {
    Object.assign(item.payload, updates)
    writeQueue(queue)
    return true
  }
  return false
}

/**
 * Process the offline queue. Accepts a handler map that maps action strings
 * to async functions that execute the actual Prisma operations.
 * Handlers should return the new Prisma record (with .id) so we can track
 * local_id → real_id mappings for dependent entities.
 * Returns the number of successfully processed items.
 */
export function getQueueLengthForUser(userId: string): number {
  return readQueue().filter(item => !item.userId || item.userId === userId).length
}

const keyOf = (i: { id: string; action: string }) => `${i.action}|${i.id}`

// Persist one item's outcome by reconciling against the LATEST queue file
// instead of bulk-rewriting from a snapshot taken at the start of the run.
// A sync run can last minutes; meanwhile the user keeps working and addToQueue /
// removeFromQueue mutate the file. The old end-of-run snapshot write silently
// DELETED items queued during the run (data loss → "never synced") and
// RESURRECTED items removed during the run (retried forever → "stuck").
//  • consumedKey: remove that item (synced / quarantined / intentionally dropped)
//  • updatedItem: copy its retry/backoff bookkeeping onto the live entry
//    (only bookkeeping — the live payload may be newer than our snapshot's)
function commitItemOutcome(consumedKey: string | null, updatedItem?: QueueItem): void {
  const latest = readQueue()
  let changed = false
  const next: QueueItem[] = []
  for (const it of latest) {
    const k = keyOf(it)
    if (consumedKey && k === consumedKey) { changed = true; continue }
    if (updatedItem && k === keyOf(updatedItem)) {
      next.push({ ...it, retries: updatedItem.retries, transientRetries: updatedItem.transientRetries, nextRetryAt: updatedItem.nextRetryAt })
      changed = true
      continue
    }
    next.push(it)
  }
  if (changed) writeQueue(next)
}

export async function processQueue(
  handlers: Record<string, (payload: any) => Promise<any>>,
  persistedIdMap?: Record<string, string>,
  currentUserId?: string,
  // Called with (done, total) before the first item and after each item is
  // handled (synced, skipped, failed, quarantined). Drives the renderer's
  // sync progress bar AND serves as the watchdog heartbeat: a long run that
  // is still making per-item progress must never be treated as wedged.
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  if (!isOnline()) {
    console.log('[SyncManager] Still offline, skipping queue processing.')
    return 0
  }

  // Seed with persistent local→server mappings from prior sync cycles
  const idMap: Record<string, string> = { ...(persistedIdMap || {}) }

  // Give quarantined items whose blockers have healed another chance, BEFORE
  // reading the queue so they are processed in this very pass.
  try { requeueResolvedQuarantine(idMap) } catch (e: any) {
    console.warn('[SyncManager] Quarantine revival failed (continuing):', e?.message || e)
  }

  const allItems = readQueue()
  if (allItems.length === 0) return 0

  // Only process items belonging to the current user (or untagged legacy items).
  // Other users' items stay untouched in the file — no rewrite needed.
  const queue = allItems.filter(item => !(currentUserId && item.userId && item.userId !== currentUserId))
  const skippedOthers = allItems.length - queue.length
  if (skippedOthers > 0) {
    console.log(`[SyncManager] Skipping ${skippedOthers} items belonging to other users`)
  }
  if (queue.length === 0) return 0

  // Sort queue: customers first, then prescriptions, then frames/lensTypes, then orders, then payments.
  // Frames and lens types must sync before orders because orders reference them by FK.
  const priority: Record<string, number> = { 'customers:create': 0, 'prescriptions:create': 1, 'frames:create': 2, 'lensTypes:create': 3, 'contactLenses:create': 4, 'orders:create': 5, 'payments:create': 6 }
  queue.sort((a, b) => (priority[a.action] ?? 9) - (priority[b.action] ?? 9))

  console.log(`[SyncManager] Processing ${queue.length} queued items...`)
  let processed = 0
  let done = 0
  onProgress?.(0, queue.length)

  for (const item of queue) {
    // eslint-disable-next-line no-loop-func
    const step = () => { done++; onProgress?.(done, queue.length) }
    const handler = handlers[item.action]
    if (!handler) {
      // Unknown action (e.g. queue written by a newer/older version). Quarantine
      // instead of silently dropping — the data stays inspectable and recoverable.
      quarantineItem(item, `No handler for action ${item.action}`)
      commitItemOutcome(keyOf(item))
      step()
      continue
    }

    // Backoff: a recently-failed item waits before its next attempt so it doesn't
    // churn every 5s. It stays in the queue, just untouched until its time comes.
    if (item.nextRetryAt && new Date(item.nextRetryAt).getTime() > Date.now()) {
      step()
      continue
    }

    // Replace any local_ references in the payload with their real synced IDs.
    // Scan the payload for local_ tokens and look those up, instead of trying
    // every known mapping against every payload — with thousands of persisted
    // mappings the old way burned CPU on the main process for each item.
    const payloadStr = JSON.stringify(item.payload)
    const localTokens = payloadStr.match(/local_[A-Za-z0-9_]+/g)
    if (localTokens) {
      let replaced = payloadStr
      for (const token of new Set(localTokens)) {
        const realId = idMap[token]
        if (realId) replaced = replaced.split(token).join(realId)
      }
      if (replaced !== payloadStr) {
        item.payload = JSON.parse(replaced)
        console.log(`[SyncManager] Replaced local IDs in ${item.action} payload`)
      }
    }

    try {
      const result = await withTimeout(handler(item.payload), HANDLER_TIMEOUT_MS, `${item.action} (${item.id})`)
      // Store the ID mapping if the handler returned a record with an id
      if (result?.id && item.id?.startsWith('local_')) {
        idMap[item.id] = result.id
        console.log(`[SyncManager] ID mapping: ${item.id} → ${result.id}`)
      }
      processed++
      // Persist the success IMMEDIATELY — a crash later in the run can no longer
      // bring this item back for a duplicate attempt.
      commitItemOutcome(keyOf(item))
      step()
      console.log(`[SyncManager] ✓ Synced ${item.action} (${item.id})`)
    } catch (err: any) {
      const msg = String(err?.message || '')
      const isTimeout = msg.includes('Handler timeout after')
      const isConnectionError = msg.includes("Can't reach database server") || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || err?.code === 'P1001' || err?.code === 'P1002'
      if (isConnectionError || isTimeout) {
        // DB unreachable or stalling — stop this run to bound its duration, keep all
        // remaining items. A stalled item gets a backoff stamp so it doesn't lead the
        // next run straight back into the same stall. Crucially this uses the
        // TRANSIENT counter: a slow connection must never push good data toward
        // quarantine — only genuine data errors count toward that limit.
        if (isTimeout) {
          item.transientRetries = (item.transientRetries || 0) + 1
          item.nextRetryAt = new Date(Date.now() + backoffMs(item.transientRetries)).toISOString()
          commitItemOutcome(null, item)
          console.warn(`[SyncManager] ⏱ ${item.action} (${item.id}) timed out (stall ${item.transientRetries}). Aborting run, will retry later.`)
        } else {
          console.warn(`[SyncManager] DB unreachable, aborting sync. Will retry later.`)
        }
        break
      }

      const lower = msg.toLowerCase()
      const isUniqueConstraint = err?.code === 'P2002'
      if (isUniqueConstraint) {
        console.warn(`[SyncManager] ✗ Dropping ${item.action} (${item.id}) — unique constraint violation (record likely already exists):`)
        console.warn(`[SyncManager]   Error: ${msg.slice(0, 500)}${err?.code ? ` [${err.code}]` : ''}`)
        processed++
        commitItemOutcome(keyOf(item))
        step()
        continue
      }
      const isFKError = lower.includes('foreign key constraint') || lower.includes('record to delete does not exist') || lower.includes('record to update not found') || lower.includes('required but not found') || err?.code === 'P2003' || err?.code === 'P2025'

      // Check for REAL unresolved local_ FK references (customerId, prescriptionId, orderId, etc.)
      // Exclude 'localId' and 'id' fields — those are metadata, not FK references
      const hasRealLocalReference = item.action.endsWith(':create') && (() => {
        const p = item.payload
        if (!p || typeof p !== 'object') return false
        const fkFields = [...LOCAL_FK_FIELDS, 'userId']
        return fkFields.some(f => typeof p[f] === 'string' && p[f].startsWith('local_'))
      })()
      const isUnresolvedLocalReference = hasRealLocalReference || lower.includes('unresolved local')

      if (isFKError && !isUnresolvedLocalReference) {
        if (item.action.endsWith(':create')) {
          // Create-type items carry user data — quarantine, never drop.
          quarantineItem(item, `FK violation: ${msg.slice(0, 200)}${err?.code ? ` [${err.code}]` : ''}`)
        } else {
          console.warn(`[SyncManager] ✗ Dropping ${item.action} (${item.id}) — FK violation with no local refs (target record gone):`)
          console.warn(`[SyncManager]   Error: ${msg.slice(0, 500)}${err?.code ? ` [${err.code}]` : ''}`)
          console.warn(`[SyncManager]   Payload:`, JSON.stringify(item.payload).slice(0, 800))
        }
        commitItemOutcome(keyOf(item))
        step()
        continue
      }
      if (isFKError) {
        console.warn(`[SyncManager] ✗ ${item.action} (${item.id}) has unresolved local FK references, retrying:`)
        console.warn(`[SyncManager]   Error: ${msg.slice(0, 500)}${err?.code ? ` [${err.code}]` : ''}`)
      }

      item.retries++
      if (item.retries >= 20) {
        // Never silently drop create-type items — they carry user data (esp. payments = money).
        // Move them to the quarantine dead-letter file so they can be inspected/recovered
        // from the Sync Repair panel instead of vanishing.
        if (item.action.endsWith(':create')) {
          quarantineItem(item, `${msg.slice(0, 200)}${err?.code ? ` [${err.code}]` : ''}`)
        } else {
          console.error(`[SyncManager] ✗ Dropped ${item.action} (${item.id}) after 20 retries: ${msg}${err?.code ? ` [${err.code}]` : ''}`)
        }
        commitItemOutcome(keyOf(item))
      } else {
        // Space out the next attempt instead of retrying every 5s.
        item.nextRetryAt = new Date(Date.now() + backoffMs(item.retries)).toISOString()
        commitItemOutcome(null, item)
        const waitS = Math.round(backoffMs(item.retries) / 1000)
        console.warn(`[SyncManager] ✗ Failed ${item.action} (${item.id}), retry ${item.retries} in ~${waitS}s: ${msg}${err?.code ? ` [${err.code}]` : ''}`)
      }
      step()
    }
  }

  console.log(`[SyncManager] Done. Processed: ${processed}, Queue now: ${readQueue().length}`)
  return processed
}
