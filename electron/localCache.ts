import { app } from 'electron'
import path from 'node:path'
import Database from 'better-sqlite3'

// ─── Local SQLite database for offline cache ─────────────────────────────────
let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = path.join(app.getPath('userData'), 'optimanage-cache.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initTables()
  return db
}

function initTables() {
  const d = db!
  d.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL DEFAULT '',
      email TEXT,
      phone TEXT,
      dateOfBirth TEXT,
      address TEXT,
      insuranceProvider TEXT,
      insurancePolicyNumber TEXT,
      insuranceCoverageDetails TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      userId TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      examinationDate TEXT NOT NULL,
      doctorName TEXT NOT NULL DEFAULT '',
      doctorLicense TEXT NOT NULL DEFAULT '',
      pupillaryDistance REAL NOT NULL DEFAULT 0,
      readingDistance REAL,
      expirationDate TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      hasVLData INTEGER DEFAULT 0,
      hasVPData INTEGER DEFAULT 0,
      vlLeftEyeAxis REAL, vlLeftEyeCylinder REAL, vlLeftEyePrism REAL, vlLeftEyeSphere REAL,
      vlRightEyeAxis REAL, vlRightEyeCylinder REAL, vlRightEyePrism REAL, vlRightEyeSphere REAL,
      vpLeftEyeAxis REAL, vpLeftEyeCylinder REAL, vpLeftEyePrism REAL, vpLeftEyeSphere REAL,
      vpRightEyeAxis REAL, vpRightEyeCylinder REAL, vpRightEyePrism REAL, vpRightEyeSphere REAL,
      vpLeftEyeAdd REAL, vpRightEyeAdd REAL,
      FOREIGN KEY (customerId) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS frames (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      color TEXT NOT NULL,
      size TEXT NOT NULL,
      cost REAL NOT NULL,
      sellingPrice REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      userId TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lensTypes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      material TEXT NOT NULL,
      "index" REAL NOT NULL,
      baseCost REAL NOT NULL,
      sellingPrice REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      reorderThreshold INTEGER DEFAULT 5,
      supplierName TEXT NOT NULL,
      supplierContact TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      userId TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      orderNumber TEXT NOT NULL,
      customerId TEXT NOT NULL,
      prescriptionId TEXT,
      frameId TEXT,
      lensTypeId TEXT,
      vlRightEyeLensTypeId TEXT,
      vlLeftEyeLensTypeId TEXT,
      vpRightEyeLensTypeId TEXT,
      vpLeftEyeLensTypeId TEXT,
      framePrice REAL,
      vlRightEyeLensPrice REAL,
      vlLeftEyeLensPrice REAL,
      vpRightEyeLensPrice REAL,
      vpLeftEyeLensPrice REAL,
      basePrice REAL NOT NULL DEFAULT 0,
      addonsPrice REAL NOT NULL DEFAULT 0,
      totalPrice REAL NOT NULL DEFAULT 0,
      depositAmount REAL NOT NULL DEFAULT 0,
      balanceDue REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      expectedCompletionDate TEXT NOT NULL,
      actualCompletionDate TEXT,
      customerNotes TEXT,
      technicalNotes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      userId TEXT NOT NULL,
      vlLeftEyeLensQuantity INTEGER DEFAULT 1,
      vlRightEyeLensQuantity INTEGER DEFAULT 1,
      vpLeftEyeLensQuantity INTEGER DEFAULT 1,
      vpRightEyeLensQuantity INTEGER DEFAULT 1,
      FOREIGN KEY (customerId) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      orderId TEXT,
      amount REAL NOT NULL,
      paymentMethod TEXT NOT NULL,
      paymentDate TEXT NOT NULL,
      receiptNumber TEXT UNIQUE,
      reference TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'ORDER',
      userId TEXT,
      FOREIGN KEY (orderId) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      userId TEXT UNIQUE,
      opticianName TEXT DEFAULT 'Optical Shop',
      opticianAddress TEXT DEFAULT '',
      opticianPhone TEXT DEFAULT '',
      opticianEmail TEXT,
      logoUrl TEXT,
      language TEXT DEFAULT 'en',
      currency TEXT DEFAULT 'DA',
      timezone TEXT DEFAULT 'Africa/Algiers',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      userId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)
}

// ─── Helper: convert Date fields to ISO strings for SQLite ──────────────────
function toIso(val: any): string {
  if (!val) return new Date().toISOString()
  if (val instanceof Date) return val.toISOString()
  return String(val)
}

// ─── Upsert helpers ─────────────────────────────────────────────────────────

