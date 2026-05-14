import { useEffect, useRef } from 'react'

/**
 * Calls `onRefresh` whenever connectivity changes (online↔offline or after sync completes).
 * Debounces rapid-fire events to a single call within 300ms.
 */
export function useConnectivityRefresh(onRefresh: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(onRefresh)
  callbackRef.current = onRefresh

  useEffect(() => {
    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => callbackRef.current(), 300)
    }

    const unsubConn = window.electronAPI?.onConnectivityStatus?.(() => {
      scheduleRefresh()
    })

    const unsubSync = window.electronAPI?.onSyncStatus?.(() => {
      scheduleRefresh()
    })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      unsubConn?.()
      unsubSync?.()
    }
  }, [])
}
