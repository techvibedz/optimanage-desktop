import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import Sidebar from './Sidebar'
import UpdateModal from './UpdateModal'
import { t } from '@/lib/translations'

function NoInternetOverlay() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-10 max-w-md w-full mx-4 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mb-5">
          <WifiOff className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {t('offline.title')}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
          {t('offline.message')}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          {t('offline.waiting')}
        </div>
      </div>
    </div>
  )
}

export default function AppLayout() {
  return (
    <div className="app-layout">
      <div className="app-sidebar">
        <Sidebar />
      </div>
      <main className="app-content">
        <Outlet />
      </main>
      <UpdateModal />
      <NoInternetOverlay />
    </div>
  )
}
