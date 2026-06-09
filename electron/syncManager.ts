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
}

// ─── Queue file path ─────────────────────────────────────────────────────────
const getQueuePath = () => path.join(app.getPath('userData'), 'sync-queue.json')
// Dead-letter file: items that exhausted their retries are MOVED here instead of
// being dropped, so financial data (payments) is never silently lost.
const getQuarantinePath = () => path.join(app.getPath('userData'), 'sync-quarantine.json')

// ─── Read / Write helpers ────────────────────────────────────────────────────
function readQueue(): QueueItem[] {
  try {
    const filePath = getQueuePath()
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeQueue(queue: QueueItem[]): void {
  try {
    fs.writeFileSync(getQueuePath(), JSON.stringify(queue, null, 2), 'utf-8')
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
  try {
    const filePath = getQuarantinePath()
    if (!fs.existsSync(filePath)) return []
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

function writeQuarantine(items: QuarantineItem[]): void {
  try {
    fs.writeFileSync(getQuarantinePath(), JSON.stringify(items, null, 2), 'utf-8')
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
    const { quarantinedAt: _q, reason: _r, ...rest } = item as any
    queue.push({ ...rest, retries: 0 })
    writeQueue(queue)
  }
  console.log(`[SyncManager] Re-queued ${item.action} (${localId}) from quarantine`)
  return true
}

export function removeFromQuarantine(localId: string): void {
  const items = readQuarantine()
  const filtered = items.filter(q => q.id !== localId)
  if (filtered.length !== items.length) writeQuarantine(filtered)
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

export async function processQueue(
  handlers: Record<string, (payload: any) => Promise<any>>,
  persistedIdMap?: Record<string, string>,
  currentUserId?: string
): Promise<number> {
  if (!isOnline()) {
    console.log('[SyncManager] Still offline, skipping queue processing.')
    return 0
  }

  const allItems = readQueue()
  if (allItems.length === 0) return 0

  // Split: only process items belonging to the current user (or untagged legacy items)
  const queue: QueueItem[] = []
  const otherUserItems: QueueItem[] = []
  for (const item of allItems) {
    if (currentUserId && item.userId && item.userId !== currentUserId) {
      otherUserItems.push(item)
    } else {
      queue.push(item)
    }
  }
  if (otherUserItems.length > 0) {
    console.log(`[SyncManager] Skipping ${otherUserItems.length} items belonging to other users`)
  }
  if (queue.length === 0) {
    writeQueue(otherUserItems)
    return 0
  }

  // Sort queue: customers first, then prescriptions, then orders, then payments
  const priority: Record<string, number> = { 'customers:create': 0, 'prescriptions:create': 1, 'orders:create': 2, 'payments:create': 3 }
  queue.sort((a, b) => (priority[a.action] ?? 9) - (priority[b.action] ?? 9))

  console.log(`[SyncManager] Processing ${queue.length} queued items...`)
  let processed = 0
  const remaining: QueueItem[] = []
  // Seed with persistent local→server mappings from prior sync cycles
  const idMap: Record<string, string> = { ...(persistedIdMap || {}) }

  for (const item of queue) {
    const handler = handlers[item.action]
    if (!handler) {
      console.warn(`[SyncManager] No handler for action: ${item.action}. Dropping item.`)
      continue
    }

    // Replace any local_ references in the payload with their real synced IDs
    if (Object.keys(idMap).length > 0) {
      const payloadStr = JSON.stringify(item.payload)
      let replaced = payloadStr
      for (const [localId, realId] of Object.entries(idMap)) {
        replaced = replaced.split(localId).join(realId)
      }
      if (replaced !== payloadStr) {
        item.payload = JSON.parse(replaced)
        console.log(`[SyncManager] Replaced local IDs in ${item.action} payload`)
      }
    }

    try {
      const result = await handler(item.payload)
      // Store the ID mapping if the handler returned a record with an id
      if (result?.id && item.id?.startsWith('local_')) {
        idMap[item.id] = result.id
        console.log(`[SyncManager] ID mapping: ${item.id} → ${result.id}`)
      }
      processed++
      console.log(`[SyncManager] ✓ Synced ${item.action} (${item.id})`)
    } catch (err: any) {
      const msg = String(err?.message || '')
      const isConnectionError = msg.includes("Can't reach database server") || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || err?.code === 'P1001' || err?.code === 'P1002'
      if (isConnectionError) {
        // DB unreachable — stop processing, keep all remaining items
        console.warn(`[SyncManager] DB unreachable, aborting sync. Will retry later.`)
        remaining.push(item, ...queue.slice(queue.indexOf(item) + 1))
        break
      }

      const lower = msg.toLowerCase()
      const isUniqueConstraint = err?.code === 'P2002'
      if (isUniqueConstraint) {
        console.warn(`[SyncManager] ✗ Dropping ${item.action} (${item.id}) — unique constraint violation (record likely already exists):`)
        console.warn(`[SyncManager]   Error: ${msg.slice(0, 500)}${err?.code ? ` [${err.code}]` : ''}`)
        processed++
        continue
      }
      const isFKError = lower.includes('foreign key constraint') || lower.includes('record to delete does not exist') || lower.includes('record to update not found') || lower.includes('required but not found') || err?.code === 'P2003' || err?.code === 'P2025'

      // Check for REAL unresolved local_ FK references (customerId, prescriptionId, orderId, etc.)
      // Exclude 'localId' and 'id' fields — those are metadata, not FK references
      const hasRealLocalReference = item.action.endsWith(':create') && (() => {
        const p = item.payload
        if (!p || typeof p !== 'object') return false
        const fkFields = ['customerId', 'prescriptionId', 'orderId', 'frameId', 'lensTypeId',
          'vlRightEyeLensTypeId', 'vlLeftEyeLensTypeId', 'vpRightEyeLensTypeId', 'vpLeftEyeLensTypeId',
          'userId', 'supplierId']
        return fkFields.some(f => typeof p[f] === 'string' && p[f].startsWith('local_'))
      })()
      const isUnresolvedLocalReference = hasRealLocalReference || lower.includes('unresolved local')

      if (isFKError && !isUnresolvedLocalReference) {
        console.warn(`[SyncManager] ✗ Dropping ${item.action} (${item.id}) — FK violation with no local refs:`)
        console.warn(`[SyncManager]   Error: ${msg.slice(0, 500)}${err?.code ? ` [${err.code}]` : ''}`)
        console.warn(`[SyncManager]   Payload:`, JSON.stringify(item.payload).slice(0, 800))
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
      } else {
        console.warn(`[SyncManager] ✗ Failed ${item.action} (${item.id}), retry ${item.retries}: ${msg}${err?.code ? ` [${err.code}]` : ''}`)
        remaining.push(item)
      }
    }
  }

  writeQueue([...otherUserItems, ...remaining])
  console.log(`[SyncManager] Done. Processed: ${processed}, Remaining: ${remaining.length}, OtherUsers: ${otherUserItems.length}`)
  return processed
}
