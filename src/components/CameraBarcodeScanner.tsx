import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { X, Camera, RefreshCw } from 'lucide-react'

interface CameraBarcodeScannerProps {
  open: boolean
  onClose: () => void
  /** Called once with the decoded text when a barcode is recognized. */
  onDetected: (text: string) => void
  /** Optional title shown in the modal header. */
  title?: string
}

/**
 * Modal that opens the user's webcam and scans for barcodes using ZXing.
 * Recognizes CODE128 (used on order slips) plus a few common formats.
 */
export default function CameraBarcodeScanner({
  open,
  onClose,
  onDetected,
  title = 'Scanner un code-barres',
}: CameraBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const [starting, setStarting] = useState(false)

  // List available cameras whenever the modal opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        // Trigger a permission prompt first so device labels appear.
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        stream.getTracks().forEach(t => t.stop())
        const all = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        const cams = all.filter(d => d.kind === 'videoinput')
        setDevices(cams)
        if (!deviceId && cams.length) setDeviceId(cams[0].deviceId)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Camera access denied')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Start / restart scanning whenever the modal is open and a device is chosen.
  useEffect(() => {
    if (!open || !deviceId || !videoRef.current) return

    // Performance hints for low-quality webcams:
    //  - Restrict to CODE_128 only (the format used on our slips). Each extra
    //    format roughly doubles per-frame decode work.
    //  - TRY_HARDER: more aggressive scan-line search (slower per frame but
    //    catches blurry / partial barcodes that fast mode misses).
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128])
    hints.set(DecodeHintType.TRY_HARDER, true)

    // Use a faster decoder cycle (default is 500ms). 100ms ≈ 10 attempts/sec.
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 } as any)
    setStarting(true)
    setError(null)

    // Request the highest resolution the camera can deliver. Sharper frames
    // matter much more than frame-rate when the lens is poor: a 1080p frame
    // at 15fps decodes a barcode far better than a 480p frame at 30fps.
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // facingMode is ignored on PCs but improves phone behavior if ever ported.
        facingMode: { ideal: 'environment' },
        // Hint the browser to prefer continuous autofocus/exposure if available.
        // (Cast to any — these are non-standard on TS lib types but supported
        // in Chromium-based Electron.)
        ...( {
          advanced: [
            { focusMode: 'continuous' },
            { exposureMode: 'continuous' },
            { whiteBalanceMode: 'continuous' },
          ],
        } as any ),
      },
      audio: false,
    }

    reader
      .decodeFromConstraints(constraints, videoRef.current, (result, _err, controls) => {
        if (controls && !controlsRef.current) {
          controlsRef.current = controls
          // Once the track is live, try to apply continuous autofocus etc. via
          // applyConstraints — many webcams expose these only post-start.
          const stream = videoRef.current?.srcObject as MediaStream | null
          const track = stream?.getVideoTracks()[0]
          if (track) {
            const caps = (track.getCapabilities?.() || {}) as any
            const adv: any[] = []
            if (caps.focusMode?.includes?.('continuous')) adv.push({ focusMode: 'continuous' })
            if (caps.exposureMode?.includes?.('continuous')) adv.push({ exposureMode: 'continuous' })
            if (caps.whiteBalanceMode?.includes?.('continuous')) adv.push({ whiteBalanceMode: 'continuous' })
            if (adv.length) track.applyConstraints({ advanced: adv } as any).catch(() => {})
          }
        }
        if (result) {
          const text = result.getText()
          // Stop the camera before bubbling the result up.
          controlsRef.current?.stop()
          controlsRef.current = null
          onDetected(text)
        }
      })
      .then(controls => {
        controlsRef.current = controls
        setStarting(false)
      })
      .catch(err => {
        setError(err?.message || 'Failed to start camera')
        setStarting(false)
      })

    return () => {
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [open, deviceId, onDetected])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl p-4 w-full max-w-lg shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Camera className="h-5 w-5" /> {title}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {/* Visual aiming guide */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-3/4 h-1/3 border-2 border-red-500/80 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Démarrage de la caméra…
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {devices.length > 1 && (
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">Caméra</label>
            <select
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-background"
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Caméra ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground text-center">
          Pointez la caméra sur le code-barres du bon de commande.
        </p>
      </div>
    </div>,
    document.body,
  )
}
