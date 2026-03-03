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
}

// ─── Queue file path ─────────────────────────────────────────────────────────
const getQueuePath = () => path.join(app.getPath('userData'), 'sync-queue.json')

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

// ─── Public API ──────────────────────────────────────────────────────────────

export function isOnline(): boolean {
  try {
    return net.isOnline()
  } catch {
    return true
  }
}

export function addToQueue(action: string, payload: any, localId: string): void {
  const queue = readQueue()
  queue.push({
    id: localId,
    action,
    payload,
    createdAt: new Date().toISOString(),
    retries: 0,
  })
  writeQueue(queue)
  console.log(`[SyncManager] Queued ${action} (${localId}). Queue size: ${queue.length}`)
}

export function getQueueLength(): number {
  return readQueue().length
}

/**
 * Process the offline queue. Accepts a handler map that maps action strings
 * to async functions that execute the actual Prisma operations.
 * Returns the number of successfully processed items.
 */
export async function processQueue(
  handlers: Record<string, (payload: any) => Promise<any>>
): Promise<number> {
  if (!isOnline()) {
    console.log('[SyncManager] Still offline, skipping queue processing.')
    return 0
  }

  const queue = readQueue()
  if (queue.length === 0) return 0

  console.log(`[SyncManager] Processing ${queue.length} queued items...`)
  let processed = 0
  const remaining: QueueItem[] = []

  for (const item of queue) {
    const handler = handlers[item.action]
    if (!handler) {
      console.warn(`[SyncManager] No handler for action: ${item.action}. Dropping item.`)
      continue
    }

    try {
      await handler(item.payload)
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
      item.retries++
      if (item.retries >= 5) {
        console.error(`[SyncManager] ✗ Dropped ${item.action} (${item.id}) after 5 retries: ${err.message}`)
      } else {
        console.warn(`[SyncManager] ✗ Failed ${item.action} (${item.id}), retry ${item.retries}: ${err.message}`)
        remaining.push(item)
      }
    }
  }

  writeQueue(remaining)
  console.log(`[SyncManager] Done. Processed: ${processed}, Remaining: ${remaining.length}`)
  return processed
}
