import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { SettingsProvider } from '@/lib/settings-context'
import { Toaster } from 'sonner'
import AppLayout from '@/components/layout/AppLayout'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const OrdersPage = lazy(() => import('@/pages/OrdersPage'))
const PrescriptionsPage = lazy(() => import('@/pages/PrescriptionsPage'))
const PaymentsPage = lazy(() => import('@/pages/PaymentsPage'))
const InventoryPage = lazy(() => import('@/pages/InventoryPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const ExpensesPage = lazy(() => import('@/pages/ExpensesPage'))
const QuickSalePage = lazy(() => import('@/pages/QuickSalePage'))
const CreateOrderPage = lazy(() => import('@/pages/CreateOrderPage'))
const OrderDetailsPage = lazy(() => import('@/pages/OrderDetailsPage'))
const LensSummaryPage = lazy(() => import('@/pages/LensSummaryPage'))
const PrintFacturePage = lazy(() => import('@/pages/PrintFacturePage'))
const PrintOrderSlipPage = lazy(() => import('@/pages/PrintOrderSlipPage'))
const PrintReceiptPage = lazy(() => import('@/pages/PrintReceiptPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<CreateOrderPage />} />
          <Route path="/orders/:id" element={<OrderDetailsPage />} />
          <Route path="/prescriptions" element={<PrescriptionsPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/quick-sale" element={<QuickSalePage />} />
          <Route path="/lens-summary" element={<LensSummaryPage />} />
        </Route>
        {/* Print pages outside AppLayout — no navbar/sidebar */}
        <Route path="/orders/:id/facture" element={<ProtectedRoute><PrintFacturePage /></ProtectedRoute>} />
        <Route path="/orders/:id/print" element={<ProtectedRoute><PrintOrderSlipPage /></ProtectedRoute>} />
        <Route path="/orders/:id/receipt" element={<ProtectedRoute><PrintReceiptPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppRoutes />
        <Toaster position="top-right" richColors closeButton />
      </SettingsProvider>
    </AuthProvider>
  )
}
