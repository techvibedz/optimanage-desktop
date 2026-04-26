import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import UpdateModal from './UpdateModal'
import { useBarcodeScanner } from '@/lib/useBarcodeScanner'

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function AppLayout() {
  useBarcodeScanner()
  return (
    <div className="app-layout">
      <div className="app-sidebar">
        <Sidebar />
      </div>
      <main className="app-content">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <UpdateModal />
    </div>
  )
}