export function cacheCustomer(c: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO customers (id,firstName,lastName,email,phone,dateOfBirth,address,insuranceProvider,insurancePolicyNumber,insuranceCoverageDetails,notes,createdAt,updatedAt,userId)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    c.id, c.firstName||'', c.lastName||'', c.email||null, c.phone||null,
    c.dateOfBirth ? toIso(c.dateOfBirth) : null, c.address||null,
    c.insuranceProvider||null, c.insurancePolicyNumber||null, c.insuranceCoverageDetails||null,
    c.notes||null, toIso(c.createdAt), toIso(c.updatedAt), c.userId
  )
}

export function cacheOrder(o: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO orders (id,orderNumber,customerId,prescriptionId,frameId,lensTypeId,
    vlRightEyeLensTypeId,vlLeftEyeLensTypeId,vpRightEyeLensTypeId,vpLeftEyeLensTypeId,
    framePrice,vlRightEyeLensPrice,vlLeftEyeLensPrice,vpRightEyeLensPrice,vpLeftEyeLensPrice,
    basePrice,addonsPrice,totalPrice,depositAmount,balanceDue,status,
    expectedCompletionDate,actualCompletionDate,customerNotes,technicalNotes,
    createdAt,updatedAt,userId,
    vlLeftEyeLensQuantity,vlRightEyeLensQuantity,vpLeftEyeLensQuantity,vpRightEyeLensQuantity)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    o.id, o.orderNumber, o.customerId, o.prescriptionId||null, o.frameId||null, o.lensTypeId||null,
    o.vlRightEyeLensTypeId||null, o.vlLeftEyeLensTypeId||null, o.vpRightEyeLensTypeId||null, o.vpLeftEyeLensTypeId||null,
    o.framePrice??null, o.vlRightEyeLensPrice??null, o.vlLeftEyeLensPrice??null, o.vpRightEyeLensPrice??null, o.vpLeftEyeLensPrice??null,
    o.basePrice||0, o.addonsPrice||0, o.totalPrice||0, o.depositAmount||0, o.balanceDue||0, o.status,
    toIso(o.expectedCompletionDate), o.actualCompletionDate ? toIso(o.actualCompletionDate) : null,
    o.customerNotes||null, o.technicalNotes||null,
    toIso(o.createdAt), toIso(o.updatedAt), o.userId,
    o.vlLeftEyeLensQuantity??1, o.vlRightEyeLensQuantity??1, o.vpLeftEyeLensQuantity??1, o.vpRightEyeLensQuantity??1,
  )
}

export function cachePayment(p: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO payments (id,orderId,amount,paymentMethod,paymentDate,receiptNumber,reference,createdAt,updatedAt,description,type,userId)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    p.id, p.orderId||null, p.amount, p.paymentMethod, toIso(p.paymentDate),
    p.receiptNumber||null, p.reference||null, toIso(p.createdAt), toIso(p.updatedAt),
    p.description||null, p.type||'ORDER', p.userId||null
  )
}

export function cachePrescription(rx: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO prescriptions (id,customerId,examinationDate,doctorName,doctorLicense,
    pupillaryDistance,readingDistance,expirationDate,notes,createdAt,updatedAt,
    hasVLData,hasVPData,
    vlLeftEyeAxis,vlLeftEyeCylinder,vlLeftEyePrism,vlLeftEyeSphere,
    vlRightEyeAxis,vlRightEyeCylinder,vlRightEyePrism,vlRightEyeSphere,
    vpLeftEyeAxis,vpLeftEyeCylinder,vpLeftEyePrism,vpLeftEyeSphere,
    vpRightEyeAxis,vpRightEyeCylinder,vpRightEyePrism,vpRightEyeSphere,
    vpLeftEyeAdd,vpRightEyeAdd)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    rx.id, rx.customerId, toIso(rx.examinationDate), rx.doctorName||'', rx.doctorLicense||'',
    rx.pupillaryDistance||0, rx.readingDistance??null, toIso(rx.expirationDate),
    rx.notes||null, toIso(rx.createdAt), toIso(rx.updatedAt),
    rx.hasVLData ? 1 : 0, rx.hasVPData ? 1 : 0,
    rx.vlLeftEyeAxis??null, rx.vlLeftEyeCylinder??null, rx.vlLeftEyePrism??null, rx.vlLeftEyeSphere??null,
    rx.vlRightEyeAxis??null, rx.vlRightEyeCylinder??null, rx.vlRightEyePrism??null, rx.vlRightEyeSphere??null,
    rx.vpLeftEyeAxis??null, rx.vpLeftEyeCylinder??null, rx.vpLeftEyePrism??null, rx.vpLeftEyeSphere??null,
    rx.vpRightEyeAxis??null, rx.vpRightEyeCylinder??null, rx.vpRightEyePrism??null, rx.vpRightEyeSphere??null,
    rx.vpLeftEyeAdd??null, rx.vpRightEyeAdd??null,
  )
}

