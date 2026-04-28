import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { processScannedCode } from '@/lib/useBarcodeScanner'

/**
 * Mounted once at the app root (`AppLayout`). Subscribes to scans pushed from
 * the Expo companion app via the local WebSocket bridge in `electron/main.ts`,
 * then runs them through the same `processScannedCode` helper used by the USB
 * keyboard listener and the webcam scanner.
 *
 * Renders nothing.
 */
export default function MobileScannerBridge() {
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return
    const off = window.electronAPI.onMobileScannerScan(async (value: string) => {
      await processScannedCode(value, user.id, navigate)
    })
    return off
  }, [user?.id, navigate])

  return null
}
