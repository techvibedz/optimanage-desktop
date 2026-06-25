import { app, BrowserWindow, ipcMain, net, session, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import Module from 'node:module'
import { WebSocketServer, WebSocket } from 'ws'
import { logger, logInfo, logError } from './logger'
import { initMonitoring, captureException, closeMonitoring, getIpcTimings } from './monitoring-stub'
import * as localCache from './localCache'
import * as syncManager from './syncManager'

// ─── Prisma: redirect requires to extraResources in production ───────────────
if (app.isPackaged) {
  const resPath = process.resourcesPath
  // Set native query engine path
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(resPath, '.prisma', 'client', 'query_engine-windows.dll.node')

  // Monkey-patch Module._resolveFilename so require('@prisma/client') and
  // require('.prisma/client/default') find the copies in extraResources
  const origResolve = (Module as any)._resolveFilename
  ;(Module as any)._resolveFilename = function (request: string, ...args: any[]) {
    if (request === '@prisma/client' || request.startsWith('@prisma/client/')) {
      const target = path.join(resPath, request)
      return origResolve.call(this, target, ...args)
    }
    if (request === '.prisma/client/default' || request === '.prisma/client' || request.startsWith('.prisma/')) {
      const target = path.join(resPath, request)
      return origResolve.call(this, target, ...args)
    }
    return origResolve.call(this, request, ...args)
  }
}

// ─── Env Config ───────────────────────────────────────────────────────────────
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env.production')
  : path.join(app.getAppPath(), '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  })
}

// ─── Prisma Client ───────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()


// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OptiManage Desktop',
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    backgroundColor: '#f0f5fa',
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // ── Monitoring ──────────────────────────────────────────────────────────
  const appVersion = app.getVersion()
  initMonitoring(appVersion)
  logInfo('App starting', { version: appVersion, electron: process.versions.electron, node: process.versions.node, platform: process.platform })

  process.on('uncaughtException', (err) => {
    captureException(err, { type: 'uncaughtException' })
    logError('Uncaught exception', err)
  })
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    captureException(err, { type: 'unhandledRejection' })
    logError('Unhandled rejection', err)
  })

  // Allow camera/mic for the in-app barcode scanner (local app, trusted origin)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') return callback(true)
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'media') return true
    return false
  })

  registerIpcHandlers()
  registerAiHandlers()

  // Seed a default offline user so the app can be used without first going online
  ;(async () => {
    try {
      const d = localCache.getDb()
      const count = (d.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0
      if (count === 0) {
        const hashedPassword = await bcrypt.hash('admin123', 10)
        const now = new Date().toISOString()
        localCache.cacheUser({
          id: 'local_default_admin',
          email: 'admin@optimanage.local',
          name: 'Offline Admin',
          password: hashedPassword,
          role: 'ADMIN',
          createdAt: now,
          updatedAt: now,
        })
        console.log('[LocalCache] Seeded default offline user: admin@optimanage.local / admin123')
      }
    } catch (err: any) {
      console.warn('[LocalCache] Seed failed:', err?.message || err)
    }
  })()

  // ── Monitoring IPC ──────────────────────────────────────────────────────
  ipcMain.handle('monitoring:timings', async () => getIpcTimings())

  createWindow()

  // ── Auto Update (React UI — no native dialogs) ──────────────────────────
  if (app.isPackaged) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'techvibedz',
      repo: 'optimanage-desktop',
    })

    const sendStatus = (type: string, data?: any) => {
      mainWindow?.webContents.send('updater:status', { type, data })
    }

    autoUpdater.on('checking-for-update', () => {
      console.log('Auto-update: checking...')
      sendStatus('checking-for-update')
    })

    autoUpdater.on('update-available', (info: any) => {
      console.log('Auto-update: update available', info.version)
      sendStatus('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      })
    })

    autoUpdater.on('update-not-available', (info: any) => {
      console.log('Auto-update: up to date. Current:', app.getVersion(), 'Latest:', info.version)
      sendStatus('update-not-available', { version: info.version })
    })

    autoUpdater.on('download-progress', (progress: any) => {
      sendStatus('download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      })
    })

    autoUpdater.on('update-downloaded', (info: any) => {
      console.log('Auto-update: downloaded', info.version)
      sendStatus('update-downloaded', { version: info.version })
    })

    autoUpdater.on('error', (err: any) => {
      console.error('Auto-update error:', err.message)
      sendStatus('error', { message: err.message })
    })

    // Check for updates after 5 seconds (avoid blocking startup)
    setTimeout(() => {
      console.log('Auto-update: initiating check. App version:', app.getVersion())
      autoUpdater.checkForUpdates().catch((err: any) => {
        console.error('Auto-update check failed:', err.message)
      })
    }, 5000)
  }

  // ── Internet Connectivity Monitor ──────────────────────────────────────────
  // Poll net.isOnline() every 3s and push changes to the renderer
  let lastOnlineStatus = true
  const checkConnectivity = () => {
    try {
      const online = net.isOnline()
      if (online !== lastOnlineStatus) {
        lastOnlineStatus = online
        mainWindow?.webContents.send('connectivity:status', online)
        console.log(`[Connectivity] Status changed: ${online ? 'ONLINE' : 'OFFLINE'}`)
        if (online) {
          markDbReachable()
          hydrateCurrentUserCache('connectivity-restored').catch(() => {})
        } else {
          markDbUnreachable()
        }
      }
    } catch { /* ignore */ }
  }
  setInterval(checkConnectivity, 3000)
  // Initial check after a short delay (let the window load first)
  setTimeout(() => {
    checkConnectivity()
    hydrateCurrentUserCache('app-start-session-restore', true).catch(() => {})
  }, 1000)

  ipcMain.handle('connectivity:check', () => {
    try { return net.isOnline() } catch { return true }
  })

  // ── Sync queue status for the renderer ─────────────────────────────────
  ipcMain.handle('sync:status', () => ({
    pendingItems: currentUser?.id ? syncManager.getQueueLengthForUser(currentUser.id) : syncManager.getQueueLength(),
    quarantinedItems: syncManager.getQuarantineLength(),
    isOnline: syncManager.isOnline(),
  }))

  // ── Sync Repair: diagnose what is stuck and why ────────────────────────
  // Returns pending + quarantined items in plain terms, plus, for any payment
  // whose order link is broken, the offline order's details and candidate
  // server orders so the user can relink it (see sync:relinkOrder).
  ipcMain.handle('sync:diagnose', async () => {
    try {
      const uid = currentUser?.id
      const all = [
        ...syncManager.getQueue().map((i: any) => ({ ...i, _q: false })),
        ...syncManager.getQuarantine().map((i: any) => ({ ...i, _q: true })),
      ].filter(i => !i.userId || !uid || i.userId === uid)

      const custName = (c: any) => c ? [c.firstName, c.lastName].filter(Boolean).join(' ').trim() : ''
      const items: any[] = []
      const unresolvedPayments: any[] = []

      for (const it of all) {
        const base = {
          id: it.id, action: it.action, quarantined: it._q,
          reason: it.reason || null, retries: it.retries || 0, createdAt: it.createdAt,
        }
        if (it.action === 'payments:create') {
          const oid = it.payload?.orderId
          const isLocal = typeof oid === 'string' && oid.startsWith('local_')
          const mapping = isLocal ? localCache.getLocalIdMapping(oid) : null
          const resolved = !isLocal || !!mapping
          items.push({ ...base, kind: 'payment', amount: it.payload?.amount, resolved })
          if (isLocal && !mapping) {
            const lo = localCache.getLocalOrder(oid)
            let candidates: any[] = []
            let serverCustomerId: string | null = lo?.customerId || null
            if (typeof serverCustomerId === 'string' && serverCustomerId.startsWith('local_')) {
              serverCustomerId = localCache.getLocalIdMapping(serverCustomerId)
            }
            if (uid && isDbAvailable()) {
              try {
                // Prefer the order's own customer; if the local order row is gone
                // (mapping lost AND record deleted), fall back to recent orders so
                // the user can still pick the right one manually.
                const where: any = serverCustomerId
                  ? { userId: uid, customerId: serverCustomerId }
                  : { userId: uid }
                const rows = await prisma.order.findMany({
                  where,
                  select: { id: true, orderNumber: true, totalPrice: true, createdAt: true, customer: { select: { firstName: true, lastName: true } } },
                  orderBy: { createdAt: 'desc' }, take: serverCustomerId ? 25 : 60,
                })
                candidates = rows.map((r: any) => ({ id: r.id, orderNumber: r.orderNumber, totalPrice: r.totalPrice, createdAt: r.createdAt, customerName: custName(r.customer) }))
              } catch { /* offline — no candidates */ }
            }
            unresolvedPayments.push({
              queueId: it.id, quarantined: it._q, amount: it.payload?.amount,
              paymentMethod: it.payload?.paymentMethod, paymentDate: it.payload?.paymentDate,
              localOrderId: oid,
              localOrder: lo ? { orderNumber: lo.orderNumber, totalPrice: lo.totalPrice, createdAt: lo.createdAt, customerName: custName(lo.customer) } : null,
              candidates,
            })
          }
        } else if (it.action === 'orders:create') {
          const linked = !!localCache.getLocalIdMapping(it.id)
          items.push({ ...base, kind: 'order', orderNumber: it.payload?.orderNumber, resolved: linked })
        } else {
          items.push({ ...base, kind: it.action.split(':')[0], resolved: true })
        }
      }

      return {
        pendingItems: uid ? syncManager.getQueueLengthForUser(uid) : syncManager.getQueueLength(),
        quarantinedItems: syncManager.getQuarantineLength(),
        isOnline: syncManager.isOnline(),
        items, unresolvedPayments,
      }
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  // ── Sync Repair: manually relink an offline order to its server order ───
  // Writes the lost local_→server mapping the user confirmed, re-queues any
  // quarantined items that referenced it, and kicks a sync pass. Never creates
  // or edits an order — it only restores the link.
  ipcMain.handle('sync:relinkOrder', async (_e, params: { localOrderId: string; serverOrderId: string }) => {
    try {
      const { localOrderId, serverOrderId } = params || ({} as any)
      if (!localOrderId || !serverOrderId) return { error: 'Missing localOrderId or serverOrderId' }
      if (isDbAvailable()) {
        const exists = await prisma.order.findUnique({ where: { id: serverOrderId }, select: { id: true } })
        if (!exists) return { error: 'Selected server order no longer exists' }
      }
      localCache.cacheLocalIdMapping(localOrderId, serverOrderId, 'order')
      // Re-queue any quarantined items tied to this order (the order-create itself
      // and any payments pointing at it) so they retry with the restored link.
      let requeued = 0
      for (const q of syncManager.getQuarantine()) {
        if (q.id === localOrderId || (typeof q.payload?.orderId === 'string' && q.payload.orderId === localOrderId)) {
          if (syncManager.requeueFromQuarantine(q.id)) requeued++
        }
      }
      console.log(`[Sync] Relinked ${localOrderId} → ${serverOrderId}; re-queued ${requeued} quarantined item(s)`)
      processSyncQueue()
      return { success: true, requeued }
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  // ── Sync Repair: manually discard a stuck item ─────────────────────────
  // Removes a single stuck queue/quarantine item the user has confirmed is fine
  // (record already on the server, or no longer needed). This is the deliberate
  // escape hatch for items that stay stuck but don't actually need to sync —
  // the renderer is responsible for confirming with the user first, and for
  // warning loudly before discarding financial data (payments).
  ipcMain.handle('sync:discardItem', async (_e, params: { id: string; action?: string }) => {
    try {
      const { id, action } = params || ({} as any)
      if (!id) return { error: 'Missing id' }
      const removed = syncManager.discardItem(id, action)
      console.log(`[Sync] Manually discarded ${removed} stuck item(s) for ${id}${action ? ` (${action})` : ''}`)
      return { success: true, removed }
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  // ── Sync Repair: force a sync pass now ─────────────────────────────────
  ipcMain.handle('sync:retryNow', async () => {
    // Move everything out of quarantine back into the live queue, then process.
    let requeued = 0
    for (const q of syncManager.getQuarantine()) {
      if (syncManager.requeueFromQuarantine(q.id)) requeued++
    }
    processSyncQueue()
    return { success: true, requeued }
  })

  ipcMain.handle('sync:hydrate', async () => {
    const ok = await hydrateCurrentUserCache('manual-sync-hydrate', true)
    return {
      success: ok,
      pendingItems: currentUser?.id ? syncManager.getQueueLengthForUser(currentUser.id) : syncManager.getQueueLength(),
      isOnline: syncManager.isOnline(),
    }
  })

  // When connectivity is restored, trigger sync processing
  let syncInProgress = false
  let syncStartedAt = 0
  // Safety net: if a run somehow never releases the in-progress flag (an
  // unforeseen hang outside the per-item timeout), this watchdog reclaims it so
  // sync can never wedge permanently until the app restarts.
  const SYNC_WATCHDOG_MS = 180_000
  async function processSyncQueue() {
    if (syncInProgress) {
      if (syncStartedAt && Date.now() - syncStartedAt > SYNC_WATCHDOG_MS) {
        console.warn(`[Sync] Watchdog: a run has been stuck for ${Math.round((Date.now() - syncStartedAt) / 1000)}s — forcing recovery`)
        syncInProgress = false
      } else {
        return
      }
    }
    if (!isDbAvailable()) return
    syncInProgress = true
    syncStartedAt = Date.now()
    // The whole body runs inside try/finally so the flag is ALWAYS released —
    // even if any step throws. A leaked flag was the main cause of sync silently
    // wedging and "never syncing" until restart.
    try {
      // Ensure Prisma connection is fresh after offline period.
      // Every pre-flight step is timeout-bounded: a half-open socket after an
      // offline→online flip can make these hang indefinitely, which used to
      // wedge the whole sync until the watchdog fired.
      try { await syncManager.withTimeout(prisma.$connect(), 10_000, 'prisma.$connect') } catch (e: any) {
        console.warn('[Sync] Prisma reconnect failed, skipping sync:', e?.message)
        markDbUnreachable()
        return
      }
      // Verify DB is actually queryable with a lightweight check
      try {
        await syncManager.withTimeout(prisma.$queryRaw`SELECT 1`, 10_000, 'db-probe')
        markDbReachable()
      } catch (e: any) {
        console.warn('[Sync] DB not queryable, skipping sync:', e?.message?.slice(0, 200))
        markDbUnreachable()
        return
      }
      try { await syncManager.withTimeout(repairSessionUserId(), 15_000, 'repairSessionUserId') } catch (e: any) { console.warn('[Sync] repairSessionUserId failed (continuing):', e?.message || e) }
      if (!currentUser) return
      try { queueUnsyncedLocalRecords(currentUser.id) } catch (e: any) { console.warn('[Sync] queueUnsyncedLocalRecords failed (continuing):', e?.message || e) }
      if ((currentUser?.id ? syncManager.getQueueLengthForUser(currentUser.id) : syncManager.getQueueLength()) === 0) return
      const handlers: Record<string, (payload: any) => Promise<any>> = {
        'customers:create': async (p) => {
          // Resolve userId from server — try multiple strategies
          let resolvedUserId: string | null = null
          if (currentUser?.email) {
            try {
              const serverUser = await prisma.user.findUnique({ where: { email: currentUser.email }, select: { id: true } })
              if (serverUser) resolvedUserId = serverUser.id
              else console.warn(`[Sync] No server user found for email ${currentUser.email}`)
            } catch (e: any) {
              console.warn(`[Sync] userId lookup failed: ${e?.message || e}`)
            }
          }
          // Fallback: use currentUser.id (repaired by repairSessionUserId earlier)
          if (!resolvedUserId && currentUser?.id) resolvedUserId = currentUser.id
          // Last resort: queued value
          if (!resolvedUserId) resolvedUserId = p.userId
          if (!resolvedUserId) throw new Error('No userId resolved — cannot sync customer')

          const fields: any = pickFields(p, CUSTOMER_FIELDS)
          fields.userId = resolvedUserId
          // Preserve the original offline creation date — otherwise Prisma's
          // @default(now()) stamps the sync day instead of the creation day.
          if (p.createdAt) fields.createdAt = new Date(p.createdAt)
          // Strip any stale date strings that Prisma might reject
          if (fields.dateOfBirth === '' || fields.dateOfBirth === 'null') delete fields.dateOfBirth
          console.log('[Sync] Creating customer with userId:', fields.userId, 'sessionId:', currentUser?.id, 'queuedId:', p.userId)
          const data = await prisma.customer.create({ data: fields })
          if (p.localId) {
            localCache.cacheLocalIdMapping(p.localId, data.id, 'customer')
            localCache.deleteSyncedLocalCustomer(p.localId)
          }
          return data
        },
        'customers:update': (p) => prisma.customer.update({ where: { id: p.id }, data: pickFields(p.updates, CUSTOMER_FIELDS) }),
        'customers:delete': (p) => prisma.customer.delete({ where: { id: p.id } }),
        'orders:create': async (p) => {
          // Idempotency: if this offline order was already synced in a prior cycle
          // (e.g. a crash left it in the queue), adopt the existing server record
          // instead of creating a second one with a fresh number.
          if (p.localId) {
            const alreadySynced = localCache.getLocalIdMapping(p.localId)
            if (alreadySynced) {
              console.log(`[Sync] Order ${p.localId} already synced → ${alreadySynced}, skipping`)
              localCache.deleteLocalOrder(p.localId)
              return { id: alreadySynced }
            }
          }
          const picked: any = pickFields(p, ORDER_FIELDS)
          // Preserve the original offline creation date — otherwise Prisma's
          // @default(now()) stamps the sync day instead of the creation day,
          // making orders created offline appear on the day they synced.
          if (p.createdAt) picked.createdAt = new Date(p.createdAt)
          // Resolve userId from server with fallback chain
          let resolvedUserId: string | null = null
          if (currentUser?.email) {
            try {
              const serverUser = await prisma.user.findUnique({ where: { email: currentUser.email }, select: { id: true } })
              if (serverUser) resolvedUserId = serverUser.id
              else console.warn(`[Sync] No server user found for email ${currentUser.email}`)
            } catch (e: any) {
              console.warn(`[Sync] userId lookup failed for order: ${e?.message || e}`)
            }
          }
          if (!resolvedUserId && currentUser?.id) resolvedUserId = currentUser.id
          if (!resolvedUserId) resolvedUserId = picked.userId
          if (!resolvedUserId) throw new Error('No userId resolved — cannot sync order')
          picked.userId = resolvedUserId
          if (typeof picked.customerId === 'string' && picked.customerId.startsWith('local_')) {
            const mappedCustomerId = localCache.getLocalIdMapping(picked.customerId)
            if (mappedCustomerId) picked.customerId = mappedCustomerId
          }
          if (typeof picked.prescriptionId === 'string' && picked.prescriptionId.startsWith('local_')) {
            const mappedPrescriptionId = localCache.getLocalIdMapping(picked.prescriptionId)
            if (mappedPrescriptionId) picked.prescriptionId = mappedPrescriptionId
          }
          if (typeof picked.customerId === 'string' && picked.customerId.startsWith('local_')) throw new Error(`Unresolved local customer reference: ${picked.customerId}`)
          // If prescription is still local_, try to sync it from local SQLite inline
          if (typeof picked.prescriptionId === 'string' && picked.prescriptionId.startsWith('local_')) {
            const localRx = localCache.getLocalPrescription(picked.prescriptionId)
            if (localRx) {
              const rxFields: any = pickFields({ ...localRx, hasVLData: Boolean(localRx.hasVLData), hasVPData: Boolean(localRx.hasVPData) }, PRESCRIPTION_FIELDS)
              // Resolve prescription's customerId from local_ to server ID
              if (typeof rxFields.customerId === 'string' && rxFields.customerId.startsWith('local_')) {
                const mappedCust = localCache.getLocalIdMapping(rxFields.customerId)
                rxFields.customerId = mappedCust || picked.customerId
              }
              if (localRx.createdAt) rxFields.createdAt = new Date(localRx.createdAt)
              console.log(`[Sync] Inline-syncing prescription ${picked.prescriptionId} for order`)
              const rxResult = await prisma.prescription.create({ data: rxFields })
              localCache.cacheLocalIdMapping(picked.prescriptionId, rxResult.id, 'prescription')
              picked.prescriptionId = rxResult.id
            } else {
              console.warn(`[Sync] Prescription ${picked.prescriptionId} not found locally — creating order without it`)
              picked.prescriptionId = null
            }
          }
          console.log('[Sync] Creating order for userId:', picked.userId, 'customerId:', picked.customerId)
          const depositAmount = Number(picked.depositAmount || 0)
          const frameId = picked.frameId
          const localCustomerId = typeof p.customerId === 'string' && p.customerId.startsWith('local_') ? p.customerId : null
          const localPrescriptionId = typeof p.prescriptionId === 'string' && p.prescriptionId.startsWith('local_') ? p.prescriptionId : null

          // Preserve the order number the user already wrote on the job offline.
          // First check whether that number is already taken on the server:
          //  • same number + same customer  → this order was already synced; adopt it (idempotent).
          //  • same number + different order → genuine collision (e.g. a second device);
          //    keep this order but let the server assign a fresh number so nothing is lost.
          const preferredNumber: string | undefined = picked.orderNumber
          if (preferredNumber) {
            const existingByNumber = await prisma.order.findUnique({
              where: { orderNumber_userId: { orderNumber: preferredNumber, userId: picked.userId } },
              select: { id: true, customerId: true },
            })
            if (existingByNumber) {
              if (existingByNumber.customerId === picked.customerId) {
                console.log(`[Sync] Order ${preferredNumber} already on server (${existingByNumber.id}), adopting`)
                if (p.localId) {
                  localCache.cacheLocalIdMapping(p.localId, existingByNumber.id, 'order')
                  localCache.deleteLocalOrder(p.localId)
                }
                return existingByNumber
              }
              // Number is taken by a DIFFERENT customer's order. Before assuming this
              // is a brand-new order (and creating one under a fresh number), check
              // whether THIS offline order already exists on the server under a
              // changed number — otherwise the old renumber bug would make us create
              // a duplicate. Adopt the twin if found.
              const twin = await findServerOrderTwin({
                userId: picked.userId, customerId: picked.customerId,
                orderNumber: preferredNumber, totalPrice: picked.totalPrice, createdAt: picked.createdAt,
              })
              if (twin) {
                console.log(`[Sync] Offline order matches existing server order ${twin.orderNumber} (${twin.id}) — adopting instead of duplicating`)
                if (p.localId) {
                  localCache.cacheLocalIdMapping(p.localId, twin.id, 'order')
                  localCache.deleteLocalOrder(p.localId)
                }
                return twin
              }
              console.warn(`[Sync] Order number ${preferredNumber} is taken by a different order — assigning a fresh number`)
              picked.orderNumber = undefined
            }
          }

          const data = await createOrderSafe(picked, { preferredNumber: picked.orderNumber })
          if (depositAmount > 0) {
            // Stamp the deposit with the order's original creation date so
            // revenue lands on the correct day, not the sync day.
            const depositDate = picked.createdAt || data.createdAt
            // Deterministic receipt key (one deposit per order) makes this insert
            // idempotent: if a prior attempt created the order but this handler was
            // retried, the deposit is recognised instead of inserted twice.
            const depositReceipt = `DEP-${data.id}`
            const existingDeposit = await prisma.payment.findUnique({ where: { receiptNumber: depositReceipt }, select: { id: true } })
            if (!existingDeposit) {
              await prisma.payment.create({
                data: { orderId: data.id, amount: depositAmount, paymentMethod: 'cash', receiptNumber: depositReceipt, reference: 'Initial deposit', paymentDate: depositDate, createdAt: depositDate, userId: picked.userId }
              })
            }
          }
          if (frameId) {
            await prisma.frame.updateMany({ where: { id: frameId, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } })
          }
          if (p.localId) {
            localCache.cacheLocalIdMapping(p.localId, data.id, 'order')
            localCache.deleteLocalOrder(p.localId)
            if (localPrescriptionId) localCache.deleteSyncedLocalPrescription(localPrescriptionId)
            if (localCustomerId) localCache.deleteSyncedLocalCustomer(localCustomerId)
          }
          return data
        },
        'orders:update': (p) => {
          const upd: any = pickFields(p.updates, ORDER_FIELDS)
          // Convert flat relation IDs back to Prisma connect syntax
          for (const rel of ['vlRightEyeLensType', 'vlLeftEyeLensType', 'vpRightEyeLensType', 'vpLeftEyeLensType', 'frame', 'lensType']) {
            const idKey = `${rel}Id`
            if (upd[idKey] !== undefined) {
              upd[rel] = upd[idKey] ? { connect: { id: upd[idKey] } } : { disconnect: true }
              delete upd[idKey]
            }
          }
          return prisma.order.update({ where: { id: p.id }, data: upd })
        },
        'orders:delete': (p) => prisma.order.delete({ where: { id: p.id } }),
        'prescriptions:create': async (p) => {
          if (typeof p.customerId === 'string' && p.customerId.startsWith('local_')) {
            const mappedCustomerId = localCache.getLocalIdMapping(p.customerId)
            if (mappedCustomerId) p.customerId = mappedCustomerId
          }
          if (typeof p.customerId === 'string' && p.customerId.startsWith('local_')) throw new Error(`Unresolved local customer reference: ${p.customerId}`)
          const rxData: any = pickFields(p, PRESCRIPTION_FIELDS)
          if (p.createdAt) rxData.createdAt = new Date(p.createdAt)
          const data = await prisma.prescription.create({ data: rxData })
          if (p.localId) {
            localCache.cacheLocalIdMapping(p.localId, data.id, 'prescription')
            localCache.deleteSyncedLocalPrescription(p.localId)
          }
          return data
        },
        'prescriptions:update': (p) => prisma.prescription.update({ where: { id: p.id }, data: pickFields(p.updates, PRESCRIPTION_FIELDS) }),
        'prescriptions:delete': (p) => prisma.prescription.delete({ where: { id: p.id } }),
        'frames:create': async (p) => {
          if (currentUser && p.userId !== currentUser.id) {
            console.warn(`[Sync] Fixing userId in queued frame: ${p.userId} → ${currentUser.id}`)
            p.userId = currentUser.id
          }
          const data = await prisma.frame.create({ data: pickFields(p, FRAME_FIELDS) as any })
          if (p.localId) localCache.deleteLocalFrame(p.localId)
          return data
        },
        'frames:update': (p) => prisma.frame.update({ where: { id: p.id }, data: pickFields(p.updates, FRAME_FIELDS) }),
        'frames:delete': (p) => prisma.frame.delete({ where: { id: p.id } }),
        'lensTypes:create': async (p) => {
          if (currentUser && p.userId !== currentUser.id) {
            console.warn(`[Sync] Fixing userId in queued lensType: ${p.userId} → ${currentUser.id}`)
            p.userId = currentUser.id
          }
          const data = await prisma.lensType.create({ data: pickFields(p, LENS_TYPE_FIELDS) as any })
          if (p.localId) localCache.deleteLocalLensType(p.localId)
          return data
        },
        'lensTypes:update': (p) => prisma.lensType.update({ where: { id: p.id }, data: pickFields(p.updates, LENS_TYPE_FIELDS) }),
        'lensTypes:delete': (p) => prisma.lensType.delete({ where: { id: p.id } }),
        'contactLenses:create': async (p) => {
          if (currentUser && p.userId !== currentUser.id) {
            console.warn(`[Sync] Fixing userId in queued contactLens: ${p.userId} → ${currentUser.id}`)
            p.userId = currentUser.id
          }
          const data = await prisma.contactLens.create({ data: pickFields(p, CONTACT_LENS_FIELDS) as any })
          if (p.localId) localCache.deleteLocalContactLens(p.localId)
          return data
        },
        'contactLenses:update': (p) => prisma.contactLens.update({ where: { id: p.id }, data: pickFields(p.updates, CONTACT_LENS_FIELDS) }),
        'contactLenses:delete': (p) => prisma.contactLens.delete({ where: { id: p.id } }),
        'payments:create': async (p) => {
          if (currentUser && p.userId !== currentUser.id) {
            console.warn(`[Sync] Fixing userId in queued payment: ${p.userId} → ${currentUser.id}`)
            p.userId = currentUser.id
          }
          const picked: any = pickFields(p, PAYMENT_FIELDS)
          if (p.createdAt) picked.createdAt = new Date(p.createdAt)
          // Use the stable receiptNumber minted when the payment was created offline.
          // Only mint a fresh one for legacy queue items that predate this fix —
          // never regenerate per attempt, or a retried insert would duplicate money.
          if (!picked.receiptNumber) picked.receiptNumber = `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          if (typeof picked.orderId === 'string' && picked.orderId.startsWith('local_')) {
            const mappedOrderId = localCache.getLocalIdMapping(picked.orderId)
            if (mappedOrderId) picked.orderId = mappedOrderId
          }
          if (typeof picked.orderId === 'string' && picked.orderId.startsWith('local_')) throw new Error(`Unresolved local order reference: ${picked.orderId}`)
          // Idempotency: if a payment with this receipt already synced (e.g. a prior
          // attempt's insert landed but its response was lost), adopt it instead of
          // inserting a second row and re-applying the balance change.
          const existingPayment = await prisma.payment.findUnique({ where: { receiptNumber: picked.receiptNumber }, select: { id: true } })
          if (existingPayment) {
            console.log(`[Sync] Payment ${picked.receiptNumber} already on server (${existingPayment.id}), adopting`)
            if (p.localId) localCache.deleteLocalPayment(p.localId)
            return existingPayment
          }
          // Insert the payment and adjust the order balance atomically, so a retry
          // can never leave a payment recorded without its balance update (or vice-versa).
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
          if (p.localId) localCache.deleteLocalPayment(p.localId)
          return data
        },
        'payments:delete': (p) => prisma.payment.delete({ where: { id: p.id } }),
        'expenses:create': async (p) => {
          if (currentUser && p.userId !== currentUser.id) {
            console.warn(`[Sync] Fixing userId in queued expense: ${p.userId} → ${currentUser.id}`)
            p.userId = currentUser.id
          }
          const fields: any = pickFields(p, EXPENSE_FIELDS)
          if (fields.date && typeof fields.date === 'string') fields.date = new Date(fields.date)
          if (p.createdAt) fields.createdAt = new Date(p.createdAt)
          const data = await prisma.expense.create({ data: fields })
          if (p.localId) localCache.deleteLocalExpense(p.localId)
          localCache.cacheExpense(data)
          return data
        },
        'expenses:update': (p) => {
          const updates: any = pickFields(p.updates, EXPENSE_FIELDS)
          if (updates.date && typeof updates.date === 'string') updates.date = new Date(updates.date)
          return prisma.expense.update({ where: { id: p.id }, data: updates })
        },
        'expenses:delete': (p) => prisma.expense.delete({ where: { id: p.id } }),
        'settings:update': (p) => prisma.setting.update({ where: { userId: p.userId }, data: p.updates }),
      }
      // Heal links that the old buggy sync lost: re-establish local_→server order
      // mappings so orphaned offline payments can resolve their order. Conservative
      // (only links on a confident match); never creates or edits an order.
      if (currentUser?.id) {
        try { await syncManager.withTimeout(reconcileOrphanedOrderRefs(currentUser.id), 30_000, 'reconcileOrphanedOrderRefs') }
        catch (e: any) { console.warn('[Sync] Reconcile pass failed:', e?.message || e) }
      }
      const count = await syncManager.processQueue(handlers, localCache.getAllLocalIdMappings(), currentUser?.id)
      if (count > 0) {
        console.log(`[Sync] Processed ${count} queued items — re-hydrating local cache`)
        if (currentUser) {
          try {
            await syncManager.withTimeout(localCache.hydrateCache(prisma, currentUser.id), 120_000, 'post-sync hydrate')
            console.log('[Sync] Local cache re-hydrated after sync')
            mainWindow?.webContents.send('sync:status', {
              pendingItems: currentUser?.id ? syncManager.getQueueLengthForUser(currentUser.id) : syncManager.getQueueLength(),
              isOnline: true,
            })
          } catch (err: any) {
            console.warn('[Sync] Re-hydrate after sync failed:', err?.message || err)
          }
        } else {
          mainWindow?.webContents.send('sync:status', {
            pendingItems: syncManager.getQueueLength(),
            isOnline: true,
          })
        }
      }
    } catch (err: any) {
      console.warn('[Sync] Queue processing failed:', err?.message || err)
    } finally {
      syncInProgress = false
    }
  }
  setInterval(processSyncQueue, 5000)

  // ── Mobile Scanner Bridge ──────────────────────────────────────────────────
  // Lightweight WebSocket server (Node `ws`) bound to the LAN so an Expo
  // companion app on a phone can stream scanned barcodes into this Electron
  // app. Pairing is one-shot via QR code: the renderer reads
  // `mobileScanner:getPairingInfo`, displays a QR with `ws://<lan-ip>:8765/?token=<rand>`,
  // and the phone connects to that URL. Anything else is rejected.
  //
  // The pairing token is persisted to `userData/mobile-scanner.json` so phones
  // remain paired across desktop restarts; rotating it via the modal kicks
  // every client and writes a fresh token.
  const MOBILE_SCANNER_PORT = 8765
  // Per-client scan rate cap (sliding 1-second window).
  const SCAN_RATE_LIMIT = 12
  const tokenFile = path.join(app.getPath('userData'), 'mobile-scanner.json')

  const loadOrCreateToken = (): string => {
    try {
      if (fs.existsSync(tokenFile)) {
        const raw = fs.readFileSync(tokenFile, 'utf8')
        const parsed = JSON.parse(raw) as { token?: string }
        if (parsed.token && /^[a-f0-9]{8,64}$/i.test(parsed.token)) {
          console.log('[MobileScanner] Loaded persisted pairing token')
          return parsed.token
        }
      }
    } catch (err: any) {
      console.warn('[MobileScanner] Failed to read token file:', err.message)
    }
    const fresh = crypto.randomBytes(8).toString('hex')
    try {
      fs.writeFileSync(tokenFile, JSON.stringify({ token: fresh }), 'utf8')
      console.log('[MobileScanner] Generated and persisted new pairing token')
    } catch (err: any) {
      console.warn('[MobileScanner] Failed to persist token (will use in-memory only):', err.message)
    }
    return fresh
  }

  const writeToken = (token: string): void => {
    try { fs.writeFileSync(tokenFile, JSON.stringify({ token }), 'utf8') }
    catch (err: any) { console.warn('[MobileScanner] Failed to persist token:', err.message) }
  }

  let mobileScannerToken = loadOrCreateToken()
  let mobileScannerServerError: string | null = null
  // Track per-client scan timestamps for rate limiting.
  const scanWindow = new WeakMap<WebSocket, number[]>()
  const mobileScannerClients = new Set<WebSocket>()

  const getLanIPv4 = (): string => {
    const VIRTUAL_PATTERNS = /vmware|virtualbox|docker|hyper-v|vethernet|bluetooth|teredo|tap-windows|wintun|zerotier|tailscale|nordlynx|pangp|loopback|tunnel|pseudo/i
    const PREFERRED_PATTERNS = /wi-fi|wifi|wlan|ethernet|eth|local area/i

    const ifaces = os.networkInterfaces()
    const candidates: { name: string; address: string; preferred: boolean }[] = []

    for (const [name, list] of Object.entries(ifaces)) {
      if (!list) continue
      if (VIRTUAL_PATTERNS.test(name)) continue // skip virtual adapters
      const preferred = PREFERRED_PATTERNS.test(name)
      for (const net of list) {
        const isV4 = (net.family as any) === 'IPv4' || (net.family as any) === 4
        if (isV4 && !net.internal && net.address && !net.address.startsWith('127.')) {
          candidates.push({ name, address: net.address, preferred })
        }
      }
    }

    // Prefer real hardware (Wi-Fi/Ethernet), then fall back to any non-virtual.
    const preferred = candidates.find((c) => c.preferred)
    if (preferred) return preferred.address
    if (candidates.length > 0) return candidates[0].address
    return '127.0.0.1'
  }

  const broadcastClientCount = () => {
    mainWindow?.webContents.send('mobileScanner:clientChange', mobileScannerClients.size)
  }

  const wss = new WebSocketServer({ host: '0.0.0.0', port: MOBILE_SCANNER_PORT })
  wss.on('connection', (ws, req) => {
    // Validate ?token= query parameter against the active token.
    let providedToken = ''
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
      providedToken = url.searchParams.get('token') || ''
    } catch { providedToken = '' }

    if (providedToken !== mobileScannerToken) {
      console.log('[MobileScanner] Rejected connection: bad token')
      try { ws.close(4001, 'invalid token') } catch { /* ignore */ }
      return
    }

    mobileScannerClients.add(ws)
    scanWindow.set(ws, [])
    console.log(`[MobileScanner] Client paired (${mobileScannerClients.size} total)`)
    broadcastClientCount()

    ws.on('message', (raw) => {
      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })) } catch { /* ignore */ }
        return
      }

      if (msg.type === 'hello') {
        console.log('[MobileScanner] Hello from', msg.client || 'unknown', 'v' + (msg.version || '?'))
        try { ws.send(JSON.stringify({ type: 'welcome', server: 'optimanage-desktop', version: app.getVersion() })) } catch { /* ignore */ }
        return
      }

      if (msg.type === 'scan' && typeof msg.value === 'string') {
        const value = msg.value.trim()
        if (value.length === 0 || value.length > 64) return

        // Per-client sliding-window rate limit.
        const now = Date.now()
        const window = scanWindow.get(ws) || []
        const recent = window.filter((t) => now - t < 1000)
        if (recent.length >= SCAN_RATE_LIMIT) {
          console.warn('[MobileScanner] Scan rate limit hit, dropping value:', value)
          try { ws.send(JSON.stringify({ type: 'rate_limited' })) } catch { /* ignore */ }
          return
        }
        recent.push(now)
        scanWindow.set(ws, recent)

        console.log('[MobileScanner] Scan:', value)
        mainWindow?.webContents.send('mobileScanner:scan', value)
        try { ws.send(JSON.stringify({ type: 'ack', value })) } catch { /* ignore */ }
        return
      }
    })

    ws.on('close', () => {
      mobileScannerClients.delete(ws)
      scanWindow.delete(ws)
      console.log(`[MobileScanner] Client disconnected (${mobileScannerClients.size} remaining)`)
      broadcastClientCount()
    })

    ws.on('error', (err) => {
      console.warn('[MobileScanner] Client error:', err.message)
    })
  })
  wss.on('error', (err: any) => {
    console.error('[MobileScanner] Server error:', err.message)
    if (err && err.code === 'EADDRINUSE') {
      mobileScannerServerError = `Le port ${MOBILE_SCANNER_PORT} est déjà utilisé par une autre application.`
    } else {
      mobileScannerServerError = err.message || 'Erreur du serveur scanner mobile.'
    }
    mainWindow?.webContents.send('mobileScanner:serverError', mobileScannerServerError)
  })
  wss.on('listening', () => {
    mobileScannerServerError = null
    console.log(`[MobileScanner] WebSocket server listening on 0.0.0.0:${MOBILE_SCANNER_PORT}`)
  })

  // Kick all paired clients (forces re-pairing) — used by the "Regenerate" button.
  const kickAllMobileClients = (reason = 'token rotated') => {
    for (const c of mobileScannerClients) {
      try { c.close(4001, reason) } catch { /* ignore */ }
    }
    mobileScannerClients.clear()
    broadcastClientCount()
  }

  const buildPairingInfo = () => {
    const ip = getLanIPv4()
    console.log(`[MobileScanner] Pairing URL uses IP: ${ip}`)
    return {
      url: `ws://${ip}:${MOBILE_SCANNER_PORT}/?token=${mobileScannerToken}`,
      lanIp: ip,
      port: MOBILE_SCANNER_PORT,
      token: mobileScannerToken,
      connectedDevices: mobileScannerClients.size,
      serverError: mobileScannerServerError,
    }
  }

  ipcMain.handle('mobileScanner:getPairingInfo', () => buildPairingInfo())

  ipcMain.handle('mobileScanner:regenerateToken', () => {
    mobileScannerToken = crypto.randomBytes(8).toString('hex')
    writeToken(mobileScannerToken)
    kickAllMobileClients('token rotated')
    return buildPairingInfo()
  })

  // Stop the WS server on quit so the port isn't left half-bound.
  app.on('before-quit', () => {
    try { kickAllMobileClients('app quitting') } catch { /* ignore */ }
    try { wss.close() } catch { /* ignore */ }
  })

  // Updater IPC handlers — registered always (stubs in dev, real in production)
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { success: true }
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) return { success: true }
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('updater:install', () => {
    if (!app.isPackaged) return
    autoUpdater.quitAndInstall()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Native Print (A5 page size) ────────────────────────────────────────────
ipcMain.handle('print:slip', async () => {
  if (!mainWindow) return { error: 'No window' }
  return new Promise((resolve) => {
    mainWindow!.webContents.print({
      silent: false,
      printBackground: true,
      pageSize: { width: 148000, height: 210000 }, // A5 in microns
      margins: { marginType: 'none' },
      dpi: { horizontal: 300, vertical: 300 },
    }, (success, failureReason) => {
      if (success) resolve({ success: true })
      else resolve({ error: failureReason || 'Print cancelled' })
    })
  })
})

// ─── Persistent Session ──────────────────────────────────────────────────────
const sessionPath = path.join(app.getPath('userData'), 'session.json')

function loadSession(): { id: string; email: string; name: string; role: string } | null {
  try {
    if (fs.existsSync(sessionPath)) {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'))
      if (data?.id && data?.email) return data
    }
  } catch { /* ignore corrupt file */ }
  return null
}

function saveSession(user: { id: string; email: string; name: string; role: string } | null) {
  try {
    if (user) {
      fs.writeFileSync(sessionPath, JSON.stringify(user), 'utf-8')
    } else if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath)
    }
  } catch { /* ignore write errors */ }
}

let currentUser = loadSession()
let lastHydrateAt = 0
let hydrateInProgress = false
let dbReachable = true
let lastDbFailAt = 0

function isDbAvailable(): boolean {
  if (!syncManager.isOnline()) return false
  if (!dbReachable && Date.now() - lastDbFailAt < 15_000) return false
  return true
}

function markDbUnreachable() {
  const wasReachable = dbReachable
  dbReachable = false
  lastDbFailAt = Date.now()
  if (wasReachable) {
    mainWindow?.webContents.send('connectivity:status', false)
  }
}

function markDbReachable() {
  dbReachable = true
}

async function hydrateCurrentUserCache(reason: string, force = false): Promise<boolean> {
  if (!currentUser) return false
  if (!syncManager.isOnline()) return false
  const now = Date.now()
  if (!force && (hydrateInProgress || now - lastHydrateAt < 30_000)) return false
  hydrateInProgress = true
  try {
    console.log(`[LocalCache] Hydrating cache (${reason}) for user ${currentUser.id}`)
    await localCache.hydrateCache(prisma, currentUser.id)
    lastHydrateAt = Date.now()
    mainWindow?.webContents.send('sync:status', {
      pendingItems: currentUser?.id ? syncManager.getQueueLengthForUser(currentUser.id) : syncManager.getQueueLength(),
      isOnline: true,
    })
    return true
  } catch (err: any) {
    console.warn(`[LocalCache] Hydrate failed (${reason}):`, err?.message || err)
    return false
  } finally {
    hydrateInProgress = false
  }
}

async function repairSessionUserId(): Promise<boolean> {
  if (!currentUser?.email || !syncManager.isOnline()) return false
  try {
    console.log(`[Session] Checking server for user: email="${currentUser.email}", id="${currentUser.id}"`)
    let serverUser = await prisma.user.findUnique({ where: { email: currentUser.email } })
    if (!serverUser) {
      console.warn(`[Session] User not found by email "${currentUser.email}". Trying by id...`)
      serverUser = await prisma.user.findUnique({ where: { id: currentUser.id } })
    }
    if (!serverUser) {
      console.warn(`[Session] User not found on server (email: ${currentUser.email}, id: ${currentUser.id}). Forcing logout.`)
      console.warn(`[Session] Please log in with valid Supabase credentials at the login screen.`)
      currentUser = null
      saveSession(null)
      mainWindow?.webContents.send('auth:logged-out')
      return false
    }
    if (serverUser.id !== currentUser.id || serverUser.email !== currentUser.email) {
      console.warn(`[Session] Repairing session: id ${currentUser.id}→${serverUser.id}, email ${currentUser.email}→${serverUser.email}`)
      currentUser = { id: serverUser.id, email: serverUser.email, name: serverUser.name, role: serverUser.role }
      saveSession(currentUser)
      localCache.cacheUser(serverUser)
      return true
    }
    return false
  } catch (err: any) {
    console.warn(`[Session] repairSessionUserId failed:`, err?.message || err)
    if (isNetworkError(err)) markDbUnreachable()
    return false
  }
}

/**
 * Whitelist: picks only the allowed fields from an input object.
 * Used by create/update handlers to strip unknown fields (id, createdAt,
 * updatedAt, relations, etc.) that would otherwise cause Prisma
 * "Unknown argument" errors when clients send the whole record back.
 */
function pickFields<T extends Record<string, any>>(input: any, allowed: readonly (keyof T)[]): Partial<T> {
  if (!input || typeof input !== 'object') return {}
  const out: any = {}
  for (const key of allowed) {
    if (input[key as string] !== undefined) out[key] = input[key as string]
  }
  return out
}

// Allowed fields per model (mirror the Prisma schema writable columns)
const FRAME_FIELDS = ['brand', 'model', 'color', 'size', 'cost', 'sellingPrice', 'stock', 'userId'] as const
const LENS_TYPE_FIELDS = ['name', 'category', 'material', 'index', 'baseCost', 'sellingPrice', 'stock', 'reorderThreshold', 'supplierName', 'supplierContact', 'userId'] as const
const CONTACT_LENS_FIELDS = ['brand', 'model', 'price', 'userId'] as const
const CUSTOMER_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'address', 'insuranceProvider', 'insurancePolicyNumber', 'insuranceCoverageDetails', 'notes', 'userId'] as const
const PRESCRIPTION_FIELDS = ['customerId', 'examinationDate', 'doctorName', 'doctorLicense', 'pupillaryDistance', 'readingDistance', 'expirationDate', 'notes', 'hasVLData', 'hasVPData', 'vlLeftEyeAxis', 'vlLeftEyeCylinder', 'vlLeftEyePrism', 'vlLeftEyeSphere', 'vlRightEyeAxis', 'vlRightEyeCylinder', 'vlRightEyePrism', 'vlRightEyeSphere', 'vpLeftEyeAxis', 'vpLeftEyeCylinder', 'vpLeftEyePrism', 'vpLeftEyeSphere', 'vpRightEyeAxis', 'vpRightEyeCylinder', 'vpRightEyePrism', 'vpRightEyeSphere', 'vpLeftEyeAdd', 'vpRightEyeAdd'] as const
const ORDER_FIELDS = ['orderNumber', 'customerId', 'prescriptionId', 'frameId', 'lensTypeId', 'vlRightEyeLensTypeId', 'vlLeftEyeLensTypeId', 'vpRightEyeLensTypeId', 'vpLeftEyeLensTypeId', 'framePrice', 'vlRightEyeLensPrice', 'vlLeftEyeLensPrice', 'vpRightEyeLensPrice', 'vpLeftEyeLensPrice', 'basePrice', 'addonsPrice', 'totalPrice', 'depositAmount', 'balanceDue', 'status', 'expectedCompletionDate', 'actualCompletionDate', 'customerNotes', 'technicalNotes', 'userId', 'vlLeftEyeLensQuantity', 'vlRightEyeLensQuantity', 'vpLeftEyeLensQuantity', 'vpRightEyeLensQuantity'] as const
const PAYMENT_FIELDS = ['orderId', 'amount', 'paymentMethod', 'paymentDate', 'receiptNumber', 'reference', 'description', 'type', 'userId'] as const
const EXPENSE_FIELDS = ['description', 'amount', 'category', 'date', 'notes', 'userId'] as const

// ─── Order numbering ───────────────────────────────────────────────────────────
function parseOrderNum(orderNumber?: string | null): number {
  const m = orderNumber?.match(/ORD-(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}
function formatOrderNumber(n: number): string {
  return `ORD-${String(n).padStart(3, '0')}`
}

// Next order number for a user, considering BOTH the server and the local cache.
// The local cache holds not-yet-synced offline orders, so consulting it keeps the
// online and offline paths on a single shared sequence — they never hand out the
// same number to two different orders.
async function computeNextOrderNumber(userId: string): Promise<number> {
  const serverOrders = await prisma.order.findMany({ where: { userId }, select: { orderNumber: true } })
  let maxNum = 0
  for (const o of serverOrders) maxNum = Math.max(maxNum, parseOrderNum(o.orderNumber))
  try { maxNum = Math.max(maxNum, localCache.getMaxOrderNumber(userId)) } catch {}
  return maxNum + 1
}

// Create an order with a guaranteed-unique orderNumber, even when an online
// create races the background sync. If `preferredNumber` is supplied (an offline
// order preserving the number the user already wrote on the job), we try it first
// and only fall back to a fresh number if it genuinely collides with a DIFFERENT
// existing order — so a number is never silently changed in the normal case, and
// an order is never dropped or duplicated.
async function createOrderSafe(
  createData: any,
  opts: { preferredNumber?: string | null; include?: any } = {}
): Promise<any> {
  const userId = createData.userId
  let candidate = opts.preferredNumber || formatOrderNumber(await computeNextOrderNumber(userId))
  for (let attempt = 0; ; attempt++) {
    try {
      createData.orderNumber = candidate
      return await prisma.order.create({ data: createData, ...(opts.include ? { include: opts.include } : {}) })
    } catch (err: any) {
      // P2002 = unique([orderNumber, userId]) collision. Recompute and retry.
      if (err?.code !== 'P2002' || attempt >= 25) throw err
      candidate = formatOrderNumber(await computeNextOrderNumber(userId))
    }
  }
}

// Find the server order that an OFFLINE order corresponds to, even if its
// ORD-NNN number was changed under the old buggy sync (which is why a payment
// can end up orphaned). Matches conservatively so we never link to the wrong
// order: first by exact orderNumber, then by a strong natural key
// (same customer + same total + same creation day). Returns a unique match or null.
async function findServerOrderTwin(args: {
  userId: string
  customerId: string
  orderNumber?: string | null
  totalPrice?: number | null
  createdAt?: string | Date | null
}): Promise<{ id: string; orderNumber: string } | null> {
  const { userId, customerId } = args
  if (!userId || !customerId) return null
  const candidates = await prisma.order.findMany({
    where: { userId, customerId },
    select: { id: true, orderNumber: true, totalPrice: true, createdAt: true },
  })
  if (candidates.length === 0) return null
  // 1) Exact preserved number.
  if (args.orderNumber) {
    const exact = candidates.find((c: any) => c.orderNumber === args.orderNumber)
    if (exact) return { id: exact.id, orderNumber: exact.orderNumber }
  }
  // 2) Renumbered order: same customer + same total + same creation day, and exactly one.
  const total = Number(args.totalPrice ?? NaN)
  const day = args.createdAt ? new Date(args.createdAt).toISOString().slice(0, 10) : null
  if (!Number.isNaN(total) && day) {
    const stable = candidates.filter((c: any) =>
      Math.abs(Number(c.totalPrice ?? NaN) - total) < 0.01 &&
      new Date(c.createdAt).toISOString().slice(0, 10) === day
    )
    if (stable.length === 1) return { id: stable[0].id, orderNumber: stable[0].orderNumber }
  }
  return null
}

// Scan the sync queue for offline orders (and orders referenced by queued
// payments) whose local_→server mapping was lost under the old buggy sync, and
// restore the mapping when we can confidently match the server twin. Once the
// mapping exists, processQueue's persistedIdMap rewrites the payment's orderId
// automatically, so the stuck payment finally syncs — without touching any order.
async function reconcileOrphanedOrderRefs(userId: string): Promise<number> {
  const queue = syncManager.getQueue().filter(i => !i.userId || i.userId === userId)
  if (queue.length === 0) return 0
  const localOrderIds = new Set<string>()
  for (const it of queue) {
    if (it.action === 'orders:create' && typeof it.id === 'string' && it.id.startsWith('local_')) localOrderIds.add(it.id)
    const oid = it.payload?.orderId
    if (typeof oid === 'string' && oid.startsWith('local_')) localOrderIds.add(oid)
  }
  let healed = 0
  for (const localId of localOrderIds) {
    if (localCache.getLocalIdMapping(localId)) continue // already linked
    const lo = localCache.getLocalOrder(localId)
    if (!lo) continue
    // Resolve the order's customer to a server id (it may itself be a local_ ref).
    let customerId: string | null = lo.customerId
    if (typeof customerId === 'string' && customerId.startsWith('local_')) {
      customerId = localCache.getLocalIdMapping(customerId)
    }
    if (!customerId) continue // customer not on server yet — let the normal flow run first
    const twin = await findServerOrderTwin({
      userId, customerId, orderNumber: lo.orderNumber,
      totalPrice: lo.totalPrice, createdAt: lo.createdAt,
    })
    if (twin) {
      localCache.cacheLocalIdMapping(localId, twin.id, 'order')
      healed++
      console.log(`[Sync] Reconciled offline order ${localId} → server ${twin.orderNumber} (${twin.id})`)
    } else {
      console.warn(`[Sync] Offline order ${localId} (ORD ${lo.orderNumber}) has no confident server match — needs manual relink`)
    }
  }
  if (healed > 0) console.log(`[Sync] Reconcile healed ${healed} lost order link(s)`)
  return healed
}

function isNetworkError(err: any): boolean {
  const msg = String(err?.message || '')
  return (
    msg.includes("Can't reach database server") ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('fetch failed') ||
    err?.code === 'P1001' ||
    err?.code === 'P1002' ||
    err?.code === 'P1017' ||
    err?._offlineFastPath === true
  )
}

function requireDb() {
  if (!isDbAvailable()) {
    const err: any = new Error('DB unavailable (fast offline path)')
    err.code = 'P1001'
    err._offlineFastPath = true
    throw err
  }
}

function queueUnsyncedLocalRecords(userId: string) {
  const d = localCache.getDb()
  let total = 0

  const queueRows = (action: string, rows: any[], normalize: (row: any) => any = row => row) => {
    for (const row of rows) {
      // Skip records that were already synced (mapping exists)
      if (localCache.getLocalIdMapping(row.id)) continue
      const payload = normalize(row)
      syncManager.addToQueue(action, { ...payload, localId: row.id }, row.id, currentUser?.id)
      total++
    }
  }

  try {
    queueRows('customers:create', d.prepare(`SELECT * FROM customers WHERE id LIKE 'local_%' AND userId=?`).all(userId) as any[])
  } catch { /* table might not exist */ }

  try {
    queueRows('prescriptions:create', d.prepare(`
      SELECT prescriptions.* FROM prescriptions
      LEFT JOIN customers ON customers.id = prescriptions.customerId
      WHERE prescriptions.id LIKE 'local_%'
        AND (customers.userId=? OR prescriptions.customerId LIKE 'local_%')
    `).all(userId) as any[], row => ({
      ...row,
      hasVLData: Boolean(row.hasVLData),
      hasVPData: Boolean(row.hasVPData),
    }))
  } catch { /* table might not exist */ }

  try {
    queueRows('orders:create', d.prepare(`SELECT * FROM orders WHERE id LIKE 'local_%' AND userId=?`).all(userId) as any[])
  } catch { /* table might not exist */ }

  try {
    queueRows('frames:create', d.prepare(`SELECT * FROM frames WHERE id LIKE 'local_%' AND userId=?`).all(userId) as any[])
  } catch { /* table might not exist */ }

  try {
    queueRows('lensTypes:create', d.prepare(`SELECT * FROM lensTypes WHERE id LIKE 'local_%' AND userId=?`).all(userId) as any[])
  } catch { /* table might not exist */ }

  try {
    queueRows('contactLenses:create', d.prepare(`SELECT * FROM contactLenses WHERE id LIKE 'local_%' AND userId=?`).all(userId) as any[])
  } catch { /* table might not exist */ }

  try {
    const payments = d.prepare(`
      SELECT payments.* FROM payments
      WHERE payments.id LIKE 'local_%'
        AND payments.userId=?
        AND payments.reference != 'Initial deposit'
    `).all(userId) as any[]
    queueRows('payments:create', payments, (row) => {
      if (typeof row.orderId === 'string' && row.orderId.startsWith('local_')) {
        const mapped = localCache.getLocalIdMapping(row.orderId)
        if (mapped) row.orderId = mapped
      }
      return row
    })
  } catch { /* table might not exist */ }

  try {
    queueRows('expenses:create', d.prepare(`SELECT * FROM expenses WHERE id LIKE 'local_%' AND userId=?`).all(userId) as any[])
  } catch { /* table might not exist */ }

  if (total > 0) console.log(`[Sync] Re-queued ${total} unsynced local_ records after fresh login`)
}

function registerIpcHandlers() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:login', async (_e, email: string, password: string) => {
    try {
      requireDb()
      const user = await prisma.user.findUnique({ where: { email } })
      markDbReachable()
      if (user) {
        const passwordMatch = await bcrypt.compare(password, user.password)
        if (passwordMatch) {
          localCache.cacheUser(user)
          currentUser = { id: user.id, email: user.email, name: user.name, role: user.role }
          saveSession(currentUser)
          await repairSessionUserId()
          await hydrateCurrentUserCache('online-login', true)
          queueUnsyncedLocalRecords(currentUser.id)
          return { data: { user: currentUser } }
        }
      }
      return { error: 'Invalid email or password' }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        const localUser = localCache.getLocalUser(email)
        if (localUser) {
          const passwordMatch = await bcrypt.compare(password, localUser.password)
          if (passwordMatch) {
            currentUser = { id: localUser.id, email: localUser.email, name: localUser.name, role: localUser.role }
            saveSession(currentUser)
            return { data: { user: currentUser, offline: true } }
          }
        }
        return { error: 'Unable to connect. Please check your internet and try again, or ensure you have logged in at least once before.' }
      }
      return { error: err.message || 'Login failed' }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    currentUser = null
    saveSession(null)
    return { success: true }
  })

  ipcMain.handle('auth:session', async () => {
    if (!currentUser) return { data: null }
    try { await repairSessionUserId() } catch {}
    hydrateCurrentUserCache('auth-session', false).catch(() => {})
    return { data: { user: currentUser } }
  })

  // ── Customers ─────────────────────────────────────────────────────────────
  ipcMain.handle('customers:list', async (_e, params: { userId: string; query?: string; limit?: number }) => {
    try {
      requireDb()
      const where: any = { userId: params.userId }
      if (params.query?.trim()) {
        const s = params.query.trim()
        where.OR = [
          { firstName: { contains: s, mode: 'insensitive' } },
          { lastName: { contains: s, mode: 'insensitive' } },
          { phone: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
        ]
      }
      const data = await prisma.customer.findMany({
        where,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true, updatedAt: true, userId: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...(params.limit ? { take: params.limit } : {}),
      })
      markDbReachable()
      try { for (const c of data) localCache.cacheCustomer(c) } catch {}
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        const data = localCache.getLocalCustomers(params.userId, params.query, params.limit || 5000)
        return { data }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('customers:get', async (_e, id: string) => {
    try {
      requireDb()
      const data = await prisma.customer.findUnique({ where: { id } })
      markDbReachable()
      if (data) localCache.cacheCustomer(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        return { data: localCache.getLocalCustomer(id) }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('customers:create', async (_e, customer: any) => {
    try {
      requireDb()
      const data = await prisma.customer.create({ data: pickFields(customer, CUSTOMER_FIELDS) as any })
      markDbReachable()
      localCache.cacheCustomer(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        const sanitized = { ...pickFields(customer, CUSTOMER_FIELDS), userId: customer.userId || currentUser?.id }
        const data = localCache.createLocalCustomer(sanitized)
        syncManager.addToQueue('customers:create', { ...sanitized, createdAt: data.createdAt, localId: data.id }, data.id, currentUser?.id)
        return { data }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('customers:update', async (_e, id: string, updates: any) => {
    try {
      requireDb()
      const clean: any = pickFields(updates, CUSTOMER_FIELDS)
      for (const key of ['email', 'phone', 'address', 'notes', 'insuranceProvider', 'insurancePolicyNumber', 'insuranceCoverageDetails']) {
        if (clean[key] === '') clean[key] = null
      }
      if (clean.dateOfBirth === '' || clean.dateOfBirth === undefined) {
        delete clean.dateOfBirth
      } else if (typeof clean.dateOfBirth === 'string') {
        clean.dateOfBirth = new Date(clean.dateOfBirth)
      }
      const data = await prisma.customer.update({ where: { id }, data: clean })
      markDbReachable()
      localCache.cacheCustomer(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        // Apply update to local cache
        const existing = localCache.getLocalCustomer(id)
        if (existing) {
          const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() }
          localCache.cacheCustomer(merged)
        }
        syncManager.addToQueue('customers:update', { id, updates }, id, currentUser?.id)
        return { data: localCache.getLocalCustomer(id) }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('customers:delete', async (_e, id: string) => {
    try {
      await prisma.customer.delete({ where: { id } })
      localCache.deleteLocalCustomer(id)
      return { success: true }
    } catch (err: any) {
      if (isNetworkError(err)) {
        localCache.deleteLocalCustomer(id)
        if (id.startsWith('local_')) syncManager.removeFromQueue(id)
        else syncManager.addToQueue('customers:delete', { id }, id, currentUser?.id)
        return { success: true }
      }
      return { error: err.message }
    }
  })

  // ── Orders ────────────────────────────────────────────────────────────────
  ipcMain.handle('orders:list', async (_e, params: any) => {
    try {
      if (!isDbAvailable()) {
        const { orders, total } = localCache.getLocalOrders(params.userId, params)
        return { data: { orders, pagination: { total, pages: Math.ceil(total / (params.limit || 10)), page: params.page || 1, limit: params.limit || 10 } } }
      }
      const { userId, page = 1, limit = 10, status, search, paymentStatus, startDate, endDate, hasBalance } = params
      const where: any = { userId }

      if (status) {
        const statusList = status.split(',').map((s: string) => s.trim().toLowerCase())
        const expanded: string[] = []
        statusList.forEach((s: string) => {
          if (s === 'in_progress') expanded.push('in_progress', 'pending')
          else if (s === 'completed') expanded.push('completed', 'done', 'finished', 'delivered')
          else expanded.push(s)
        })
        where.status = { in: expanded }
      }

      if (search) {
        where.OR = [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { customer: { firstName: { contains: search, mode: 'insensitive' } } },
          { customer: { lastName: { contains: search, mode: 'insensitive' } } },
          { customerNotes: { contains: search, mode: 'insensitive' } },
          { technicalNotes: { contains: search, mode: 'insensitive' } },
        ]
      }

      if (startDate) where.createdAt = { ...(where.createdAt || {}), gte: new Date(startDate) }
      if (endDate) where.createdAt = { ...(where.createdAt || {}), lte: new Date(endDate) }
      if (hasBalance === 'true') where.balanceDue = { gt: 0 }

      if (paymentStatus === 'paid') where.balanceDue = { lte: 0 }
      else if (paymentStatus === 'partial') { where.balanceDue = { gt: 0 }; where.depositAmount = { gt: 0 } }
      else if (paymentStatus === 'unpaid') { where.balanceDue = { gt: 0 }; where.depositAmount = { equals: 0 } }

      const offset = (page - 1) * limit
      const [total, orders] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          include: {
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
            prescription: true,
            vlRightEyeLensType: { select: { id: true, name: true } },
            vlLeftEyeLensType: { select: { id: true, name: true } },
            vpRightEyeLensType: { select: { id: true, name: true } },
            vpLeftEyeLensType: { select: { id: true, name: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { orderNumber: 'desc' }],
          skip: offset,
          take: limit,
        }),
      ])

      // Cache returned data so offline copy stays fresh
      try {
        for (const o of orders) {
          localCache.cacheOrder(o)
          if (o.customer) localCache.cacheCustomer(o.customer)
        }
      } catch {}
      markDbReachable()
      return { data: { orders, pagination: { total, pages: Math.ceil(total / limit), page, limit } } }
    } catch (err: any) {
      if (isNetworkError(err)) {
        markDbUnreachable()
        const { orders, total } = localCache.getLocalOrders(params.userId, params)
        return { data: { orders, pagination: { total, pages: Math.ceil(total / (params.limit || 10)), page: params.page || 1, limit: params.limit || 10 } } }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:findByOrderNumber', async (_e, params: { userId: string; orderNumber: string }) => {
    try {
      const order = await prisma.order.findUnique({
        where: { orderNumber_userId: { orderNumber: params.orderNumber, userId: params.userId } },
        select: { id: true, orderNumber: true },
      })
      return { data: order }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:get', async (_e, id: string) => {
    try {
      requireDb()
      const data = await prisma.order.findUnique({
        where: { id },
        include: { customer: true, prescription: true, frame: true, lensType: true, payments: true, vlRightEyeLensType: true, vlLeftEyeLensType: true, vpRightEyeLensType: true, vpLeftEyeLensType: true },
      })
      markDbReachable()
      if (data) {
        localCache.cacheOrder(data)
        if (data.customer) localCache.cacheCustomer(data.customer)
        if (data.prescription) localCache.cachePrescription(data.prescription)
        if (data.frame) localCache.cacheFrame(data.frame)
        if (data.lensType) localCache.cacheLensType(data.lensType)
        if (data.payments) data.payments.forEach((p: any) => localCache.cachePayment(p))
        if (data.vlRightEyeLensType) localCache.cacheLensType(data.vlRightEyeLensType)
        if (data.vlLeftEyeLensType) localCache.cacheLensType(data.vlLeftEyeLensType)
        if (data.vpRightEyeLensType) localCache.cacheLensType(data.vpRightEyeLensType)
        if (data.vpLeftEyeLensType) localCache.cacheLensType(data.vpLeftEyeLensType)
      }
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        return { data: localCache.getLocalOrder(id) }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:create', async (_e, orderData: any) => {
    try {
      requireDb()
      const { depositAmount, frameId, ...rest } = orderData
      const createData: any = { ...rest, depositAmount }
      delete createData.customer
      delete createData.prescription
      delete createData.frame
      delete createData.lensType
      // Server assigns the number atomically (shared sequence with offline orders).
      delete createData.orderNumber

      const data = await createOrderSafe(createData, {
        include: { customer: true, prescription: true, frame: true, lensType: true, vlRightEyeLensType: true, vlLeftEyeLensType: true, vpRightEyeLensType: true, vpLeftEyeLensType: true },
      })

      if (depositAmount && depositAmount > 0) {
        const depositReceipt = `DEP-${data.id}`
        const existingDeposit = await prisma.payment.findUnique({ where: { receiptNumber: depositReceipt }, select: { id: true } })
        if (!existingDeposit) {
          await prisma.payment.create({
            data: {
              orderId: data.id,
              amount: depositAmount,
              paymentMethod: 'cash',
              receiptNumber: depositReceipt,
              reference: 'Initial deposit',
              paymentDate: new Date(),
              userId: orderData.userId,
            },
          })
        }
      }

      if (frameId) {
        await prisma.frame.updateMany({
          where: { id: frameId, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        })
      }

      // Cache for offline
      markDbReachable()
      localCache.cacheOrder(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        orderData.userId = orderData.userId || currentUser?.id
        const data = localCache.createLocalOrder(orderData, orderData.userId)
        // Carry the locally-assigned orderNumber into the queue so sync PRESERVES
        // the number the user already wrote on the job, instead of reassigning one.
        syncManager.addToQueue('orders:create', { ...orderData, orderNumber: data.orderNumber, createdAt: data.createdAt, localId: data.id }, data.id, currentUser?.id)
        return { data }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:update', async (_e, id: string, updates: any) => {
    try {
      requireDb()
      const data = await prisma.order.update({ where: { id }, data: updates })
      markDbReachable()
      localCache.cacheOrder(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        const existing = localCache.getLocalOrder(id)
        if (existing) {
          // Translate Prisma relation syntax { connect: { id } } to flat ID fields
          const flat: any = { ...updates }
          for (const rel of ['vlRightEyeLensType', 'vlLeftEyeLensType', 'vpRightEyeLensType', 'vpLeftEyeLensType', 'frame', 'lensType']) {
            if (flat[rel]?.connect?.id) {
              flat[`${rel}Id`] = flat[rel].connect.id
              delete flat[rel]
            }
          }
          const merged = { ...existing, ...flat, updatedAt: new Date().toISOString() }
          localCache.cacheOrder(merged)
        }
        // Store flat updates for sync (strip Prisma relation syntax)
        const flatUpdates: any = { ...updates }
        for (const rel of ['vlRightEyeLensType', 'vlLeftEyeLensType', 'vpRightEyeLensType', 'vpLeftEyeLensType', 'frame', 'lensType']) {
          if (flatUpdates[rel]?.connect?.id) {
            flatUpdates[`${rel}Id`] = flatUpdates[rel].connect.id
            delete flatUpdates[rel]
          }
        }
        if (id.startsWith('local_') && syncManager.updateCreatePayload(id, flatUpdates)) {
          console.log(`[Offline] Merged order edits into pending create for ${id}`)
        } else {
          syncManager.addToQueue('orders:update', { id, updates: flatUpdates }, id, currentUser?.id)
        }
        return { data: localCache.getLocalOrder(id) }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:delete', async (_e, id: string) => {
    try {
      requireDb()
      await prisma.order.delete({ where: { id } })
      markDbReachable()
      localCache.deleteLocalOrder(id)
      return { success: true }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        localCache.deleteLocalOrder(id)
        if (id.startsWith('local_')) syncManager.removeFromQueue(id)
        else syncManager.addToQueue('orders:delete', { id }, id, currentUser?.id)
        return { success: true }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:latestNumber', async (_e, userId: string) => {
    try {
      if (!isDbAvailable()) {
        const { orders } = localCache.getLocalOrders(userId, { limit: 999999 })
        let maxNum = 0
        for (const o of orders) {
          const match = o.orderNumber?.match(/ORD-(\d+)/)
          if (match) { const num = parseInt(match[1], 10); if (num > maxNum) maxNum = num }
        }
        return { data: maxNum > 0 ? `ORD-${String(maxNum).padStart(3, '0')}` : null }
      }
      const orders = await prisma.order.findMany({
        where: { userId },
        select: { orderNumber: true },
      })
      if (orders.length === 0) return { data: null }
      let maxNum = 0
      for (const o of orders) {
        const match = o.orderNumber?.match(/ORD-(\d+)/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > maxNum) maxNum = num
        }
      }
      return { data: maxNum > 0 ? `ORD-${String(maxNum).padStart(3, '0')}` : null }
    } catch (err: any) {
      if (isNetworkError(err)) {
        // Fall back to local orders
        const { orders } = localCache.getLocalOrders(userId, { limit: 99999 })
        if (orders.length === 0) return { data: null }
        let maxNum = 0
        for (const o of orders) {
          const match = o.orderNumber?.match(/ORD-(\d+)/)
          if (match) {
            const num = parseInt(match[1], 10)
            if (num > maxNum) maxNum = num
          }
        }
        return { data: maxNum > 0 ? `ORD-${String(maxNum).padStart(3, '0')}` : null }
      }
      return { error: err.message }
    }
  })

  // ── Prescriptions ─────────────────────────────────────────────────────────
  ipcMain.handle('prescriptions:list', async (_e, params: any) => {
    try {
      requireDb()
      const { userId, customerId, search, page = 1, limit = 10 } = params
      const where: any = {}
      if (customerId) where.customerId = customerId
      else if (userId) where.customer = { userId }

      if (search?.trim()) {
        const s = search.trim()
        const searchFilter = {
          OR: [
            { doctorName: { contains: s, mode: 'insensitive' } },
            { customer: { firstName: { contains: s, mode: 'insensitive' } } },
            { customer: { lastName: { contains: s, mode: 'insensitive' } } },
          ]
        }
        const existing = { ...where }
        Object.keys(where).forEach(k => delete where[k])
        where.AND = [existing, searchFilter]
      }

      const offset = (page - 1) * limit
      const [total, prescriptions] = await Promise.all([
        prisma.prescription.count({ where }),
        prisma.prescription.findMany({
          where,
          include: { customer: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { examinationDate: 'desc' },
          skip: offset,
          take: limit,
        }),
      ])

      markDbReachable()
      return { data: { prescriptions, pagination: { total, pages: Math.ceil(total / limit), page, limit } } }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        const prescriptions = params.customerId
          ? localCache.getLocalPrescriptions(params.customerId)
          : []
        return { data: { prescriptions, pagination: { total: prescriptions.length, pages: 1, page: 1, limit: prescriptions.length } } }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('prescriptions:get', async (_e, id: string) => {
    try {
      const data = await prisma.prescription.findUnique({
        where: { id },
        include: { customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } }, orders: { select: { id: true, orderNumber: true, createdAt: true, status: true } } },
      })
      if (!data) return { error: 'Prescription not found' }
      localCache.cachePrescription(data)
      if (data.customer) localCache.cacheCustomer(data.customer)
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('prescriptions:create', async (_e, prescription: any) => {
    try {
      requireDb()
      const data = await prisma.prescription.create({ data: prescription })
      markDbReachable()
      localCache.cachePrescription(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        const data = localCache.createLocalPrescription(prescription)
        syncManager.addToQueue('prescriptions:create', { ...prescription, createdAt: data.createdAt, localId: data.id }, data.id, currentUser?.id)
        return { data: data }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('prescriptions:update', async (_e, id: string, updates: any) => {
    try {
      requireDb()
      const data = await prisma.prescription.update({ where: { id }, data: updates })
      localCache.cachePrescription(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (id.startsWith('local_') && syncManager.updateCreatePayload(id, updates)) {
          console.log(`[Offline] Merged prescription edits into pending create for ${id}`)
        } else {
          syncManager.addToQueue('prescriptions:update', { id, updates }, id, currentUser?.id)
        }
        const existing = localCache.getLocalPrescription(id)
        if (existing) {
          const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() }
          localCache.cachePrescription(merged)
        }
        return { data: existing ? { ...existing, ...updates } : updates }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('prescriptions:delete', async (_e, id: string) => {
    try {
      requireDb()
      await prisma.prescription.delete({ where: { id } })
      localCache.deleteLocalPrescription(id)
      return { success: true }
    } catch (err: any) {
      if (isNetworkError(err)) {
        localCache.deleteLocalPrescription(id)
        if (id.startsWith('local_')) syncManager.removeFromQueue(id)
        else syncManager.addToQueue('prescriptions:delete', { id }, id, currentUser?.id)
        return { success: true }
      }
      return { error: err.message }
    }
  })

  // ── Frames ────────────────────────────────────────────────────────────────
  ipcMain.handle('frames:list', async (_e, params: { userId: string; query?: string }) => {
    try {
      requireDb()
      const where: any = { userId: params.userId }
      if (params.query) {
        where.OR = [
          { brand: { contains: params.query, mode: 'insensitive' } },
          { model: { contains: params.query, mode: 'insensitive' } },
          { color: { contains: params.query, mode: 'insensitive' } },
          { size: { contains: params.query, mode: 'insensitive' } },
        ]
      }
      const data = await prisma.frame.findMany({ where, orderBy: [{ stock: 'desc' }, { brand: 'asc' }] })
      try { for (const f of data) localCache.cacheFrame(f) } catch {}
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        return { data: localCache.getLocalFrames(params.userId) }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('frames:create', async (_e, frame: any) => {
    try {
      requireDb()
      const data = await prisma.frame.create({ data: pickFields(frame, FRAME_FIELDS) as any })
      localCache.cacheFrame(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        const row = { ...pickFields(frame, FRAME_FIELDS), userId: frame.userId || currentUser?.id, id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        localCache.cacheFrame(row)
        syncManager.addToQueue('frames:create', { ...row, localId: row.id }, row.id, currentUser?.id)
        return { data: row }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('frames:update', async (_e, id: string, updates: any) => {
    try {
      requireDb()
      const data = await prisma.frame.update({ where: { id }, data: pickFields(updates, FRAME_FIELDS) })
      localCache.cacheFrame(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        syncManager.addToQueue('frames:update', { id, updates }, id, currentUser?.id)
        return { data: updates }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('frames:delete', async (_e, id: string) => {
    try {
      requireDb()
      await prisma.frame.delete({ where: { id } })
      localCache.deleteLocalFrame(id)
      return { success: true }
    } catch (err: any) {
      if (isNetworkError(err)) {
        localCache.deleteLocalFrame(id)
        if (id.startsWith('local_')) syncManager.removeFromQueue(id)
        else syncManager.addToQueue('frames:delete', { id }, id, currentUser?.id)
        return { success: true }
      }
      return { error: err.message }
    }
  })

  // ── Lens Types ────────────────────────────────────────────────────────────
  ipcMain.handle('lensTypes:list', async (_e, params: { userId: string; search?: string }) => {
    try {
      requireDb()
      const where: any = { userId: params.userId }
      if (params.search) {
        where.OR = [
          { name: { contains: params.search, mode: 'insensitive' } },
          { category: { contains: params.search, mode: 'insensitive' } },
          { material: { contains: params.search, mode: 'insensitive' } },
        ]
      }
      const data = await prisma.lensType.findMany({ where, orderBy: { name: 'asc' } })
      try { for (const lt of data) localCache.cacheLensType(lt) } catch {}
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        return { data: localCache.getLocalLensTypes(params.userId) }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('lensTypes:create', async (_e, lensType: any) => {
    try {
      requireDb()
      const data = await prisma.lensType.create({ data: pickFields(lensType, LENS_TYPE_FIELDS) as any })
      localCache.cacheLensType(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        const row = { ...pickFields(lensType, LENS_TYPE_FIELDS), userId: lensType.userId || currentUser?.id, id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        localCache.cacheLensType(row)
        syncManager.addToQueue('lensTypes:create', { ...row, localId: row.id }, row.id, currentUser?.id)
        return { data: row }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('lensTypes:update', async (_e, id: string, updates: any) => {
    try {
      requireDb()
      const data = await prisma.lensType.update({ where: { id }, data: pickFields(updates, LENS_TYPE_FIELDS) })
      localCache.cacheLensType(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        syncManager.addToQueue('lensTypes:update', { id, updates }, id, currentUser?.id)
        return { data: updates }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('lensTypes:delete', async (_e, id: string) => {
    try {
      requireDb()
      await prisma.lensType.delete({ where: { id } })
      localCache.deleteLocalLensType(id)
      return { success: true }
    } catch (err: any) {
      if (isNetworkError(err)) {
        localCache.deleteLocalLensType(id)
        if (id.startsWith('local_')) syncManager.removeFromQueue(id)
        else syncManager.addToQueue('lensTypes:delete', { id }, id, currentUser?.id)
        return { success: true }
      }
      return { error: err.message }
    }
  })

  // ── Contact Lenses ──────────────────────────────────────────────────────
  ipcMain.handle('contactLenses:list', async (_e, params: { userId: string; search?: string }) => {
    try {
      requireDb()
      const where: any = { userId: params.userId }
      if (params.search) {
        where.OR = [
          { brand: { contains: params.search, mode: 'insensitive' } },
          { model: { contains: params.search, mode: 'insensitive' } },
        ]
      }
      const data = await prisma.contactLens.findMany({ where, orderBy: { brand: 'asc' } })
      try { for (const c of data) localCache.cacheContactLens(c) } catch {}
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        return { data: localCache.getLocalContactLenses(params.userId, params.search) }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('contactLenses:create', async (_e, contactLens: any) => {
    try {
      requireDb()
      const data = await prisma.contactLens.create({ data: pickFields(contactLens, CONTACT_LENS_FIELDS) as any })
      localCache.cacheContactLens(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        const row = { ...pickFields(contactLens, CONTACT_LENS_FIELDS), userId: contactLens.userId || currentUser?.id, id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        localCache.cacheContactLens(row)
        syncManager.addToQueue('contactLenses:create', { ...row, localId: row.id }, row.id, currentUser?.id)
        return { data: row }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('contactLenses:update', async (_e, id: string, updates: any) => {
    try {
      requireDb()
      const data = await prisma.contactLens.update({ where: { id }, data: pickFields(updates, CONTACT_LENS_FIELDS) })
      localCache.cacheContactLens(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        const existing = localCache.getLocalContactLenses(currentUser?.id || '').find((c: any) => c.id === id)
        if (existing) localCache.cacheContactLens({ ...existing, ...updates, updatedAt: new Date().toISOString() })
        if (id.startsWith('local_')) syncManager.updateCreatePayload(id, updates)
        else syncManager.addToQueue('contactLenses:update', { id, updates }, id, currentUser?.id)
        return { data: updates }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('contactLenses:delete', async (_e, id: string) => {
    try {
      requireDb()
      await prisma.contactLens.delete({ where: { id } })
      localCache.deleteLocalContactLens(id)
      return { success: true }
    } catch (err: any) {
      if (isNetworkError(err)) {
        localCache.deleteLocalContactLens(id)
        if (id.startsWith('local_')) syncManager.removeFromQueue(id)
        else syncManager.addToQueue('contactLenses:delete', { id }, id, currentUser?.id)
        return { success: true }
      }
      return { error: err.message }
    }
  })

  // ── Payments ──────────────────────────────────────────────────────────────
  ipcMain.handle('payments:list', async (_e, params: any) => {
    try {
      requireDb()
      const { userId, orderId, search, startDate, endDate, paymentMethod, page = 1, limit = 15 } = params
      const userFilter = userId ? { OR: [{ userId }, { order: { userId } }] } : {}
      const where: any = { ...userFilter }
      if (orderId) where.orderId = orderId
      if (startDate) where.paymentDate = { ...(where.paymentDate || {}), gte: new Date(startDate) }
      if (endDate) where.paymentDate = { ...(where.paymentDate || {}), lte: new Date(endDate) }
      if (paymentMethod) where.paymentMethod = { contains: paymentMethod, mode: 'insensitive' }
      if (search) {
        const existing = { ...where }
        Object.keys(where).forEach(k => delete where[k])
        where.AND = [
          existing,
          { OR: [
            { receiptNumber: { contains: search, mode: 'insensitive' } },
            { reference: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ]}
        ]
      }

      const offset = (page - 1) * limit
      const [total, payments, agg] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.findMany({
          where,
          include: { order: { select: { id: true, orderNumber: true, customer: { select: { id: true, firstName: true, lastName: true } } } } },
          orderBy: { paymentDate: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.payment.aggregate({ where, _sum: { amount: true } }),
      ])

      markDbReachable()
      try { for (const p of payments) localCache.cachePayment(p) } catch {}
      return { data: { payments, pagination: { total, pages: Math.ceil(total / limit), page, limit }, totalAmount: agg._sum.amount || 0 } }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        const { payments, total } = localCache.getLocalPayments(params.userId, params)
        // Sum ALL payments (not just current page) for accurate total
        const d = localCache.getDb()
        const agg = (d.prepare('SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE userId=? OR orderId IN (SELECT id FROM orders WHERE userId=?)').get(params.userId, params.userId) as any)
        const totalAmount = agg?.s || 0
        return { data: { payments, pagination: { total, pages: Math.ceil(total / (params.limit || 10)), page: params.page || 1, limit: params.limit || 10 }, totalAmount } }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('payments:create', async (_e, payment: any) => {
    try {
      requireDb()
      if (!payment.receiptNumber) {
        payment.receiptNumber = `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      }
      const data = await prisma.$transaction(async (tx: any) => {
        const created = await tx.payment.create({ data: payment })
        if (payment.orderId) {
          const order = await tx.order.findUnique({ where: { id: payment.orderId }, select: { balanceDue: true, depositAmount: true } })
          if (order) {
            await tx.order.update({
              where: { id: payment.orderId },
              data: {
                balanceDue: Math.max(0, (order.balanceDue || 0) - payment.amount),
                depositAmount: (order.depositAmount || 0) + payment.amount,
              },
            })
          }
        }
        return created
      })
      markDbReachable()

      localCache.cachePayment(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        const safePayment = { ...payment, userId: payment.userId || currentUser?.id }
        const data = localCache.createLocalPayment(safePayment)
        // Carry the stable receiptNumber minted at creation into the queue so the
        // sync handler can use it as an idempotency key — a retried payment is
        // then recognised instead of inserted twice (which would double-count money).
        syncManager.addToQueue('payments:create', { ...safePayment, receiptNumber: data.receiptNumber, createdAt: data.createdAt, localId: data.id }, data.id, currentUser?.id)
        return { data }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('payments:delete', async (_e, id: string) => {
    try {
      requireDb()
      await prisma.payment.delete({ where: { id } })
      localCache.deleteLocalPayment(id)
      return { success: true }
    } catch (err: any) {
      if (isNetworkError(err)) {
        localCache.deleteLocalPayment(id)
        if (id.startsWith('local_')) syncManager.removeFromQueue(id)
        else syncManager.addToQueue('payments:delete', { id }, id, currentUser?.id)
        return { success: true }
      }
      return { error: err.message }
    }
  })

  // ── Expenses ──────────────────────────────────────────────────────────────
  ipcMain.handle('expenses:list', async (_e, params: any) => {
    try {
      requireDb()
      const { userId, date, category, page = 1, limit = 10 } = params
      const where: any = { userId }
      if (date) {
        const start = new Date(date)
        const end = new Date(date)
        end.setDate(end.getDate() + 1)
        where.date = { gte: start, lt: end }
      }
      if (category && category !== 'all') where.category = category

      const offset = (page - 1) * limit
      const [total, expenses] = await Promise.all([
        prisma.expense.count({ where }),
        prisma.expense.findMany({ where, orderBy: { date: 'desc' }, skip: offset, take: limit }),
      ])

      try { for (const e of expenses) localCache.cacheExpense(e) } catch {}

      // Merge in any local-only (unsynced) expenses on the first page so they're visible
      // while waiting for the sync queue to drain
      let merged = expenses
      let mergedTotal = total
      if (page === 1) {
        try {
          const pending = localCache.getLocalExpenses(userId, { ...params, page: 1, limit: 1000 }).expenses
            .filter((e: any) => typeof e.id === 'string' && e.id.startsWith('local_'))
          if (pending.length > 0) {
            merged = [...pending, ...expenses].slice(0, limit)
            mergedTotal = total + pending.length
          }
        } catch {}
      }

      return { data: { expenses: merged, pagination: { total: mergedTotal, pages: Math.ceil(mergedTotal / limit), page, limit } } }
    } catch (err: any) {
      if (isNetworkError(err)) {
        const { expenses, total } = localCache.getLocalExpenses(params.userId, params)
        return { data: { expenses, pagination: { total, pages: Math.ceil(total / (params.limit || 10)), page: params.page || 1, limit: params.limit || 10 } } }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('expenses:create', async (_e, expense: any) => {
    try {
      requireDb()
      const fields: any = pickFields(expense, EXPENSE_FIELDS)
      if (fields.date && typeof fields.date === 'string') fields.date = new Date(fields.date)
      const data = await prisma.expense.create({ data: fields })
      localCache.cacheExpense(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        const isoDate = expense.date
          ? (expense.date instanceof Date ? expense.date.toISOString() : new Date(expense.date).toISOString())
          : new Date().toISOString()
        const row = { ...expense, date: isoDate, userId: expense.userId || currentUser?.id, id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        localCache.cacheExpense(row)
        syncManager.addToQueue('expenses:create', { ...row, localId: row.id }, row.id, currentUser?.id)
        return { data: row }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('expenses:update', async (_e, id: string, updates: any) => {
    try {
      requireDb()
      if (updates.date && typeof updates.date === 'string') updates.date = new Date(updates.date)
      const data = await prisma.expense.update({ where: { id }, data: updates })
      localCache.cacheExpense(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        syncManager.addToQueue('expenses:update', { id, updates }, id, currentUser?.id)
        return { data: updates }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('expenses:delete', async (_e, id: string) => {
    try {
      requireDb()
      await prisma.expense.delete({ where: { id } })
      localCache.deleteLocalExpense(id)
      return { success: true }
    } catch (err: any) {
      if (isNetworkError(err)) {
        localCache.deleteLocalExpense(id)
        if (id.startsWith('local_')) syncManager.removeFromQueue(id)
        else syncManager.addToQueue('expenses:delete', { id }, id, currentUser?.id)
        return { success: true }
      }
      return { error: err.message }
    }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', async (_e, userId: string) => {
    try {
      requireDb()
      let data = await prisma.setting.findUnique({ where: { userId } })
      if (!data) {
        data = await prisma.setting.create({
          data: {
            userId,
            opticianName: 'Optical Shop',
            opticianAddress: '123 Main Street, City, Country',
            opticianPhone: '+1 234 567 8900',
            language: 'en',
            currency: 'DA',
            timezone: 'Africa/Algiers',
          },
        })
      }
      localCache.cacheSetting(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        let data = localCache.getLocalSettings(userId)
        if (!data) {
          data = {
            id: `local_settings_${userId}`, userId,
            opticianName: 'Optical Shop',
            opticianAddress: '123 Main Street, City, Country',
            opticianPhone: '+1 234 567 8900',
            language: 'en', currency: 'DA', timezone: 'Africa/Algiers',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          }
          localCache.cacheSetting(data)
        }
        return { data }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('settings:update', async (_e, userId: string, updates: any) => {
    try {
      requireDb()
      const data = await prisma.setting.update({ where: { userId }, data: updates })
      localCache.cacheSetting(data)
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        const existing = localCache.getLocalSettings(userId) || {}
        const merged = { ...existing, ...updates, userId, updatedAt: new Date().toISOString() }
        localCache.cacheSetting(merged)
        syncManager.addToQueue('settings:update', { userId, updates }, userId, currentUser?.id)
        return { data: merged }
      }
      return { error: err.message }
    }
  })

  // ── Users (Admin) ─────────────────────────────────────────────────────────
  ipcMain.handle('users:list', async () => {
    try {
      const data = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      })
      return { data }
    } catch (err: any) {
      if (isNetworkError(err)) {
        // Return cached users from local SQLite (limited)
        const d = localCache.getDb()
        const users = d.prepare('SELECT id, name, email, role, createdAt, updatedAt FROM users ORDER BY createdAt DESC').all()
        return { data: users }
      }
      return { error: err.message }
    }
  })

  ipcMain.handle('users:create', async (_e, userData: any) => {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10)
      const data = await prisma.user.create({
        data: { email: userData.email, name: userData.name, password: hashedPassword, role: userData.role || 'ASSISTANT' },
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
      })
      localCache.cacheUser({ ...data, password: hashedPassword })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('users:update', async (_e, id: string, updates: any) => {
    try {
      if (updates.password) updates.password = await bcrypt.hash(updates.password, 10)
      const data = await prisma.user.update({
        where: { id },
        data: updates,
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
      })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('users:delete', async (_e, id: string) => {
    try { await prisma.user.delete({ where: { id } }); return { success: true } }
    catch (err: any) { return { error: err.message } }
  })

  // ── Dashboard Stats (matches web app's /api/dashboard/stats exactly) ─────
  ipcMain.handle('dashboard:stats', async (_e, params: any) => {
    try {
      if (!isDbAvailable()) {
        return { data: localCache.getLocalDashboardStats(params.userId, params.filter) }
      }
      const { userId, filter = 'all', startDate: startParam, endDate: endParam } = params
      const now = new Date()

      let startDate: Date | null = null
      let endDate = new Date(now)

      switch (filter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case 'week': {
          const day = now.getDay()
          startDate = new Date(now)
          startDate.setDate(now.getDate() - day)
          startDate.setHours(0, 0, 0, 0)
          break
        }
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        case 'custom':
          if (startParam) startDate = new Date(startParam)
          if (endParam) {
            endDate = new Date(endParam)
            if (String(endParam).indexOf('T') === -1 || String(endParam).endsWith('T00:00:00.000Z')) {
              endDate.setHours(23, 59, 59, 999)
            }
          }
          break
      }

      // Combined date filter for orders
      const combinedDateFilter: any = startDate
        ? { AND: [{ userId }, { createdAt: { gte: startDate, lte: endDate } }] }
        : { userId }

      // Payment where: payments linked to user's orders OR directly to user
      const paymentWhere: any = {
        AND: [
          { OR: [{ order: { userId } }, { userId }] },
          ...(startDate ? [{ paymentDate: { gte: startDate, lte: endDate } }] : []),
        ],
      }

      const expenseWhere: any = {
        userId,
        ...(startDate ? { date: { gte: startDate, lte: endDate } } : {}),
      }

      // Build previous period filters for growth calculation
      let prevPaymentWhere: any = null
      let prevExpenseWhere: any = null
      let prevOrderWhere: any = null
      let prevCustomerWhere: any = null
      let prevPrescriptionWhere: any = null
      if (startDate) {
        const periodLength = endDate.getTime() - startDate.getTime()
        const previousStart = new Date(startDate.getTime() - periodLength)
        const previousEnd = new Date(startDate.getTime())
        prevPaymentWhere = { AND: [{ OR: [{ order: { userId } }, { userId }] }, { paymentDate: { gte: previousStart, lt: previousEnd } }] }
        prevExpenseWhere = { userId, date: { gte: previousStart, lt: previousEnd } }
        prevOrderWhere = { AND: [{ userId }, { createdAt: { gte: previousStart, lt: previousEnd } }] }
        prevCustomerWhere = { userId, createdAt: { gte: previousStart, lt: previousEnd } }
        prevPrescriptionWhere = { customer: { userId }, createdAt: { gte: previousStart, lt: previousEnd } }
      }

      // Single batch: ALL queries in parallel
      const queries: Promise<any>[] = [
        prisma.customer.count({ where: { userId } }),                                              // 0
        prisma.order.count({ where: combinedDateFilter }),                                          // 1
        prisma.prescription.count({ where: { customer: { userId } } }),                            // 2
        prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),                 // 3
        prisma.payment.groupBy({ by: ['paymentMethod'], where: paymentWhere, _sum: { amount: true } }), // 4
        prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true } }),                 // 5
        prisma.order.aggregate({ where: combinedDateFilter, _sum: { totalPrice: true, depositAmount: true } }), // 6
      ]
      // Previous period queries (only when date-filtered)
      if (startDate) {
        queries.push(
          prisma.payment.aggregate({ where: prevPaymentWhere, _sum: { amount: true } }),           // 7
          prisma.expense.aggregate({ where: prevExpenseWhere, _sum: { amount: true } }),            // 8
          prisma.order.count({ where: prevOrderWhere }),                                            // 9
          prisma.customer.count({ where: prevCustomerWhere }),                                      // 10
          prisma.prescription.count({ where: prevPrescriptionWhere }),                              // 11
        )
      }

      const results = await Promise.all(queries)
      const totalCustomers = results[0]
      const filteredOrders = results[1]
      const totalPrescriptions = results[2]
      const totalPayments = results[3]
      const revenueBreakdown = results[4]
      const totalExpenses = results[5]
      const orderStats = results[6]
      const previousRevenueAmount = startDate ? (results[7]._sum.amount || 0) : 0
      const previousExpensesAmount = startDate ? (results[8]._sum.amount || 0) : 0
      const prevOrders = startDate ? results[9] : 0
      const prevCustomers = startDate ? results[10] : 0
      const prevPrescriptions = startDate ? results[11] : 0

      // Process results — revenue = payments minus expenses (matches payments page)
      const revenueAmount = totalPayments._sum.amount || 0
      const expensesAmount = totalExpenses._sum.amount || 0
      const netRevenue = revenueAmount - expensesAmount
      const formattedRevenue = Math.round(netRevenue)
      const formattedPayments = Math.round(revenueAmount)

      const previousNetRevenue = previousRevenueAmount - previousExpensesAmount
      const revenueGrowth = previousNetRevenue > 0
        ? Math.round(((netRevenue - previousNetRevenue) / previousNetRevenue) * 100)
        : netRevenue > 0 ? 100 : 0

      const calcGrowth = (current: number, previous: number) =>
        previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0
      const customerGrowth = startDate ? calcGrowth(totalCustomers, prevCustomers) : 0
      const orderGrowth = startDate ? calcGrowth(filteredOrders, prevOrders) : 0
      const prescriptionGrowth = startDate ? calcGrowth(totalPrescriptions, prevPrescriptions) : 0

      const orderAmountsTotal = orderStats._sum.totalPrice || 0
      const depositsTotal = orderStats._sum.depositAmount || 0

      const paymentMethodBreakdown = revenueBreakdown.map((item: any) => ({
        method: item.paymentMethod || 'Unknown',
        amount: Math.round(item._sum.amount || 0),
        percentage: formattedPayments > 0 ? Math.round(((item._sum.amount || 0) / formattedPayments) * 100) : 0,
      }))

      // Keep local cache fresh after every online dashboard view (debounced)
      hydrateCurrentUserCache('dashboard-online', false).catch(() => {})
      return {
        data: {
          totalCustomers,
          ordersThisMonth: filteredOrders,
          totalPrescriptions,
          totalRevenue: formattedRevenue,
          totalPayments: formattedPayments,
          totalOrderAmount: Math.round(orderAmountsTotal),
          customerGrowth,
          orderGrowth,
          prescriptionGrowth,
          revenueGrowth,
          paymentMethodBreakdown,
          revenueAnalytics: {
            deposits: Math.round(depositsTotal),
            payments: formattedPayments,
            outstanding: Math.max(0, Math.round(orderAmountsTotal) - formattedPayments),
            collectionRate: orderAmountsTotal > 0 ? Math.round((formattedPayments / orderAmountsTotal) * 100) : 0,
          },
          lastUpdated: new Date().toISOString(),
          filter,
          currency: 'DA',
        },
      }
    } catch (err: any) {
      if (isNetworkError(err)) {
        return { data: localCache.getLocalDashboardStats(params.userId, params.filter) }
      }
      return { error: err.message }
    }
  })

  // ── Dashboard: Revenue Timeline (daily grouped) ─────────────────────────
  ipcMain.handle('dashboard:revenueTimeline', async (_e, params: any) => {
    try {
      requireDb()
      const { userId, filter = 'month', startDate: startParam, endDate: endParam } = params
      const now = new Date()

      let startDate: Date
      let endDate = new Date(now)

      switch (filter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case 'week': {
          const day = now.getDay()
          startDate = new Date(now)
          startDate.setDate(now.getDate() - day)
          startDate.setHours(0, 0, 0, 0)
          break
        }
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        case 'custom':
          startDate = startParam ? new Date(startParam) : new Date(now.getFullYear(), now.getMonth(), 1)
          if (endParam) {
            endDate = new Date(endParam)
            endDate.setHours(23, 59, 59, 999)
          }
          break
        default:
          startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
          break
      }

      const payments = await prisma.payment.findMany({
        where: {
          OR: [{ order: { userId } }, { userId }],
          paymentDate: { gte: startDate, lte: endDate },
        },
        select: { amount: true, paymentDate: true },
        orderBy: { paymentDate: 'asc' },
      })

      const expenses = await prisma.expense.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
        },
        select: { amount: true, date: true },
        orderBy: { date: 'asc' },
      })

      // Group by day
      const dayMap = new Map<string, { revenue: number; expenses: number }>()

      // Fill all days in range
      const cursor = new Date(startDate)
      while (cursor <= endDate) {
        const key = cursor.toISOString().slice(0, 10)
        dayMap.set(key, { revenue: 0, expenses: 0 })
        cursor.setDate(cursor.getDate() + 1)
      }

      for (const p of payments) {
        const key = new Date(p.paymentDate).toISOString().slice(0, 10)
        const entry = dayMap.get(key)
        if (entry) entry.revenue += p.amount
        else dayMap.set(key, { revenue: p.amount, expenses: 0 })
      }

      for (const e of expenses) {
        const key = new Date(e.date).toISOString().slice(0, 10)
        const entry = dayMap.get(key)
        if (entry) entry.expenses += e.amount
        else dayMap.set(key, { revenue: 0, expenses: e.amount })
      }

      const timeline = Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({
          date,
          revenue: Math.round(vals.revenue),
          expenses: Math.round(vals.expenses),
          net: Math.round(vals.revenue - vals.expenses),
        }))

      return { data: timeline }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        return { data: localCache.getLocalRevenueTimeline(params.userId, params.filter, params.startDate, params.endDate) }
      }
      return { error: err.message }
    }
  })

  // ── Dashboard: Recent Activity ───────────────────────────────────────────
  ipcMain.handle('dashboard:recentActivity', async (_e, params: any) => {
    try {
      requireDb()
      const { userId, limit = 10 } = params
      const [recentOrders, recentCustomers, recentPayments] = await Promise.all([
        prisma.order.findMany({
          where: { userId },
          include: { customer: { select: { firstName: true, lastName: true } } },
          orderBy: [{ createdAt: 'desc' }, { orderNumber: 'desc' }],
          take: limit,
        }),
        prisma.customer.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        prisma.payment.findMany({
          where: { OR: [{ userId }, { order: { userId } }] },
          include: { order: { select: { orderNumber: true, customer: { select: { firstName: true, lastName: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
      ])

      // Merge into a single activity feed sorted by date
      const activities: any[] = []
      recentOrders.forEach((o: any) => activities.push({
        type: 'order', date: o.createdAt, data: {
          orderNumber: o.orderNumber, status: o.status,
          customer: `${o.customer?.firstName || ''} ${o.customer?.lastName || ''}`.trim(),
          amount: o.totalPrice,
        },
      }))
      recentCustomers.forEach((c: any) => activities.push({
        type: 'customer', date: c.createdAt, data: {
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
          phone: c.phone,
        },
      }))
      recentPayments.forEach((p: any) => activities.push({
        type: 'payment', date: p.createdAt, data: {
          amount: p.amount, method: p.paymentMethod,
          orderNumber: p.order?.orderNumber,
          customer: `${p.order?.customer?.firstName || ''} ${p.order?.customer?.lastName || ''}`.trim(),
        },
      }))

      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      return { data: activities.slice(0, limit) }
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (!err._offlineFastPath) markDbUnreachable()
        return { data: localCache.getLocalRecentActivity(params.userId, params.limit) }
      }
      return { error: err.message }
    }
  })
}

// ── AI: Scan Ordonnance (Google Gemini direct API) ──────────────────────
function registerAiHandlers() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
  const GEMINI_MODELS = [
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
  ]

  const systemPrompt = `You are an expert Algerian ophthalmology assistant specializing in reading optical prescriptions (ordonnances).

Your task: Analyze the provided prescription image and extract ALL optical correction values.

IMPORTANT RULES:
- Algerian prescriptions use French terminology: OD = Oeil Droit (Right Eye), OG/OS = Oeil Gauche (Left Eye)
- VL = Vision de Loin (Distance Vision), VP = Vision de Près (Near Vision)
- SPH = Sphère, CYL = Cylindre, AXE = Axe, ADD = Addition
- EP/PD = Écart Pupillaire (Pupillary Distance)
- Return numeric strings with sign (e.g. "+1.50", "-0.75", "0.00")
- Axis values are integers in degrees (e.g. "90", "180", "0")
- Addition values are always positive (e.g. "+1.50", "+2.00")
- If a value is not present or unreadable, return null
- If there is no VP section, set all VP fields to null
- If there is no VL section, set all VL fields to null
- The "Addition" field for VL is typically null unless explicitly stated
- Pupillary distance (EP) is usually a single number in mm (e.g. "63", "65")

You MUST respond with ONLY a valid JSON object, no markdown, no explanation, no extra text. Just the raw JSON:
{
  "vlRightEyeSphere": string | null,
  "vlRightEyeCylinder": string | null,
  "vlRightEyeAxis": string | null,
  "vlRightEyeAddition": string | null,
  "vlLeftEyeSphere": string | null,
  "vlLeftEyeCylinder": string | null,
  "vlLeftEyeAxis": string | null,
  "vlLeftEyeAddition": string | null,
  "vpRightEyeSphere": string | null,
  "vpRightEyeCylinder": string | null,
  "vpRightEyeAxis": string | null,
  "vpRightEyeAddition": string | null,
  "vpLeftEyeSphere": string | null,
  "vpLeftEyeCylinder": string | null,
  "vpLeftEyeAxis": string | null,
  "vpLeftEyeAddition": string | null,
  "pupillaryDistance": string | null
}`

  // Helper: Google Gemini API call
  async function callGemini(model: string, base64Data: string, mimeType: string): Promise<string> {
    const https = await import('node:https')
    const payload = {
      contents: [{
        parts: [
          { text: systemPrompt },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      }
    }
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload)
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 90000,
      }, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          if (res.statusCode === 429) {
            reject(new Error('RATE_LIMITED'))
          } else if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Gemini error ${res.statusCode}: ${data.slice(0, 300)}`))
          } else {
            resolve(data)
          }
        })
      })
      req.on('timeout', () => { req.destroy(); reject(new Error('AI request timed out (90s)')) })
      req.on('error', (e: Error) => reject(e))
      req.write(body)
      req.end()
    })
  }

  ipcMain.handle('ai:scanOrdonnance', async (_e, imageBase64: string) => {
    if (!GEMINI_API_KEY) {
      return { error: 'Clé API Gemini non configurée. Ajoutez GEMINI_API_KEY dans le fichier .env' }
    }
    try {
      // Detect mime type and strip data URI prefix
      let mimeType = 'image/jpeg'
      if (imageBase64.startsWith('data:')) {
        const match = imageBase64.match(/^data:(image\/\w+|application\/pdf);base64,/)
        if (match) mimeType = match[1]
      }
      const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '')

      // Try each Gemini model with retry on 429
      let lastError = ''
      for (const model of GEMINI_MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`AI scan: retry for ${model} (waiting 2s)...`)
              await new Promise(r => setTimeout(r, 2000))
            }
            console.log(`AI scan: trying ${model}...`)
            const responseText = await callGemini(model, base64Data, mimeType)
            const response = JSON.parse(responseText)
            const textContent = response?.candidates?.[0]?.content?.parts?.[0]?.text
            if (!textContent) { lastError = 'Empty AI response'; continue }

            let jsonStr = textContent.trim()
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
            if (jsonMatch) jsonStr = jsonMatch[1].trim()

            const parsed = JSON.parse(jsonStr)
            console.log(`AI scan: success with ${model}`)
            return { data: parsed }
          } catch (err: any) {
            lastError = err.message || 'Unknown error'
            if (err.message === 'RATE_LIMITED') {
              console.log(`AI scan: 429 on ${model}, attempt ${attempt + 1}`)
              continue
            }
            console.log(`AI scan: ${model} failed: ${lastError}`)
            break // try next model
          }
        }
      }

      return { error: `AI indisponible. Réessayez dans quelques instants. Détail: ${lastError}` }
    } catch (err: any) {
      console.error('AI scan error:', err)
      return { error: err.message || 'Failed to scan prescription image' }
    }
  })
}

// Disconnect Prisma on quit
app.on('before-quit', async () => {
  logInfo('App shutting down')
  closeMonitoring()
  await prisma.$disconnect()
})
