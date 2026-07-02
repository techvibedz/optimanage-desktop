import { useEffect, useRef, useState } from 'react'
import { WifiOff, Wifi, RefreshCw, AlertCircle, X } from 'lucide-react'
import { t } from '@/lib/translations'

interface BannerState {
  offline: boolean
  pendingItems: number
  syncing: boolean
  done: number
  total: number
}

export default function NoInternetOverlay() {
  const [state, setState] = useState<BannerState>({ offline: false, pendingItems: 0, syncing: false, done: 0, total: 0 })
  const [visible, setVisible] = useState(false)
  const stateRef = useRef(state)
  const dismissedRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSyncingRef = useRef(false)

  useEffect(() => {
    const apply = (patch: Partial<BannerState>) => {
      const next = { ...stateRef.current, ...patch }
      stateRef.current = next
      setState(next)

      const syncFinished = wasSyncingRef.current && !next.syncing && next.pendingItems === 0 && !next.offline
      wasSyncingRef.current = next.syncing

      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      if (next.offline || next.syncing) {
        // Syncing/offline always shows the bar — a dismiss must not hide progress.
        dismissedRef.current = false
        setVisible(true)
      } else if (syncFinished) {
        // Brief green "all synced" confirmation, then auto-hide.
        setVisible(true)
        hideTimerRef.current = setTimeout(() => setVisible(false), 4000)
      } else if (next.pendingItems > 0) {
        if (!dismissedRef.current) setVisible(true)
      } else {
        setVisible(false)
      }
    }

    const init = async () => {
      try {
        if (window.electronAPI?.getSyncStatus) {
          const s = await window.electronAPI.getSyncStatus()
          apply({ offline: !s.isOnline, pendingItems: s.pendingItems, syncing: !!s.syncing })
        } else if (window.electronAPI?.checkConnectivity) {
          const online = await window.electronAPI.checkConnectivity()
          apply({ offline: !online })
        }
      } catch { /* ignore */ }
    }
    init()

    const unsubConn = window.electronAPI?.onConnectivityStatus?.((online: boolean) => {
      apply({ offline: !online })
    })

    const unsubSync = window.electronAPI?.onSyncStatus?.((s) => {
      apply({
        offline: !s.isOnline,
        pendingItems: s.pendingItems,
        syncing: !!s.syncing,
        done: s.done ?? 0,
        total: s.total ?? 0,
      })
    })

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      unsubConn?.()
      unsubSync?.()
    }
  }, [])

  if (!visible) return null

  const { offline, pendingItems, syncing, done, total } = state
  const busy = syncing || (!offline && pendingItems > 0)

  const bgColor = offline
    ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
    : busy
      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
      : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800'

  const textColor = offline
    ? 'text-red-700 dark:text-red-300'
    : busy
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-green-700 dark:text-green-300'

  const iconColor = offline ? 'text-red-500' : busy ? 'text-amber-500' : 'text-green-500'

  const dismiss = () => {
    dismissedRef.current = true
    setVisible(false)
  }

  const progressPct = syncing && total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className={`fixed top-0 left-0 right-0 z-[9998] border-b px-4 py-2 ${bgColor} transition-all`}>
      <div className="flex items-center justify-between max-w-screen-xl mx-auto gap-2">
        <div className={`flex items-center gap-2 text-sm font-medium ${textColor} min-w-0`}>
          {offline ? (
            <WifiOff className={`h-4 w-4 shrink-0 ${iconColor}`} />
          ) : busy ? (
            <RefreshCw className={`h-4 w-4 shrink-0 animate-spin ${iconColor}`} />
          ) : (
            <Wifi className={`h-4 w-4 shrink-0 ${iconColor}`} />
          )}
          <span className="truncate">
            {offline
              ? t('offline.banner')
              : busy
                ? t('offline.syncing').replace('{count}', String(syncing && total > 0 ? total - done : pendingItems))
                : t('offline.backOnline')}
          </span>
          {syncing && total > 0 && (
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-xs tabular-nums">{done}/{total}</span>
              <span className="h-1.5 w-28 rounded-full bg-amber-200 dark:bg-amber-900/60 overflow-hidden">
                <span
                  className="block h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingItems > 0 && !offline && !syncing && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
              <AlertCircle className="h-3 w-3" />
              {pendingItems} {t('offline.pending')}
            </span>
          )}
          {/* The bar must stay visible while actively syncing — no dismiss then. */}
          {!syncing && (
            <button
              onClick={dismiss}
              className={`p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 ${textColor}`}
              title={t('common.dismiss')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
