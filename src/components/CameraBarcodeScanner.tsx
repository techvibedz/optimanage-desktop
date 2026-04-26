import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
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
  const streamRef = useRef<MediaStream | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
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
    const video = videoRef.current

    // Restrict to CODE_128 (slip format) and enable TRY_HARDER. With a single
    // format, each decode attempt is fast enough to run at ~12/sec.
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128])
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new BrowserMultiFormatReader(hints)

    setStarting(true)
    setError(null)

    // Off-screen canvases reused across the loop. ZXing's 1D readers only
    // scan horizontal rows, so a 90°-rotated copy is needed to also detect
    // barcodes held vertically — that's what makes "any orientation" work.
    const baseCanvas = document.createElement('canvas')
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true })!
    const rotCanvas = document.createElement('canvas')
    const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true })!

    let stopped = false
    let timeoutId: number | null = null

    const tryDecodeCanvas = (c: HTMLCanvasElement): string | null => {
      try {
        const result = (reader as any).decodeFromCanvas(c)
        return result?.getText?.() ?? null
      } catch {
        return null
      }
    }

    const loop = () => {
      if (stopped) return
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const w = video.videoWidth
        const h = video.videoHeight
        if (baseCanvas.width !== w || baseCanvas.height !== h) {
          baseCanvas.width = w
          baseCanvas.height = h
        }
        baseCtx.drawImage(video, 0, 0, w, h)

        // 1) Try the original orientation first (most common case).
        let text = tryDecodeCanvas(baseCanvas)

        // 2) If not found, rotate 90° and try again. This catches barcodes
        //    held vertically — bars become horizontal in the source frame
        //    and ZXing's row scan would miss them otherwise.
        if (!text) {
          if (rotCanvas.width !== h || rotCanvas.height !== w) {
            rotCanvas.width = h
            rotCanvas.height = w
          }
          rotCtx.save()
          rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2)
          rotCtx.rotate(Math.PI / 2)
          rotCtx.drawImage(baseCanvas, -w / 2, -h / 2)
          rotCtx.restore()
          text = tryDecodeCanvas(rotCanvas)
        }

        if (text) {
          stopped = true
          stopRef.current?.()
          onDetected(text)
          return
        }
      }
      timeoutId = window.setTimeout(loop, 80)
    }

    // Acquire the camera ourselves so we can manage the loop lifecycle and
    // also apply continuous autofocus once the track is live.
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: { ideal: 'environment' },
      },
      audio: false,
    }

    const stop = () => {
      stopped = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (video.srcObject) video.srcObject = null
    }
    stopRef.current = stop

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(async stream => {
        if (stopped) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        video.srcObject = stream
        await video.play().catch(() => {})

        // Apply continuous autofocus / exposure / white-balance if supported.
        const track = stream.getVideoTracks()[0]
        if (track) {
          const caps = (track.getCapabilities?.() || {}) as any
          const adv: any[] = []
          if (caps.focusMode?.includes?.('continuous')) adv.push({ focusMode: 'continuous' })
          if (caps.exposureMode?.includes?.('continuous')) adv.push({ exposureMode: 'continuous' })
          if (caps.whiteBalanceMode?.includes?.('continuous')) adv.push({ whiteBalanceMode: 'continuous' })
          if (adv.length) track.applyConstraints({ advanced: adv } as any).catch(() => {})
        }

        setStarting(false)
        loop()
      })
      .catch(err => {
        setError(err?.message || 'Failed to start camera')
        setStarting(false)
      })

    return () => {
      stop()
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
          {/* Subtle scanning indicator (animated horizontal line) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute inset-x-0 h-0.5 bg-red-500/80 shadow-[0_0_8px_2px_rgba(239,68,68,0.6)] animate-[scan_1.6s_linear_infinite]" />
          </div>
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black/40">
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
          Présentez le code-barres devant la caméra — n'importe où dans le cadre, dans n'importe quel sens.
        </p>
      </div>
    </div>,
    document.body,
  )
}
