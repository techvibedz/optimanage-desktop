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
import { initMonitoring, captureException, closeMonitoring, getIpcTimings } from './monitoring'

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
  ? path.join(process.resourcesPath, '.env')
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
      }
    } catch { /* ignore */ }
  }
  setInterval(checkConnectivity, 3000)
  // Initial check after a short delay (let the window load first)
  setTimeout(checkConnectivity, 1000)

  ipcMain.handle('connectivity:check', () => {
    try { return net.isOnline() } catch { return true }
  })

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
    const ifaces = os.networkInterfaces()
    for (const list of Object.values(ifaces)) {
      if (!list) continue
      for (const net of list) {
        // Node typings: family is 'IPv4' on >=18, was 4 on older versions.
        const isV4 = (net.family as any) === 'IPv4' || (net.family as any) === 4
        if (isV4 && !net.internal && net.address && !net.address.startsWith('127.')) {
          return net.address
        }
      }
    }
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

// ─── IPC Handlers (Prisma) ───────────────────────────────────────────────────

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

function registerIpcHandlers() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:login', async (_e, email: string, password: string) => {
    try {
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return { error: 'Invalid email or password' }

      const passwordMatch = await bcrypt.compare(password, user.password)
      if (!passwordMatch) return { error: 'Invalid email or password' }

      currentUser = { id: user.id, email: user.email, name: user.name, role: user.role }
      saveSession(currentUser)
      return { data: { user: currentUser } }
    } catch (err: any) {
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
    return { data: { user: currentUser } }
  })

  // ── Customers ─────────────────────────────────────────────────────────────
  ipcMain.handle('customers:list', async (_e, params: { userId: string; query?: string; limit?: number }) => {
    try {
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
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true, updatedAt: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...(params.limit ? { take: params.limit } : {}),
      })
      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('customers:get', async (_e, id: string) => {
    try {
      const data = await prisma.customer.findUnique({ where: { id } })
      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('customers:create', async (_e, customer: any) => {
    try {
      const data = await prisma.customer.create({ data: pickFields(customer, CUSTOMER_FIELDS) as any })
      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('customers:update', async (_e, id: string, updates: any) => {
    try {
      // Whitelist + sanitize optional fields — convert empty strings to null
      const clean: any = pickFields(updates, CUSTOMER_FIELDS)
      for (const key of ['email', 'phone', 'address', 'notes', 'insuranceProvider', 'insurancePolicyNumber', 'insuranceCoverageDetails']) {
        if (clean[key] === '') clean[key] = null
      }
      // Convert dateOfBirth string to Date or null
      if (clean.dateOfBirth === '' || clean.dateOfBirth === undefined) {
        delete clean.dateOfBirth
      } else if (typeof clean.dateOfBirth === 'string') {
        clean.dateOfBirth = new Date(clean.dateOfBirth)
      }
      const data = await prisma.customer.update({ where: { id }, data: clean })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('customers:delete', async (_e, id: string) => {
    try {
      await prisma.customer.delete({ where: { id } })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // ── Orders ────────────────────────────────────────────────────────────────
  ipcMain.handle('orders:list', async (_e, params: any) => {
    try {
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

      return { data: { orders, pagination: { total, pages: Math.ceil(total / limit), page, limit } } }
    } catch (err: any) {
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
      const data = await prisma.order.findUnique({
        where: { id },
        include: { customer: true, prescription: true, frame: true, lensType: true, payments: true, vlRightEyeLensType: true, vlLeftEyeLensType: true, vpRightEyeLensType: true, vpLeftEyeLensType: true },
      })
      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:create', async (_e, orderData: any) => {
    try {
      // Always compute order number server-side to avoid race conditions / duplicates
      const allOrders = await prisma.order.findMany({
        where: { userId: orderData.userId },
        select: { orderNumber: true },
      })
      let maxNum = 0
      for (const o of allOrders) {
        const match = o.orderNumber?.match(/ORD-(\d+)/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > maxNum) maxNum = num
        }
      }
      orderData.orderNumber = `ORD-${String(maxNum + 1).padStart(3, '0')}`

      // Extract relation connect fields
      const { depositAmount, frameId, ...rest } = orderData
      const createData: any = { ...rest, depositAmount }
      // Remove relation keys that Prisma doesn't accept as plain strings in create
      delete createData.customer
      delete createData.prescription
      delete createData.frame
      delete createData.lensType

      const data = await prisma.order.create({
        data: createData,
        include: { customer: true, prescription: true, frame: true, lensType: true, vlRightEyeLensType: true, vlLeftEyeLensType: true, vpRightEyeLensType: true, vpLeftEyeLensType: true },
      })

      // Create initial deposit payment
      if (depositAmount && depositAmount > 0) {
        await prisma.payment.create({
          data: {
            orderId: data.id,
            amount: depositAmount,
            paymentMethod: 'cash',
            receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
            reference: 'Initial deposit',
            paymentDate: new Date(),
            userId: orderData.userId,
          },
        })
      }

      // Decrement frame stock
      if (frameId) {
        await prisma.frame.updateMany({
          where: { id: frameId, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        })
      }

      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:update', async (_e, id: string, updates: any) => {
    try {
      const data = await prisma.order.update({ where: { id }, data: updates })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('orders:delete', async (_e, id: string) => {
    try {
      await prisma.order.delete({ where: { id } })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('orders:latestNumber', async (_e, userId: string) => {
    try {
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
      return { error: err.message }
    }
  })

  // ── Prescriptions ─────────────────────────────────────────────────────────
  ipcMain.handle('prescriptions:list', async (_e, params: any) => {
    try {
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
        // Combine with existing where using AND
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

      return { data: { prescriptions, pagination: { total, pages: Math.ceil(total / limit), page, limit } } }
    } catch (err: any) {
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
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('prescriptions:create', async (_e, prescription: any) => {
    try {
      const data = await prisma.prescription.create({ data: prescription })
      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('prescriptions:update', async (_e, id: string, updates: any) => {
    try {
      const data = await prisma.prescription.update({ where: { id }, data: updates })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('prescriptions:delete', async (_e, id: string) => {
    try {
      await prisma.prescription.delete({ where: { id } })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // ── Frames ────────────────────────────────────────────────────────────────
  ipcMain.handle('frames:list', async (_e, params: { userId: string; query?: string }) => {
    try {
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
      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('frames:create', async (_e, frame: any) => {
    try {
      const data = await prisma.frame.create({ data: pickFields(frame, FRAME_FIELDS) as any })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('frames:update', async (_e, id: string, updates: any) => {
    try {
      const data = await prisma.frame.update({ where: { id }, data: pickFields(updates, FRAME_FIELDS) })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('frames:delete', async (_e, id: string) => {
    try {
      await prisma.frame.delete({ where: { id } })
      return { success: true }
    } catch (err: any) { return { error: err.message } }
  })

  // ── Lens Types ────────────────────────────────────────────────────────────
  ipcMain.handle('lensTypes:list', async (_e, params: { userId: string; search?: string }) => {
    try {
      const where: any = { userId: params.userId }
      if (params.search) {
        where.OR = [
          { name: { contains: params.search, mode: 'insensitive' } },
          { category: { contains: params.search, mode: 'insensitive' } },
          { material: { contains: params.search, mode: 'insensitive' } },
        ]
      }
      const data = await prisma.lensType.findMany({ where, orderBy: { name: 'asc' } })
      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('lensTypes:create', async (_e, lensType: any) => {
    try {
      const data = await prisma.lensType.create({ data: pickFields(lensType, LENS_TYPE_FIELDS) as any })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('lensTypes:update', async (_e, id: string, updates: any) => {
    try {
      const data = await prisma.lensType.update({ where: { id }, data: pickFields(updates, LENS_TYPE_FIELDS) })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('lensTypes:delete', async (_e, id: string) => {
    try {
      await prisma.lensType.delete({ where: { id } })
      return { success: true }
    } catch (err: any) { return { error: err.message } }
  })

  // ── Contact Lenses ──────────────────────────────────────────────────────
  ipcMain.handle('contactLenses:list', async (_e, params: { userId: string; search?: string }) => {
    try {
      const where: any = { userId: params.userId }
      if (params.search) {
        where.OR = [
          { brand: { contains: params.search, mode: 'insensitive' } },
          { model: { contains: params.search, mode: 'insensitive' } },
        ]
      }
      const data = await prisma.contactLens.findMany({ where, orderBy: { brand: 'asc' } })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('contactLenses:create', async (_e, contactLens: any) => {
    try { return { data: await prisma.contactLens.create({ data: pickFields(contactLens, CONTACT_LENS_FIELDS) as any }) } }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('contactLenses:update', async (_e, id: string, updates: any) => {
    try { return { data: await prisma.contactLens.update({ where: { id }, data: pickFields(updates, CONTACT_LENS_FIELDS) }) } }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('contactLenses:delete', async (_e, id: string) => {
    try { await prisma.contactLens.delete({ where: { id } }); return { success: true } }
    catch (err: any) { return { error: err.message } }
  })

  // ── Payments ──────────────────────────────────────────────────────────────
  ipcMain.handle('payments:list', async (_e, params: any) => {
    try {
      const { userId, orderId, search, startDate, endDate, paymentMethod, page = 1, limit = 15 } = params
      // Match payments belonging to the user directly OR via their orders
      const userFilter = userId ? { OR: [{ userId }, { order: { userId } }] } : {}
      const where: any = { ...userFilter }
      if (orderId) where.orderId = orderId
      if (startDate) where.paymentDate = { ...(where.paymentDate || {}), gte: new Date(startDate) }
      if (endDate) where.paymentDate = { ...(where.paymentDate || {}), lte: new Date(endDate) }
      if (paymentMethod) where.paymentMethod = { contains: paymentMethod, mode: 'insensitive' }
      if (search) {
        // Wrap existing conditions in AND to combine with search OR
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

      return { data: { payments, pagination: { total, pages: Math.ceil(total / limit), page, limit }, totalAmount: agg._sum.amount || 0 } }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('payments:create', async (_e, payment: any) => {
    try {
      if (!payment.receiptNumber) {
        payment.receiptNumber = `RCT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 10000)}`
      }
      const data = await prisma.payment.create({ data: payment })

      // Update order balance
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

      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('payments:delete', async (_e, id: string) => {
    try {
      await prisma.payment.delete({ where: { id } })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // ── Expenses ──────────────────────────────────────────────────────────────
  ipcMain.handle('expenses:list', async (_e, params: any) => {
    try {
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

      return { data: { expenses, pagination: { total, pages: Math.ceil(total / limit), page, limit } } }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('expenses:create', async (_e, expense: any) => {
    try {
      if (expense.date && typeof expense.date === 'string') expense.date = new Date(expense.date)
      const data = await prisma.expense.create({ data: expense })
      return { data }
    }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('expenses:update', async (_e, id: string, updates: any) => {
    try {
      if (updates.date && typeof updates.date === 'string') updates.date = new Date(updates.date)
      const data = await prisma.expense.update({ where: { id }, data: updates })
      return { data }
    }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('expenses:delete', async (_e, id: string) => {
    try {
      await prisma.expense.delete({ where: { id } })
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', async (_e, userId: string) => {
    try {
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
      return { data }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('settings:update', async (_e, userId: string, updates: any) => {
    try {
      const data = await prisma.setting.update({ where: { userId }, data: updates })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  // ── Users (Admin) ─────────────────────────────────────────────────────────
  ipcMain.handle('users:list', async () => {
    try {
      const data = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('users:create', async (_e, userData: any) => {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10)
      const data = await prisma.user.create({
        data: { email: userData.email, name: userData.name, password: hashedPassword, role: userData.role || 'ASSISTANT' },
        select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
      })
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

      return {
        data: {
          totalCustomers,
          ordersThisMonth: filteredOrders,
          totalPrescriptions,
          totalRevenue: formattedRevenue,
          totalPayments: formattedPayments,
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
      return { error: err.message }
    }
  })

  // ── Dashboard: Recent Activity ───────────────────────────────────────────
  ipcMain.handle('dashboard:recentActivity', async (_e, params: any) => {
    try {
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
