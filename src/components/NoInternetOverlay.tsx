import { useEffect, useState, useRef } from 'react'
import { WifiOff, Wifi, RefreshCw, AlertCircle, X } from 'lucide-react'
import { t } from '@/lib/translations'

export default function NoInternetOverlay() {
  const [offline, setOffline] = useState(false)
  const [pendingItems, setPendingItems] = useState(0)
  const [showBanner, setShowBanner] = useState(false)
  const dismissedRef = useRef(false)

  useEffect(() => {
    // Initial connectivity + sync status
    const init = async () => {
      try {
        if (window.electronAPI?.getSyncStatus) {
          const status = await window.electronAPI.getSyncStatus()
          setOffline(!status.isOnline)
          setPendingItems(status.pendingItems)
          setShowBanner(!status.isOnline || status.pendingItems > 0)
        } else if (window.electronAPI?.checkConnectivity) {
          const online = await window.electronAPI.checkConnectivity()
          setOffline(!online)
          setShowBanner(!online)
        }
      } catch {}
    }
    init()

    // Listen for connectivity changes
    const unsubConn = window.electronAPI?.onConnectivityStatus?.((online: boolean) => {
      setOffline(!online)
      if (online) {
        dismissedRef.current = false
        setShowBanner(pendingItems > 0)
      } else {
        setShowBanner(true)
      }
    })

    // Listen for sync status updates
    const unsubSync = window.electronAPI?.onSyncStatus?.((status) => {
      setPendingItems(status.pendingItems)
      if (dismissedRef.current) return
      setShowBanner(!status.isOnline || status.pendingItems > 0)
    })

    return () => {
      unsubConn?.()
      unsubSync?.()
    }
  }, [])

  const dismiss = () => {
    dismissedRef.current = true
    setShowBanner(false)
  }

  if (!showBanner) return null

  const bgColor = offline
    ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
    : pendingItems > 0
      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
      : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800'

  const textColor = offline
    ? 'text-red-700 dark:text-red-300'
    : pendingItems > 0
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-green-700 dark:text-green-300'

  const iconColor = offline
    ? 'text-red-500'
    : pendingItems > 0
      ? 'text-amber-500'
      : 'text-green-500'

  return (
    <div className={`fixed top-0 left-0 right-0 z-[9998] border-b px-4 py-2 ${bgColor} transition-all`}>
      <div className="flex items-center justify-between max-w-screen-xl mx-auto gap-2">
        <div className={`flex items-center gap-2 text-sm font-medium ${textColor}`}>
          {offline ? (
            <WifiOff className={`h-4 w-4 shrink-0 ${iconColor}`} />
          ) : pendingItems > 0 ? (
            <RefreshCw className={`h-4 w-4 shrink-0 animate-spin ${iconColor}`} />
          ) : (
            <Wifi className={`h-4 w-4 shrink-0 ${iconColor}`} />
          )}
          <span>
            {offline
              ? t('offline.banner')
              : pendingItems > 0
                ? t('offline.syncing').replace('{count}', String(pendingItems))
                : t('offline.backOnline')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pendingItems > 0 && !offline && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
              <AlertCircle className="h-3 w-3" />
              {pendingItems} {t('offline.pending')}
            </span>
          )}
          <button
            onClick={dismiss}
            className={`p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 ${textColor}`}
            title={t('common.dismiss')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
