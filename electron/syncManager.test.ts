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
  // NOTE (locking actual behavior, not the comment above the implementation):
  // the exponent is capped via Math.min(retries, 8) BEFORE the outer
  // Math.min(5*60_000, ...) is applied, so the real ceiling is
  // 1000 * 2^8 = 256000ms (~4.27min), not 300000ms (5min) as the source
  // comment claims. The outer 5-minute clamp is dead code — it never
  // engages because 256000 < 300000 for every input. See plan NOTES.
  it('grows exponentially and caps at 256000ms (not the commented 5 minutes)', () => {
    expect(sm.backoffMs(1)).toBe(2000)
    expect(sm.backoffMs(2)).toBe(4000)
    expect(sm.backoffMs(3)).toBe(8000)
    expect(sm.backoffMs(100)).toBe(256000)
  })
})

describe('isTransientReason', () => {
  it('is true for connection/timeout style reasons', () => {
    expect(sm.isTransientReason('Handler timeout after 25000ms for orders:create (local_1)')).toBe(true)
    expect(sm.isTransientReason('Some error [P1001]')).toBe(true)
    expect(sm.isTransientReason('connect ECONNREFUSED 127.0.0.1:5432')).toBe(true)
    expect(sm.isTransientReason('write socket hang up')).toBe(true)
  })

  it('is false for data errors / undefined', () => {
    expect(sm.isTransientReason('Unique constraint failed on the fields')).toBe(false)
    expect(sm.isTransientReason('Validation error: missing field')).toBe(false)
    expect(sm.isTransientReason(undefined)).toBe(false)
  })
})

describe('addToQueue', () => {
  it('dedupes a second :create for the same id, keeping one item', () => {
    sm.addToQueue('orders:create', { total: 100 }, 'local_1')
    sm.addToQueue('orders:create', { total: 200 }, 'local_1')
    const queue = sm.getQueue()
    expect(queue.length).toBe(1)
    // payload from the first call is preserved — the dup create is ignored entirely
    expect(queue[0].payload.total).toBe(100)
  })

  it('updates the payload of an existing non-:create item for the same id', () => {
    sm.addToQueue('customers:update', { name: 'Alice' }, 'local_2')
    sm.addToQueue('customers:update', { name: 'Alice Updated' }, 'local_2')
    const queue = sm.getQueue()
    expect(queue.length).toBe(1)
    expect(queue[0].payload.name).toBe('Alice Updated')
  })
})

describe('processQueue happy path', () => {
  it('processes a create, maps local_ id to server id, and replaces refs in dependent items', async () => {
    sm.addToQueue('orders:create', { total: 50 }, 'local_order_1')
    sm.addToQueue('payments:create', { orderId: 'local_order_1', amount: 50 }, 'local_payment_1')

    let receivedPaymentPayload: any = null
    const processed = await sm.processQueue({
      'orders:create': async () => ({ id: 'srv_order_1' }),
      'payments:create': async (payload: any) => {
        receivedPaymentPayload = payload
        return { id: 'srv_payment_1' }
      },
    })

    expect(processed).toBe(2)
    expect(sm.getQueue().length).toBe(0)
    expect(receivedPaymentPayload).not.toBeNull()
    expect(receivedPaymentPayload.orderId).toBe('srv_order_1')
  })
})

describe('processQueue P2002 (unique constraint)', () => {
  it('drops the item, counts it as processed, and does not quarantine it', async () => {
    sm.addToQueue('orders:create', { total: 10 }, 'local_dup')

    const processed = await sm.processQueue({
      'orders:create': async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      },
    })

    expect(processed).toBe(1)
    expect(sm.getQueue().length).toBe(0)
    expect(sm.getQuarantine().length).toBe(0)
  })
})

describe('processQueue connection abort', () => {
  it('aborts the run and leaves the item queued with retries unchanged', async () => {
    sm.addToQueue('orders:create', { total: 10 }, 'local_conn')

    const processed = await sm.processQueue({
      'orders:create': async () => {
        throw Object.assign(new Error('Connection refused'), { code: 'P1001' })
      },
    })

    expect(processed).toBe(0)
    const queue = sm.getQueue()
    expect(queue.length).toBe(1)
    expect(queue[0].retries).toBe(0)
  })
})

