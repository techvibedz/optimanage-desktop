import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:session'),

  // Customers
  getCustomers: (params: any) => ipcRenderer.invoke('customers:list', params),
  getCustomer: (id: string) => ipcRenderer.invoke('customers:get', id),
  createCustomer: (customer: any) => ipcRenderer.invoke('customers:create', customer),
  updateCustomer: (id: string, updates: any) => ipcRenderer.invoke('customers:update', id, updates),
  deleteCustomer: (id: string) => ipcRenderer.invoke('customers:delete', id),

  // Orders
  getOrders: (params: any) => ipcRenderer.invoke('orders:list', params),
  getOrder: (id: string) => ipcRenderer.invoke('orders:get', id),
  createOrder: (order: any) => ipcRenderer.invoke('orders:create', order),
  updateOrder: (id: string, updates: any) => ipcRenderer.invoke('orders:update', id, updates),
  deleteOrder: (id: string) => ipcRenderer.invoke('orders:delete', id),
  getLatestOrderNumber: (userId: string) => ipcRenderer.invoke('orders:latestNumber', userId),

  // Prescriptions
  getPrescriptions: (params: any) => ipcRenderer.invoke('prescriptions:list', params),
  createPrescription: (prescription: any) => ipcRenderer.invoke('prescriptions:create', prescription),
  updatePrescription: (id: string, updates: any) => ipcRenderer.invoke('prescriptions:update', id, updates),
  deletePrescription: (id: string) => ipcRenderer.invoke('prescriptions:delete', id),

  // Frames
  getFrames: (params: any) => ipcRenderer.invoke('frames:list', params),
  createFrame: (frame: any) => ipcRenderer.invoke('frames:create', frame),
  updateFrame: (id: string, updates: any) => ipcRenderer.invoke('frames:update', id, updates),
  deleteFrame: (id: string) => ipcRenderer.invoke('frames:delete', id),

  // Lens Types
  getLensTypes: (params: any) => ipcRenderer.invoke('lensTypes:list', params),
  createLensType: (lensType: any) => ipcRenderer.invoke('lensTypes:create', lensType),
  updateLensType: (id: string, updates: any) => ipcRenderer.invoke('lensTypes:update', id, updates),
  deleteLensType: (id: string) => ipcRenderer.invoke('lensTypes:delete', id),

  // Contact Lenses
  getContactLenses: (params: any) => ipcRenderer.invoke('contactLenses:list', params),
  createContactLens: (contactLens: any) => ipcRenderer.invoke('contactLenses:create', contactLens),
  updateContactLens: (id: string, updates: any) => ipcRenderer.invoke('contactLenses:update', id, updates),
  deleteContactLens: (id: string) => ipcRenderer.invoke('contactLenses:delete', id),

  // Payments
  getPayments: (params: any) => ipcRenderer.invoke('payments:list', params),
  createPayment: (payment: any) => ipcRenderer.invoke('payments:create', payment),
  deletePayment: (id: string) => ipcRenderer.invoke('payments:delete', id),

  // Expenses
  getExpenses: (params: any) => ipcRenderer.invoke('expenses:list', params),
  createExpense: (expense: any) => ipcRenderer.invoke('expenses:create', expense),
  updateExpense: (id: string, updates: any) => ipcRenderer.invoke('expenses:update', id, updates),
  deleteExpense: (id: string) => ipcRenderer.invoke('expenses:delete', id),

  // Settings
  getSettings: (userId: string) => ipcRenderer.invoke('settings:get', userId),
  updateSettings: (userId: string, updates: any) => ipcRenderer.invoke('settings:update', userId, updates),

  // Users (Admin)
  getUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (userData: any) => ipcRenderer.invoke('users:create', userData),
  updateUser: (id: string, updates: any) => ipcRenderer.invoke('users:update', id, updates),
  deleteUser: (id: string) => ipcRenderer.invoke('users:delete', id),

  // Print
  printSlip: () => ipcRenderer.invoke('print:slip'),

  // Dashboard
  getDashboardStats: (params: any) => ipcRenderer.invoke('dashboard:stats', params),

  // AI
  scanOrdonnance: (imageBase64: string) => ipcRenderer.invoke('ai:scanOrdonnance', imageBase64),

  // Updater
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (callback: (_status: { type: string; data?: any }) => void) => {
    const handler = (_event: any, status: { type: string; data?: any }) => callback(status)
    ipcRenderer.on('updater:status', handler)
    return () => { ipcRenderer.removeListener('updater:status', handler) }
  },
})
