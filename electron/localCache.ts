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

    CREATE TABLE IF NOT EXISTS contactLenses (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      model TEXT,
      price REAL NOT NULL,
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
      nif TEXT,
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

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'ASSISTANT',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS localIdMappings (
      localId TEXT PRIMARY KEY,
      serverId TEXT NOT NULL,
      model TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `)

  // ─── Idempotent migrations for existing DBs ──────────────────────────────
  // Add `nif` column to settings if upgrading from a build that didn't have it.
  try {
    const cols = d.prepare(`PRAGMA table_info(settings)`).all() as Array<{ name: string }>
    if (!cols.some(c => c.name === 'nif')) {
      d.exec(`ALTER TABLE settings ADD COLUMN nif TEXT`)
    }
  } catch (e) {
    // Non-fatal: column probably already exists or table missing; safe to ignore.
  }
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
  d.prepare(`INSERT OR REPLACE INTO settings (id,userId,opticianName,opticianAddress,opticianPhone,opticianEmail,nif,logoUrl,language,currency,timezone,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    s.id, s.userId||null, s.opticianName||'', s.opticianAddress||'', s.opticianPhone||'',
    s.opticianEmail||null, s.nif||null, s.logoUrl||null, s.language||'en', s.currency||'DA', s.timezone||'Africa/Algiers',
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

export function cacheUser(u: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO users (id,email,name,password,role,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?)`).run(
    u.id, u.email, u.name, u.password, u.role||'ASSISTANT',
    toIso(u.createdAt), toIso(u.updatedAt)
  )
}

export function getLocalUser(email: string): any {
  return getDb().prepare('SELECT * FROM users WHERE email=?').get(email) || null
}

export function cacheLocalIdMapping(localId: string, serverId: string, model: string) {
  getDb().prepare(`INSERT OR REPLACE INTO localIdMappings (localId,serverId,model,createdAt) VALUES (?,?,?,?)`)
    .run(localId, serverId, model, new Date().toISOString())
}

export function getLocalIdMapping(localId: string): string | null {
  const row = getDb().prepare('SELECT serverId FROM localIdMappings WHERE localId=?').get(localId) as any
  return row?.serverId || null
}

export function getAllLocalIdMappings(): Record<string, string> {
  const rows = getDb().prepare('SELECT localId, serverId FROM localIdMappings').all() as any[]
  const map: Record<string, string> = {}
  for (const r of rows) map[r.localId] = r.serverId
  return map
}

export function deleteLocalIdMapping(localId: string) {
  getDb().prepare('DELETE FROM localIdMappings WHERE localId=?').run(localId)
}

export function deleteSyncedLocalCustomer(id: string) {
  const d = getDb()
  const dependents = d.prepare(`SELECT COUNT(*) as c FROM orders WHERE customerId=?`).get(id) as any
  if ((dependents?.c || 0) === 0) {
    deleteLocalCustomer(id)
  }
}

export function deleteSyncedLocalPrescription(id: string) {
  const d = getDb()
  const dependents = d.prepare(`SELECT COUNT(*) as c FROM orders WHERE prescriptionId=?`).get(id) as any
  if ((dependents?.c || 0) === 0) {
    deleteLocalPrescription(id)
  }
}

export function deleteLocalCustomer(id: string) {
  const d = getDb()
  d.prepare('DELETE FROM prescriptions WHERE customerId=?').run(id)
  d.prepare('DELETE FROM customers WHERE id=?').run(id)
}

export function deleteLocalOrder(id: string) {
  const d = getDb()
  d.prepare('DELETE FROM payments WHERE orderId=?').run(id)
  d.prepare('DELETE FROM orders WHERE id=?').run(id)
}

export function deleteLocalPayment(id: string) {
  getDb().prepare('DELETE FROM payments WHERE id=?').run(id)
}

export function deleteLocalPrescription(id: string) {
  getDb().prepare('DELETE FROM prescriptions WHERE id=?').run(id)
}

export function deleteLocalFrame(id: string) {
  getDb().prepare('DELETE FROM frames WHERE id=?').run(id)
}

export function deleteLocalLensType(id: string) {
  getDb().prepare('DELETE FROM lensTypes WHERE id=?').run(id)
}

export function cacheContactLens(c: any) {
  const d = getDb()
  d.prepare(`INSERT OR REPLACE INTO contactLenses (id,brand,model,price,createdAt,updatedAt,userId)
    VALUES (?,?,?,?,?,?,?)`).run(
    c.id, c.brand, c.model || null, c.price,
    toIso(c.createdAt), toIso(c.updatedAt), c.userId
  )
}

export function deleteLocalContactLens(id: string) {
  getDb().prepare('DELETE FROM contactLenses WHERE id=?').run(id)
}

export function deleteLocalExpense(id: string) {
  getDb().prepare('DELETE FROM expenses WHERE id=?').run(id)
}

// ─── Bulk hydrate: download all data for a user and store locally ───────────
export async function hydrateCache(prisma: any, userId: string) {
  console.log('[LocalCache] Hydrating local cache for user', userId)
  try {
    const [customers, orders, payments, prescriptions, frames, lensTypes, contactLenses, settings, expenses] = await Promise.all([
      prisma.customer.findMany({ where: { userId } }),
      prisma.order.findMany({ where: { userId } }),
      prisma.payment.findMany({ where: { OR: [{ userId }, { order: { userId } }] } }),
      prisma.prescription.findMany({ where: { customer: { userId } } }),
      prisma.frame.findMany({ where: { userId } }),
      prisma.lensType.findMany({ where: { userId } }),
      prisma.contactLens.findMany({ where: { userId } }),
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
      for (const cl of contactLenses) cacheContactLens(cl)
      for (const s of settings) cacheSetting(s)
      for (const e of expenses) cacheExpense(e)
    })
    tx()

    console.log(`[LocalCache] Hydrated: ${customers.length} customers, ${orders.length} orders, ${payments.length} payments, ${prescriptions.length} prescriptions, ${frames.length} frames, ${lensTypes.length} lensTypes, ${contactLenses.length} contactLenses`)
  } catch (err: any) {
    console.error('[LocalCache] Hydration failed:', err.message)
  }
}

// ─── Offline READ helpers ───────────────────────────────────────────────────

export function getLocalCustomers(userId: string, search?: string, limit = 5000): any[] {
  const d = getDb()
  if (search) {
    const s = `%${search}%`
    return d.prepare(`SELECT * FROM customers WHERE userId=? AND (firstName LIKE ? OR lastName LIKE ? OR (firstName || ' ' || lastName) LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY lastName ASC, firstName ASC LIMIT ?`)
      .all(userId, s, s, s, s, s, limit)
  }
  return d.prepare('SELECT * FROM customers WHERE userId=? ORDER BY lastName ASC, firstName ASC LIMIT ?').all(userId, limit)
}

export function getLocalCustomer(id: string): any {
  return getDb().prepare('SELECT * FROM customers WHERE id=?').get(id)
}

export function getLocalOrders(userId: string, params: any = {}): { orders: any[]; total: number } {
  const d = getDb()
  const from = 'FROM orders o LEFT JOIN customers c ON o.customerId = c.id'
  let where = 'WHERE o.userId=?'
  const args: any[] = [userId]

  if (params.status) {
    const statuses = params.status.split(',').map((s: string) => s.trim().toLowerCase())
    const expanded: string[] = []
    statuses.forEach((s: string) => {
      if (s === 'in_progress') expanded.push('in_progress', 'pending')
      else if (s === 'completed') expanded.push('completed', 'done', 'finished', 'delivered')
      else expanded.push(s)
    })
    where += ` AND o.status IN (${expanded.map(() => '?').join(',')})`
    args.push(...expanded)
  }

  if (params.search) {
    const s = `%${params.search}%`
    where += ` AND (o.orderNumber LIKE ? OR o.customerNotes LIKE ? OR o.technicalNotes LIKE ? OR c.firstName LIKE ? OR c.lastName LIKE ? OR (c.firstName || ' ' || c.lastName) LIKE ?)`
    args.push(s, s, s, s, s, s)
  }

  if (params.startDate) {
    where += ' AND o.createdAt >= ?'
    args.push(new Date(params.startDate).toISOString())
  }
  if (params.endDate) {
    where += ' AND o.createdAt <= ?'
    args.push(new Date(params.endDate).toISOString())
  }

  if (params.paymentStatus === 'paid') where += ' AND o.balanceDue <= 0'
  else if (params.paymentStatus === 'partial') where += ' AND o.balanceDue > 0 AND o.depositAmount > 0'
  else if (params.paymentStatus === 'unpaid') where += ' AND o.balanceDue > 0 AND o.depositAmount = 0'

  if (params.hasBalance === 'true') where += ' AND o.balanceDue > 0'

  const total = (d.prepare(`SELECT COUNT(*) as cnt ${from} ${where}`).get(...args) as any).cnt
  const page = params.page || 1
  const limit = params.limit || 10
  const offset = (page - 1) * limit

  const orders = d.prepare(`SELECT o.* ${from} ${where} ORDER BY o.createdAt DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset)

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
  order.vlRightEyeLensType = order.vlRightEyeLensTypeId ? d.prepare('SELECT * FROM lensTypes WHERE id=?').get(order.vlRightEyeLensTypeId) : null
  order.vlLeftEyeLensType = order.vlLeftEyeLensTypeId ? d.prepare('SELECT * FROM lensTypes WHERE id=?').get(order.vlLeftEyeLensTypeId) : null
  order.vpRightEyeLensType = order.vpRightEyeLensTypeId ? d.prepare('SELECT * FROM lensTypes WHERE id=?').get(order.vpRightEyeLensTypeId) : null
  order.vpLeftEyeLensType = order.vpLeftEyeLensTypeId ? d.prepare('SELECT * FROM lensTypes WHERE id=?').get(order.vpLeftEyeLensTypeId) : null
  order.payments = d.prepare('SELECT * FROM payments WHERE orderId=? ORDER BY createdAt DESC').all(order.id)
  return order
}

export function getLocalPrescription(id: string): any {
  return getDb().prepare('SELECT * FROM prescriptions WHERE id=?').get(id) || null
}

export function getLocalPrescriptions(customerId: string): any[] {
  return getDb().prepare('SELECT * FROM prescriptions WHERE customerId=? ORDER BY createdAt DESC').all(customerId)
}

export function getLocalPayments(userId: string, params: any = {}): { payments: any[]; total: number } {
  const d = getDb()
  let where = `WHERE (userId=? OR orderId IN (SELECT id FROM orders WHERE userId=?))`
  const args: any[] = [userId, userId]

  if (params.orderId) {
    where += ' AND orderId=?'
    args.push(params.orderId)
  }
  if (params.paymentMethod && params.paymentMethod !== 'all') {
    where += ' AND paymentMethod=?'
    args.push(params.paymentMethod)
  }
  if (params.startDate) {
    where += ' AND paymentDate >= ?'
    args.push(new Date(params.startDate).toISOString())
  }
  if (params.endDate) {
    const end = new Date(params.endDate)
    end.setDate(end.getDate() + 1)
    where += ' AND paymentDate < ?'
    args.push(end.toISOString())
  }
  if (params.search) {
    const s = `%${params.search}%`
    where += ' AND (receiptNumber LIKE ? OR reference LIKE ? OR description LIKE ?)'
    args.push(s, s, s)
  }

  const page = params.page || 1
  const limit = params.limit || 10
  const offset = (page - 1) * limit

  const total = (d.prepare(`SELECT COUNT(*) as c FROM payments ${where}`).get(...args) as any).c
  const payments = d.prepare(`SELECT * FROM payments ${where} ORDER BY paymentDate DESC, createdAt DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset)

  // Attach order info + customer
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

export function getLocalContactLenses(userId: string, search?: string): any[] {
  const d = getDb()
  if (search) {
    const s = `%${search}%`
    return d.prepare(`SELECT * FROM contactLenses WHERE userId=? AND (brand LIKE ? OR model LIKE ?) ORDER BY brand ASC`).all(userId, s, s)
  }
  return d.prepare('SELECT * FROM contactLenses WHERE userId=? ORDER BY brand ASC').all(userId)
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
  if (params.category && params.category !== 'all') { where += ' AND category=?'; args.push(params.category) }
  if (params.date) {
    // Filter expenses for a specific day
    const start = new Date(params.date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(params.date)
    end.setHours(0, 0, 0, 0)
    end.setDate(end.getDate() + 1)
    where += ' AND date >= ? AND date < ?'
    args.push(start.toISOString(), end.toISOString())
  }

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

// Highest ORD-NNN currently in the local cache for a user. The local cache
// mirrors every server order we've seen PLUS any not-yet-synced offline orders,
// so it is the single authority for the next order number — online and offline.
export function getMaxOrderNumber(userId: string): number {
  const d = getDb()
  const rows = d.prepare(`SELECT orderNumber FROM orders WHERE userId=?`).all(userId) as any[]
  let maxNum = 0
  for (const o of rows) {
    const match = o.orderNumber?.match(/ORD-(\d+)/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  }
  return maxNum
}

export function createLocalOrder(data: any, userId: string): any {
  const d = getDb()
  // Compute order number from local cache — scan ALL orders to find the real max number
  const orderNumber = `ORD-${String(getMaxOrderNumber(userId) + 1).padStart(3, '0')}`
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()

  const row = { ...data, id, orderNumber, createdAt: now, updatedAt: now }
  cacheOrder(row)

  // Create deposit payment record locally — but do NOT update the order's
  // balanceDue/depositAmount since the frontend already computed them correctly.
  if (data.depositAmount && data.depositAmount > 0) {
    const paymentId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const receiptNumber = `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    cachePayment({
      id: paymentId,
      orderId: id,
      amount: data.depositAmount,
      paymentMethod: 'cash',
      receiptNumber,
      reference: 'Initial deposit',
      paymentDate: now,
      userId,
      createdAt: now,
      updatedAt: now,
      type: 'ORDER',
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
    data.receiptNumber = `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

  // Build payment date range matching online: gte start, lte now
  let paymentDateFilter = ''
  const payArgs: any[] = [userId, userId]
  if (filter === 'today') {
    paymentDateFilter = ' AND paymentDate >= ? AND paymentDate <= ?'
    payArgs.push(new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), now.toISOString())
  } else if (filter === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    paymentDateFilter = ' AND paymentDate >= ? AND paymentDate <= ?'
    payArgs.push(start.toISOString(), now.toISOString())
  } else if (filter === 'month') {
    paymentDateFilter = ' AND paymentDate >= ? AND paymentDate <= ?'
    payArgs.push(new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), now.toISOString())
  }

  // Build order date range matching online: gte start, lte now
  let orderDateFilter = ''
  const orderArgs: any[] = [userId]
  if (filter === 'today') {
    orderDateFilter = ' AND createdAt >= ? AND createdAt <= ?'
    orderArgs.push(new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), now.toISOString())
  } else if (filter === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    orderDateFilter = ' AND createdAt >= ? AND createdAt <= ?'
    orderArgs.push(start.toISOString(), now.toISOString())
  } else if (filter === 'month') {
    orderDateFilter = ' AND createdAt >= ? AND createdAt <= ?'
    orderArgs.push(new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), now.toISOString())
  }

  // Build expense date range matching online: gte start, lte now
  let expenseDateFilter = ''
  const expenseArgs: any[] = [userId]
  if (filter === 'today') {
    expenseDateFilter = ' AND date >= ? AND date <= ?'
    expenseArgs.push(new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), now.toISOString())
  } else if (filter === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    expenseDateFilter = ' AND date >= ? AND date <= ?'
    expenseArgs.push(start.toISOString(), now.toISOString())
  } else if (filter === 'month') {
    expenseDateFilter = ' AND date >= ? AND date <= ?'
    expenseArgs.push(new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), now.toISOString())
  }

  const totalCustomers = (d.prepare('SELECT COUNT(*) as c FROM customers WHERE userId=?').get(userId) as any).c
  const ordersCount = (d.prepare(`SELECT COUNT(*) as c FROM orders WHERE userId=?${orderDateFilter}`).get(...orderArgs) as any).c
  const totalPrescriptions = (d.prepare('SELECT COUNT(*) as c FROM prescriptions WHERE customerId IN (SELECT id FROM customers WHERE userId=?)').get(userId) as any).c

  const paymentsQuery = `SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE (userId=? OR orderId IN (SELECT id FROM orders WHERE userId=?))${paymentDateFilter}`
  const totalPayments = (d.prepare(paymentsQuery).get(...payArgs) as any).s

  const expensesQuery = `SELECT COALESCE(SUM(amount),0) as s FROM expenses WHERE userId=?${expenseDateFilter}`
  const totalExpenses = (d.prepare(expensesQuery).get(...expenseArgs) as any).s

  const formattedPayments = Math.round(totalPayments)
  const netRevenue = Math.round(totalPayments - totalExpenses)
  const totalOrderAmount = (d.prepare(`SELECT COALESCE(SUM(totalPrice),0) as s FROM orders WHERE userId=?${orderDateFilter}`).get(...orderArgs) as any).s
  const totalDeposits = (d.prepare(`SELECT COALESCE(SUM(depositAmount),0) as s FROM orders WHERE userId=?${orderDateFilter}`).get(...orderArgs) as any).s

  const breakdown = d.prepare(`SELECT paymentMethod, COALESCE(SUM(amount),0) as amount FROM payments WHERE (userId=? OR orderId IN (SELECT id FROM orders WHERE userId=?))${paymentDateFilter} GROUP BY paymentMethod`).all(...payArgs) as any[]
  const paymentMethodBreakdown = breakdown.map((item: any) => ({
    method: item.paymentMethod || 'Unknown',
    amount: Math.round(item.amount),
    percentage: formattedPayments > 0 ? Math.round((item.amount / formattedPayments) * 100) : 0,
  }))

  return {
    totalCustomers,
    ordersThisMonth: ordersCount,
    totalPrescriptions,
    totalRevenue: netRevenue,
    totalPayments: formattedPayments,
    totalOrderAmount: Math.round(totalOrderAmount),
    customerGrowth: 0,
    orderGrowth: 0,
    prescriptionGrowth: 0,
    revenueGrowth: 0,
    paymentMethodBreakdown,
    revenueAnalytics: {
      deposits: Math.round(totalDeposits),
      payments: formattedPayments,
      outstanding: Math.max(0, Math.round(totalOrderAmount) - formattedPayments),
      collectionRate: totalOrderAmount > 0 ? Math.round((formattedPayments / totalOrderAmount) * 100) : 0,
    },
    lastUpdated: new Date().toISOString(),
    filter,
    currency: 'DA',
  }
}

export function getLocalRevenueTimeline(userId: string, filter: string = 'month', startParam?: string, endParam?: string): any[] {
  const d = getDb()
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
      if (endParam) { endDate = new Date(endParam); endDate.setHours(23, 59, 59, 999) }
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      break
  }

  const startIso = startDate.toISOString()
  const endIso = endDate.toISOString()

  const payments = d.prepare(
    `SELECT amount, paymentDate FROM payments
     WHERE (userId=? OR orderId IN (SELECT id FROM orders WHERE userId=?))
       AND paymentDate >= ? AND paymentDate <= ?
     ORDER BY paymentDate ASC`
  ).all(userId, userId, startIso, endIso) as any[]

  const expenses = d.prepare(
    `SELECT amount, date FROM expenses
     WHERE userId=? AND date >= ? AND date <= ?
     ORDER BY date ASC`
  ).all(userId, startIso, endIso) as any[]

  const dayMap = new Map<string, { revenue: number; expenses: number }>()
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    dayMap.set(cursor.toISOString().slice(0, 10), { revenue: 0, expenses: 0 })
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

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      revenue: Math.round(vals.revenue),
      expenses: Math.round(vals.expenses),
      net: Math.round(vals.revenue - vals.expenses),
    }))
}

export function getLocalRecentActivity(userId: string, limit: number = 10): any[] {
  const d = getDb()
  const orders = d.prepare(
    `SELECT o.*, c.firstName, c.lastName FROM orders o
     LEFT JOIN customers c ON c.id = o.customerId
     WHERE o.userId=? ORDER BY o.createdAt DESC LIMIT ?`
  ).all(userId, limit) as any[]

  const payments = d.prepare(
    `SELECT p.*, o.orderNumber, c.firstName as custFirst, c.lastName as custLast
     FROM payments p
     LEFT JOIN orders o ON o.id = p.orderId
     LEFT JOIN customers c ON c.id = o.customerId
     WHERE p.userId=? OR p.orderId IN (SELECT id FROM orders WHERE userId=?)
     ORDER BY p.createdAt DESC LIMIT ?`
  ).all(userId, userId, limit) as any[]

  const customers = d.prepare(
    `SELECT * FROM customers WHERE userId=? ORDER BY createdAt DESC LIMIT ?`
  ).all(userId, limit) as any[]

  const activities: any[] = []
  for (const o of orders) {
    activities.push({
      type: 'order', date: o.createdAt, data: {
        orderNumber: o.orderNumber, status: o.status,
        customer: `${o.firstName || ''} ${o.lastName || ''}`.trim(),
        amount: o.totalPrice,
      },
    })
  }
  for (const c of customers) {
    activities.push({
      type: 'customer', date: c.createdAt, data: {
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
        phone: c.phone,
      },
    })
  }
  for (const p of payments) {
    activities.push({
      type: 'payment', date: p.createdAt, data: {
        amount: p.amount, method: p.paymentMethod,
        orderNumber: p.orderNumber,
        customer: `${p.custFirst || ''} ${p.custLast || ''}`.trim(),
      },
    })
  }

  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return activities.slice(0, limit)
}
