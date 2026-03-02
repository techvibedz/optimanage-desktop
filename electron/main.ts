import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import fs from 'node:fs'
import Module from 'node:module'

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
  registerIpcHandlers()
  registerAiHandlers()
  createWindow()

  // ── Auto Update (only in production) ─────────────────────────────────────
  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    // Private repo: always set the GitHub token for authentication
    const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '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'
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'techvibedz',
      repo: 'optimanage-desktop',
      private: true,
      token: ghToken,
    })

    autoUpdater.on('checking-for-update', () => {
      console.log('Auto-update: checking for updates...')
    })

    autoUpdater.on('update-available', (info: any) => {
      console.log('Auto-update: update available', info.version)
      mainWindow?.webContents.send('update-status', { status: 'downloading', version: info.version })
    })

    autoUpdater.on('update-not-available', (info: any) => {
      console.log('Auto-update: no update available. Current:', app.getVersion(), 'Latest:', info.version)
    })

    autoUpdater.on('update-downloaded', (info: any) => {
      console.log('Auto-update: downloaded', info.version)
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart to apply the update.`,
        buttons: ['Restart Now', 'Later'],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
    })

    autoUpdater.on('error', (err: any) => {
      console.error('Auto-update error:', err.message)
    })

    // Check for updates after 3 seconds (avoid blocking startup)
    setTimeout(() => {
      console.log('Auto-update: initiating check. App version:', app.getVersion())
      autoUpdater.checkForUpdatesAndNotify().catch((err: any) => {
        console.error('Auto-update check failed:', err.message)
      })
    }, 3000)
  }

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
        take: params.limit || 50,
      })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('customers:get', async (_e, id: string) => {
    try {
      const data = await prisma.customer.findUnique({ where: { id } })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('customers:create', async (_e, customer: any) => {
    try {
      const data = await prisma.customer.create({ data: customer })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('customers:update', async (_e, id: string, updates: any) => {
    try {
      const data = await prisma.customer.update({ where: { id }, data: updates })
      return { data }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('customers:delete', async (_e, id: string) => {
    try {
      await prisma.customer.delete({ where: { id } })
      return { success: true }
    } catch (err: any) { return { error: err.message } }
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
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
      ])

      return { data: { orders, pagination: { total, pages: Math.ceil(total / limit), page, limit } } }
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('orders:get', async (_e, id: string) => {
    try {
      const data = await prisma.order.findUnique({
        where: { id },
        include: { customer: true, prescription: true, frame: true, lensType: true, payments: true, vlRightEyeLensType: true, vlLeftEyeLensType: true, vpRightEyeLensType: true, vpLeftEyeLensType: true },
      })
      return { data }
    } catch (err: any) { return { error: err.message } }
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
    } catch (err: any) { return { error: err.message } }
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
    } catch (err: any) { return { error: err.message } }
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
    } catch { return { data: null } }
  })

  // ── Prescriptions ─────────────────────────────────────────────────────────
  ipcMain.handle('prescriptions:list', async (_e, params: any) => {
    try {
      const { userId, customerId, page = 1, limit = 10 } = params
      const where: any = {}
      if (customerId) where.customerId = customerId
      else if (userId) where.customer = { userId }

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
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('prescriptions:create', async (_e, prescription: any) => {
    try {
      const data = await prisma.prescription.create({ data: prescription })
      return { data }
    } catch (err: any) { return { error: err.message } }
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
    } catch (err: any) { return { error: err.message } }
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
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('frames:create', async (_e, frame: any) => {
    try { return { data: await prisma.frame.create({ data: frame }) } }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('frames:update', async (_e, id: string, updates: any) => {
    try { return { data: await prisma.frame.update({ where: { id }, data: updates }) } }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('frames:delete', async (_e, id: string) => {
    try { await prisma.frame.delete({ where: { id } }); return { success: true } }
    catch (err: any) { return { error: err.message } }
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
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('lensTypes:create', async (_e, lensType: any) => {
    try { return { data: await prisma.lensType.create({ data: lensType }) } }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('lensTypes:update', async (_e, id: string, updates: any) => {
    try { return { data: await prisma.lensType.update({ where: { id }, data: updates }) } }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('lensTypes:delete', async (_e, id: string) => {
    try { await prisma.lensType.delete({ where: { id } }); return { success: true } }
    catch (err: any) { return { error: err.message } }
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
    try { return { data: await prisma.contactLens.create({ data: contactLens }) } }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('contactLenses:update', async (_e, id: string, updates: any) => {
    try { return { data: await prisma.contactLens.update({ where: { id }, data: updates }) } }
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
      const [total, payments] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.findMany({
          where,
          include: { order: { select: { id: true, orderNumber: true, customer: { select: { id: true, firstName: true, lastName: true } } } } },
          orderBy: { paymentDate: 'desc' },
          skip: offset,
          take: limit,
        }),
      ])

      return { data: { payments, pagination: { total, pages: Math.ceil(total / limit), page, limit } } }
    } catch (err: any) { return { error: err.message } }
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
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('payments:delete', async (_e, id: string) => {
    try { await prisma.payment.delete({ where: { id } }); return { success: true } }
    catch (err: any) { return { error: err.message } }
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
    } catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('expenses:create', async (_e, expense: any) => {
    try {
      if (expense.date && typeof expense.date === 'string') expense.date = new Date(expense.date)
      return { data: await prisma.expense.create({ data: expense }) }
    }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('expenses:update', async (_e, id: string, updates: any) => {
    try {
      if (updates.date && typeof updates.date === 'string') updates.date = new Date(updates.date)
      return { data: await prisma.expense.update({ where: { id }, data: updates }) }
    }
    catch (err: any) { return { error: err.message } }
  })

  ipcMain.handle('expenses:delete', async (_e, id: string) => {
    try { await prisma.expense.delete({ where: { id } }); return { success: true } }
    catch (err: any) { return { error: err.message } }
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
    } catch (err: any) { return { error: err.message } }
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

      // Batch 1: Counts
      const [totalCustomers, filteredOrders, totalPrescriptions] = await Promise.all([
        prisma.customer.count({ where: { userId } }),
        prisma.order.count({ where: combinedDateFilter }),
        prisma.prescription.count({ where: { customer: { userId } } }),
      ])

      // Batch 2: Financial aggregates
      const [totalPayments, revenueBreakdown, totalExpenses] = await Promise.all([
        prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
        prisma.payment.groupBy({ by: ['paymentMethod'], where: paymentWhere, _sum: { amount: true } }),
        prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true } }),
      ])

      // Batch 3: Previous period for growth calculation
      let previousRevenueAmount = 0
      let previousExpensesAmount = 0

      if (startDate) {
        const periodLength = endDate.getTime() - startDate.getTime()
        const previousStart = new Date(startDate.getTime() - periodLength)
        const previousEnd = new Date(startDate.getTime())

        const [prevRevenue, prevExpenses] = await Promise.all([
          prisma.payment.aggregate({
            where: { AND: [{ OR: [{ order: { userId } }, { userId }] }, { paymentDate: { gte: previousStart, lt: previousEnd } }] },
            _sum: { amount: true },
          }),
          prisma.expense.aggregate({
            where: { userId, date: { gte: previousStart, lt: previousEnd } },
            _sum: { amount: true },
          }),
        ])
        previousRevenueAmount = prevRevenue._sum.amount || 0
        previousExpensesAmount = prevExpenses._sum.amount || 0
      }

      // Order financial stats
      const orderStats = await prisma.order.aggregate({
        where: combinedDateFilter,
        _sum: { totalPrice: true, depositAmount: true },
      })

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
    } catch (err: any) { return { error: err.message } }
  })
}

// ── AI: Scan Ordonnance (OpenRouter + Gemini fallback) ───────────────────
function registerAiHandlers() {
  const OPENROUTER_API_KEY = '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'
  // Free vision models on OpenRouter (best first)
  const OPENROUTER_MODELS = [
    'google/gemini-2.0-flash-exp:free',
    'google/gemini-2.0-flash-thinking-exp:free',
    'meta-llama/llama-4-maverick:free',
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

  // Helper: OpenRouter API call (OpenAI-compatible format)
  async function callOpenRouter(model: string, base64Data: string, mimeType: string): Promise<string> {
    const https = await import('node:https')
    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload)
      const req = https.request({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://optimanage.app',
          'X-Title': 'OptiManage Ordonnance Scanner',
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
            reject(new Error(`OpenRouter error ${res.statusCode}: ${data.slice(0, 300)}`))
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
    try {
      // Detect mime type and strip data URI prefix
      let mimeType = 'image/jpeg'
      if (imageBase64.startsWith('data:')) {
        const match = imageBase64.match(/^data:(image\/\w+|application\/pdf);base64,/)
        if (match) mimeType = match[1]
      }
      const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '')

      // Try each OpenRouter model with retry on 429
      let lastError = ''
      for (const model of OPENROUTER_MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`AI scan: retry ${attempt} for ${model} (waiting 3s)...`)
              await new Promise(r => setTimeout(r, 3000))
            }
            console.log(`AI scan: trying ${model}...`)
            const responseText = await callOpenRouter(model, base64Data, mimeType)
            const response = JSON.parse(responseText)
            const textContent = response?.choices?.[0]?.message?.content
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
  await prisma.$disconnect()
})
