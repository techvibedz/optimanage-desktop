export interface ParsedPrescriptionData {
  vlRightEyeSphere: string | null
  vlRightEyeCylinder: string | null
  vlRightEyeAxis: string | null
  vlRightEyeAddition: string | null
  vlLeftEyeSphere: string | null
  vlLeftEyeCylinder: string | null
  vlLeftEyeAxis: string | null
  vlLeftEyeAddition: string | null
  vpRightEyeSphere: string | null
  vpRightEyeCylinder: string | null
  vpRightEyeAxis: string | null
  vpRightEyeAddition: string | null
  vpLeftEyeSphere: string | null
  vpLeftEyeCylinder: string | null
  vpLeftEyeAxis: string | null
  vpLeftEyeAddition: string | null
  pupillaryDistance: string | null
}

export interface ElectronAPI {
  // Auth
  login: (email: string, password: string) => Promise<{ data?: any; error?: string }>
  logout: () => Promise<{ success?: boolean; error?: string }>
  getSession: () => Promise<{ data?: any; error?: string }>

  // Customers
  getCustomers: (params: { userId: string; query?: string; limit?: number }) => Promise<{ data?: any[]; error?: string }>
  getCustomer: (id: string) => Promise<{ data?: any; error?: string }>
  createCustomer: (customer: any) => Promise<{ data?: any; error?: string }>
  updateCustomer: (id: string, updates: any) => Promise<{ data?: any; error?: string }>
  deleteCustomer: (id: string) => Promise<{ success?: boolean; error?: string }>

  // Orders
  getOrders: (params: any) => Promise<{ data?: any; error?: string }>
  getOrder: (id: string) => Promise<{ data?: any; error?: string }>
  createOrder: (order: any) => Promise<{ data?: any; error?: string }>
  updateOrder: (id: string, updates: any) => Promise<{ data?: any; error?: string }>
  deleteOrder: (id: string) => Promise<{ success?: boolean; error?: string }>
  getLatestOrderNumber: (userId: string) => Promise<{ data?: string | null }>

  // Prescriptions
  getPrescriptions: (params: any) => Promise<{ data?: any; error?: string }>
  createPrescription: (prescription: any) => Promise<{ data?: any; error?: string }>
  updatePrescription: (id: string, updates: any) => Promise<{ data?: any; error?: string }>
  deletePrescription: (id: string) => Promise<{ success?: boolean; error?: string }>

  // Frames
  getFrames: (params: { userId: string; query?: string }) => Promise<{ data?: any[]; error?: string }>
  createFrame: (frame: any) => Promise<{ data?: any; error?: string }>
  updateFrame: (id: string, updates: any) => Promise<{ data?: any; error?: string }>
  deleteFrame: (id: string) => Promise<{ success?: boolean; error?: string }>

  // Lens Types
  getLensTypes: (params: { userId: string; search?: string; limit?: number }) => Promise<{ data?: any; error?: string }>
  createLensType: (lensType: any) => Promise<{ data?: any; error?: string }>
  updateLensType: (id: string, updates: any) => Promise<{ data?: any; error?: string }>
  deleteLensType: (id: string) => Promise<{ success?: boolean; error?: string }>

  // Contact Lenses
  getContactLenses: (params: { userId: string; search?: string }) => Promise<{ data?: any[]; error?: string }>
  createContactLens: (contactLens: any) => Promise<{ data?: any; error?: string }>
  updateContactLens: (id: string, updates: any) => Promise<{ data?: any; error?: string }>
  deleteContactLens: (id: string) => Promise<{ success?: boolean; error?: string }>

  // Payments
  getPayments: (params: any) => Promise<{ data?: any; error?: string }>
  createPayment: (payment: any) => Promise<{ data?: any; error?: string }>
  deletePayment: (id: string) => Promise<{ success?: boolean; error?: string }>

  // Expenses
  getExpenses: (params: any) => Promise<{ data?: any; error?: string }>
  createExpense: (expense: any) => Promise<{ data?: any; error?: string }>
  updateExpense: (id: string, updates: any) => Promise<{ data?: any; error?: string }>
  deleteExpense: (id: string) => Promise<{ success?: boolean; error?: string }>

  // Settings
  getSettings: (userId: string) => Promise<{ data?: any; error?: string }>
  updateSettings: (userId: string, updates: any) => Promise<{ data?: any; error?: string }>

  // Users (Admin)
  getUsers: () => Promise<{ data?: any[]; error?: string }>
  createUser: (userData: any) => Promise<{ data?: any; error?: string }>
  updateUser: (id: string, updates: any) => Promise<{ data?: any; error?: string }>
  deleteUser: (id: string) => Promise<{ success?: boolean; error?: string }>

  // Print
  printSlip: () => Promise<{ success?: boolean; error?: string }>

  // Dashboard
  getDashboardStats: (params: any) => Promise<{ data?: any; error?: string }>

  // AI
  scanOrdonnance: (imageBase64: string) => Promise<{ data?: ParsedPrescriptionData; error?: string }>

  // Updater
  checkUpdate: () => Promise<{ success?: boolean; error?: string }>
  downloadUpdate: () => Promise<{ success?: boolean; error?: string }>
  installUpdate: () => Promise<void>
  onUpdaterStatus: (callback: (status: UpdaterStatus) => void) => () => void
}

export interface UpdaterStatus {
  type: 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-progress' | 'update-downloaded' | 'error'
  data?: {
    version?: string
    releaseDate?: string
    releaseNotes?: string
    percent?: number
    bytesPerSecond?: number
    transferred?: number
    total?: number
    message?: string
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