describe('processQueue 20-retry quarantine vs drop', () => {
  // The real retry loop spaces attempts out via nextRetryAt/backoffMs, which would
  // make a 20-iteration test slow and timing-sensitive. Instead we pre-seed retries
  // to 19 by writing directly to the queue file, so the next failure is the 20th
  // and we can assert the terminal behavior without waiting out 19 backoffs.
  function seedQueueAtRetry19(items: sm.QueueItem[]) {
    const queuePath = path.join(__userData, 'sync-queue.json')
    fs.writeFileSync(queuePath, JSON.stringify(items, null, 2), 'utf-8')
  }

  it('quarantines a :create that exhausts 20 retries instead of dropping it', async () => {
    seedQueueAtRetry19([
      { id: 'local_pay_q', action: 'payments:create', payload: { amount: 5 }, createdAt: new Date().toISOString(), retries: 19 },
    ])

    const processed = await sm.processQueue({
      'payments:create': async () => {
        throw new Error('validation error: bad data')
      },
    })

    expect(processed).toBe(0)
    expect(sm.getQueue().length).toBe(0)
    const quarantine = sm.getQuarantine()
    expect(quarantine.length).toBe(1)
    expect(quarantine[0].id).toBe('local_pay_q')
    expect(quarantine[0].action).toBe('payments:create')
  })

  it('drops a non-:create item that exhausts 20 retries (no quarantine)', async () => {
    seedQueueAtRetry19([
      { id: 'local_cust_u', action: 'customers:update', payload: { name: 'X' }, createdAt: new Date().toISOString(), retries: 19 },
    ])

    const processed = await sm.processQueue({
      'customers:update': async () => {
        throw new Error('validation error: bad data')
      },
    })

    expect(processed).toBe(0)
    expect(sm.getQueue().length).toBe(0)
    expect(sm.getQuarantine().length).toBe(0)
  })
})

describe('requeueResolvedQuarantine', () => {
  function seedQuarantine(items: sm.QuarantineItem[]) {
    const qPath = path.join(__userData, 'sync-quarantine.json')
    fs.writeFileSync(qPath, JSON.stringify(items, null, 2), 'utf-8')
  }

  it('revives a :create item once its local_ FK resolves in idMap', () => {
    seedQuarantine([
      {
        id: 'local_payment_x', action: 'payments:create', payload: { orderId: 'local_x', amount: 20 },
        createdAt: new Date().toISOString(), retries: 20,
        quarantinedAt: new Date().toISOString(), reason: 'FK violation: foreign key constraint',
      },
    ])

    const revived = sm.requeueResolvedQuarantine({ local_x: 'srv_x' })

    expect(revived).toBe(1)
    expect(sm.getQuarantine().length).toBe(0)
    expect(sm.getQueue().some(i => i.id === 'local_payment_x')).toBe(true)
  })

  it('revives unconditionally when the quarantine reason is transient', () => {
    seedQuarantine([
      {
        id: 'local_payment_y', action: 'payments:create', payload: { orderId: 'local_unresolved', amount: 20 },
        createdAt: new Date().toISOString(), retries: 20,
        quarantinedAt: new Date().toISOString(), reason: "Can't reach database server [P1001]",
      },
    ])

    const revived = sm.requeueResolvedQuarantine({})

    expect(revived).toBe(1)
    expect(sm.getQuarantine().length).toBe(0)
    expect(sm.getQueue().some(i => i.id === 'local_payment_y')).toBe(true)
  })

  it('leaves a data-error item with no resolvable refs in quarantine', () => {
    seedQuarantine([
      {
        id: 'local_payment_z', action: 'payments:create', payload: { amount: 20 },
        createdAt: new Date().toISOString(), retries: 20,
        quarantinedAt: new Date().toISOString(), reason: 'validation error: bad data',
      },
    ])

    const revived = sm.requeueResolvedQuarantine({})

    expect(revived).toBe(0)
    expect(sm.getQuarantine().length).toBe(1)
    expect(sm.getQueue().length).toBe(0)
  })
})

describe('discardItem', () => {
  it('removes matching entries from both queue and quarantine and returns the count', () => {
    sm.addToQueue('orders:create', { total: 1 }, 'local_both')
    const qPath = path.join(__userData, 'sync-quarantine.json')
    fs.writeFileSync(qPath, JSON.stringify([
      { id: 'local_both', action: 'orders:create', payload: {}, createdAt: new Date().toISOString(), retries: 20, quarantinedAt: new Date().toISOString(), reason: 'x' },
    ], null, 2), 'utf-8')

    const removed = sm.discardItem('local_both')

    expect(removed).toBe(2)
    expect(sm.getQueue().length).toBe(0)
    expect(sm.getQuarantine().length).toBe(0)
  })
})