export function cacheFrame(f: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO frames (id,brand,model,color,size,cost,sellingPrice,stock,createdAt,updatedAt,userId)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    f.id, f.brand, f.model, f.color, f.size, f.cost, f.sellingPrice, f.stock,
    toIso(f.createdAt), toIso(f.updatedAt), f.userId
  )
}

export function cacheLensType(lt: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO lensTypes (id,name,category,material,"index",baseCost,sellingPrice,stock,reorderThreshold,supplierName,supplierContact,createdAt,updatedAt,userId)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    lt.id, lt.name, lt.category, lt.material, lt.index, lt.baseCost, lt.sellingPrice,
    lt.stock||0, lt.reorderThreshold||5, lt.supplierName, lt.supplierContact,
    toIso(lt.createdAt), toIso(lt.updatedAt), lt.userId
  )
}

export function cacheSetting(s: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO settings (id,userId,opticianName,opticianAddress,opticianPhone,opticianEmail,logoUrl,language,currency,timezone,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    s.id, s.userId||null, s.opticianName||'', s.opticianAddress||'', s.opticianPhone||'',
    s.opticianEmail||null, s.logoUrl||null, s.language||'en', s.currency||'DA', s.timezone||'Africa/Algiers',
    toIso(s.createdAt), toIso(s.updatedAt)
  )
}

export function cacheExpense(e: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO expenses (id,description,amount,category,date,notes,userId,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    e.id, e.description, e.amount, e.category, toIso(e.date),
    e.notes||null, e.userId, toIso(e.createdAt), toIso(e.updatedAt)
  )
}

// ─── Bulk hydrate: download all data for a user and store locally ───────────
export async function hydrateCache(prisma: any, userId: string) {
  console.log('[LocalCache] Hydrating local cache for user', userId)
  try {
    const [customers, orders, payments, prescriptions, frames, lensTypes, settings, expenses] = await Promise.all([
      prisma.customer.findMany({ where: { userId } }),
      prisma.order.findMany({ where: { userId } }),
      prisma.payment.findMany({ where: { OR: [{ userId }, { order: { userId } }] } }),
      prisma.prescription.findMany({ where: { customer: { userId } } }),
      prisma.frame.findMany({ where: { userId } }),
      prisma.lensType.findMany({ where: { userId } }),
      prisma.setting.findMany({ where: { userId } }),
      prisma.expense.findMany({ where: { userId } }),
    ])

    const d = getDb()
    const tx = d.transaction(() => {
      for (const c of customers) cacheCustomer(c)
      for (const o of orders) cacheOrder(o)
      for (const p of payments) cachePayment(p)
      for (const rx of prescriptions) cachePrescription(rx)
      for (const f of frames) cacheFrame(f)
      for (const lt of lensTypes) cacheLensType(lt)
      for (const s of settings) cacheSetting(s)
      for (const e of expenses) cacheExpense(e)
    })
    tx()

    console.log(`[LocalCache] Hydrated: ${customers.length} customers, ${orders.length} orders, ${payments.length} payments, ${prescriptions.length} prescriptions, ${frames.length} frames, ${lensTypes.length} lensTypes`)
  } catch (err: any) {
    console.error('[LocalCache] Hydration failed:', err.message)
  }
}

// ─── Offline READ helpers ───────────────────────────────────────────────────

export function getLocalCustomers(userId: string, search?: string, limit = 50): any[] {
  const d = getDb()
  if (search) {
    const s = `%${search}%`
    return d.prepare(`SELECT * FROM customers WHERE userId=? AND (firstName LIKE ? OR lastName LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY lastName ASC, firstName ASC LIMIT ?`)
      .all(userId, s, s, s, s, limit)
  }
  return d.prepare('SELECT * FROM customers WHERE userId=? ORDER BY lastName ASC, firstName ASC LIMIT ?').all(userId, limit)
}

export function getLocalCustomer(id: string): any {
  return getDb().prepare('SELECT * FROM customers WHERE id=?').get(id)
}

