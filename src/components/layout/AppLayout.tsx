import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { WifiOff, RefreshCw, Wifi } from 'lucide-react'
import Sidebar from './Sidebar'
import UpdateModal from './UpdateModal'
import { useTranslation } from '@/lib/use-translation'

function SyncStatusBadge() {
  const { t } = useTranslation()
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    // IPC listener from main process
    let cleanup: (() => void) | undefined
    if (window.electronAPI?.onSyncStatus) {
      cleanup = window.electronAPI.onSyncStatus((status) => {
        setOnline(status.isOnline)
        setPending(status.pendingItems)
      })
    }
    // Initial fetch
    window.electronAPI?.getSyncStatus?.().then((s) => {
      if (s) { setOnline(s.isOnline); setPending(s.pendingItems) }
    })
    return () => { cleanup?.() }
  }, [])

  // Browser online/offline events — trigger force sync on reconnect
  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true)
      if (pending > 0) {
        setSyncing(true)
        try { await window.electronAPI?.forceSync?.() }
        finally { setSyncing(false) }
      }
    }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [pending])

  // Auto-sync when IPC says we're back online with pending items
  useEffect(() => {
    if (online && pending > 0 && !syncing) {
      setSyncing(true)
      window.electronAPI?.forceSync?.().finally(() => setSyncing(false))
    }
  }, [online])

  // Online with no queue — subtle green dot
  if (online && pending === 0 && !syncing) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] text-emerald-600 dark:text-emerald-400" title={t('sync.online') || 'Online'}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </div>
    )
  }

  // Syncing — yellow spinner
  if (online && (syncing || pending > 0)) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        {t('sync.syncing') || 'Synchronisation'} ({pending})
      </div>
    )
  }

  // Offline — red badge
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-[11px] font-medium">
      <WifiOff className="h-3.5 w-3.5" />
      {t('sync.offline') || 'Mode Hors Ligne'}
      {pending > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-200 dark:bg-red-800 text-[10px] font-bold">{pending}</span>}
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
        <div className="flex justify-end px-4 pt-2">
          <SyncStatusBadge />
        </div>
        <Outlet />
      </main>
      <UpdateModal />
    </div>
  )
}