export function getLocalOrders(userId: string, params: any = {}): { orders: any[]; total: number } {
  const d = getDb()
  let where = 'WHERE userId=?'
  const args: any[] = [userId]

  if (params.status) {
    const statuses = params.status.split(',').map((s: string) => s.trim().toLowerCase())
    const expanded: string[] = []
    statuses.forEach((s: string) => {
      if (s === 'in_progress') expanded.push('in_progress', 'pending')
      else if (s === 'completed') expanded.push('completed', 'done', 'finished', 'delivered')
      else expanded.push(s)
    })
    where += ` AND status IN (${expanded.map(() => '?').join(',')})`
    args.push(...expanded)
  }

  if (params.search) {
    const s = `%${params.search}%`
    where += ` AND (orderNumber LIKE ? OR customerNotes LIKE ? OR technicalNotes LIKE ?)`
    args.push(s, s, s)
  }

  const total = (d.prepare(`SELECT COUNT(*) as c FROM orders ${where}`).get(...args) as any).c
  const page = params.page || 1
  const limit = params.limit || 10
  const offset = (page - 1) * limit

  const orders = d.prepare(`SELECT * FROM orders ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset)

  // Attach customer data to each order
  for (const o of orders) {
    (o as any).customer = d.prepare('SELECT id, firstName, lastName, email FROM customers WHERE id=?').get((o as any).customerId) || null
  }

  return { orders, total }
}

export function getLocalOrder(id: string): any {
  const d = getDb()
  const order = d.prepare('SELECT * FROM orders WHERE id=?').get(id) as any
  if (!order) return null
  order.customer = d.prepare('SELECT * FROM customers WHERE id=?').get(order.customerId) || null
  order.prescription = order.prescriptionId ? d.prepare('SELECT * FROM prescriptions WHERE id=?').get(order.prescriptionId) : null
  order.frame = order.frameId ? d.prepare('SELECT * FROM frames WHERE id=?').get(order.frameId) : null
  order.lensType = order.lensTypeId ? d.prepare('SELECT * FROM lensTypes WHERE id=?').get(order.lensTypeId) : null
  order.payments = d.prepare('SELECT * FROM payments WHERE orderId=? ORDER BY createdAt DESC').all(order.id)
  return order
}

export function getLocalPrescriptions(customerId: string): any[] {
  return getDb().prepare('SELECT * FROM prescriptions WHERE customerId=? ORDER BY createdAt DESC').all(customerId)
}

export function getLocalPayments(userId: string, params: any = {}): { payments: any[]; total: number } {
  const d = getDb()
  let where = `WHERE (userId=? OR orderId IN (SELECT id FROM orders WHERE userId=?))`
  const args: any[] = [userId, userId]

  const page = params.page || 1
  const limit = params.limit || 10
  const offset = (page - 1) * limit

  const total = (d.prepare(`SELECT COUNT(*) as c FROM payments ${where}`).get(...args) as any).c
  const payments = d.prepare(`SELECT * FROM payments ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset)

  // Attach order info
  for (const p of payments) {
    if ((p as any).orderId) {
      (p as any).order = d.prepare('SELECT id, orderNumber, customerId FROM orders WHERE id=?').get((p as any).orderId)
      if ((p as any).order?.customerId) {
        (p as any).order.customer = d.prepare('SELECT id, firstName, lastName FROM customers WHERE id=?').get((p as any).order.customerId)
      }
    }
  }

  return { payments, total }
}

export function getLocalFrames(userId: string): any[] {
  return getDb().prepare('SELECT * FROM frames WHERE userId=? ORDER BY brand ASC').all(userId)
}

export function getLocalLensTypes(userId: string): any[] {
  return getDb().prepare('SELECT * FROM lensTypes WHERE userId=? ORDER BY name ASC').all(userId)
}

export function getLocalSettings(userId: string): any {
  return getDb().prepare('SELECT * FROM settings WHERE userId=?').get(userId) || null
}

export function getLocalExpenses(userId: string, params: any = {}): { expenses: any[]; total: number } {
  const d = getDb()
  let where = 'WHERE userId=?'
  const args: any[] = [userId]
  if (params.category) { where += ' AND category=?'; args.push(params.category) }

  const page = params.page || 1
  const limit = params.limit || 10
  const offset = (page - 1) * limit
  const total = (d.prepare(`SELECT COUNT(*) as c FROM expenses ${where}`).get(...args) as any).c
  const expenses = d.prepare(`SELECT * FROM expenses ${where} ORDER BY date DESC LIMIT ? OFFSET ?`).all(...args, limit, offset)
  return { expenses, total }
}

// ─── Offline WRITE helpers (returns data shaped like Prisma responses) ───────

export function createLocalCustomer(data: any): any {
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()
  const row = { ...data, id, createdAt: now, updatedAt: now }
  cacheCustomer(row)
  return row
}

export function createLocalOrder(data: any, userId: string): any {
  const d = getDb()
  // Compute order number from local cache
  const maxRow = d.prepare(`SELECT orderNumber FROM orders WHERE userId=? ORDER BY orderNumber DESC LIMIT 1`).get(userId) as any
  let maxNum = 0
  if (maxRow?.orderNumber) {
    const match = maxRow.orderNumber.match(/ORD-(\d+)/)
    if (match) maxNum = parseInt(match[1], 10)
  }
  const orderNumber = `ORD-${String(maxNum + 1).padStart(3, '0')}`
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()

  const row = { ...data, id, orderNumber, createdAt: now, updatedAt: now }
  cacheOrder(row)

  // Create deposit payment locally if needed
  if (data.depositAmount && data.depositAmount > 0) {
    createLocalPayment({
      orderId: id,
      amount: data.depositAmount,
      paymentMethod: 'cash',
      receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
      reference: 'Initial deposit',
      paymentDate: now,
      userId,
    })
  }

  // Decrement frame stock locally
  if (data.frameId) {
    d.prepare('UPDATE frames SET stock = MAX(0, stock - 1) WHERE id=?').run(data.frameId)
  }

  // Return with customer/prescription attached
  row.customer = data.customerId ? d.prepare('SELECT id,firstName,lastName,email FROM customers WHERE id=?').get(data.customerId) : null
  row.prescription = data.prescriptionId ? d.prepare('SELECT * FROM prescriptions WHERE id=?').get(data.prescriptionId) : null
  return row
}

export function createLocalPayment(data: any): any {
  const d = getDb()
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()
  if (!data.receiptNumber) {
    data.receiptNumber = `RCT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 10000)}`
  }
  const row = { ...data, id, createdAt: now, updatedAt: now }
  cachePayment(row)

  // Update order balance locally
  if (data.orderId) {
    const order = d.prepare('SELECT balanceDue, depositAmount FROM orders WHERE id=?').get(data.orderId) as any
    if (order) {
      d.prepare('UPDATE orders SET balanceDue=?, depositAmount=?, updatedAt=? WHERE id=?').run(
        Math.max(0, (order.balanceDue || 0) - data.amount),
        (order.depositAmount || 0) + data.amount,
        now,
        data.orderId
      )
    }
  }
  return row
}

export function createLocalPrescription(data: any): any {
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()
  const row = { ...data, id, createdAt: now, updatedAt: now }
  cachePrescription(row)
  return row
}

// ─── Dashboard stats from local cache ───────────────────────────────────────

export function getLocalDashboardStats(userId: string, filter: string = 'all'): any {
  const d = getDb()
  const now = new Date()
  let dateFilter = ''
  const args: any[] = [userId]

  if (filter === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    dateFilter = ' AND createdAt >= ?'
    args.push(start)
  } else if (filter === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    dateFilter = ' AND createdAt >= ?'
    args.push(start.toISOString())
  } else if (filter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    dateFilter = ' AND createdAt >= ?'
    args.push(start)
  }

  const totalCustomers = (d.prepare('SELECT COUNT(*) as c FROM customers WHERE userId=?').get(userId) as any).c
  const ordersCount = (d.prepare(`SELECT COUNT(*) as c FROM orders WHERE userId=?${dateFilter}`).get(...args) as any).c
  const totalRevenue = (d.prepare(`SELECT COALESCE(SUM(totalPrice),0) as s FROM orders WHERE userId=?${dateFilter}`).get(...args) as any).s
  const totalPayments = (d.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE (userId=? OR orderId IN (SELECT id FROM orders WHERE userId=?))${dateFilter ? dateFilter : ''}`).get(userId, userId, ...(dateFilter ? args.slice(1) : [])) as any).s

  return {
    totalCustomers,
    ordersThisMonth: ordersCount,
    totalRevenue: Math.round(totalRevenue),
    totalPayments: Math.round(totalPayments),
    totalPrescriptions: 0,
    customerGrowth: 0,
    orderGrowth: 0,
    prescriptionGrowth: 0,
    revenueGrowth: 0,
    paymentMethodBreakdown: [],
    revenueAnalytics: {
      deposits: 0,
      payments: Math.round(totalPayments),
      outstanding: Math.max(0, Math.round(totalRevenue) - Math.round(totalPayments)),
      collectionRate: totalRevenue > 0 ? Math.round((totalPayments / totalRevenue) * 100) : 0,
    },
    lastUpdated: new Date().toISOString(),
    filter,
    currency: 'DA',
  }
}
