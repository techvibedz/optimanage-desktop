import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { RefreshCw, Smartphone, Wifi, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { MobileScannerInfo } from '@/types/electron'

interface Props {
  open: boolean
  onClose: () => void
}

export default function MobileScannerModal({ open, onClose }: Props) {
  const [info, setInfo] = useState<MobileScannerInfo | null>(null)
  const [connectedCount, setConnectedCount] = useState(0)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Fetch pairing info each time the modal opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    window.electronAPI.getMobileScannerInfo().then((res) => {
      if (cancelled) return
      setInfo(res)
      setConnectedCount(res.connectedDevices)
    })
    return () => { cancelled = true }
  }, [open])

  // Live updates of paired device count + server error.
  useEffect(() => {
    if (!open) return
    const offCount = window.electronAPI.onMobileScannerClientChange((count) => {
      setConnectedCount(count)
    })
    const offErr = window.electronAPI.onMobileScannerServerError((message) => {
      setInfo((prev) => (prev ? { ...prev, serverError: message } : prev))
    })
    return () => { offCount(); offErr() }
  }, [open])

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const fresh = await window.electronAPI.regenerateMobileScannerToken()
      setInfo(fresh)
      setConnectedCount(0)
      toast.success('Code de jumelage régénéré — appairez à nouveau les téléphones')
    } finally {
      setRegenerating(false)
    }
  }

  const handleCopy = async () => {
    if (!info) return
    await navigator.clipboard.writeText(info.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-emerald-500" />
            Scanner Mobile
          </DialogTitle>
          <DialogDescription>
            Scannez ce QR code depuis l'application <strong className="text-foreground">OptiManage Scanner</strong> sur votre téléphone
            pour le jumeler à ce poste. Les deux appareils doivent être sur le même réseau Wi‑Fi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* QR or server-error banner */}
          <div className="flex justify-center">
            {info?.serverError ? (
              <div className="w-[248px] min-h-[248px] flex flex-col items-center justify-center gap-3 p-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-center">
                <AlertTriangle className="h-8 w-8" />
                <strong>Serveur scanner mobile indisponible</strong>
                <span className="text-xs opacity-90">{info.serverError}</span>
              </div>
            ) : (
              <div className="bg-white p-3.5 rounded-lg border border-black/10 shadow-sm">
                {info ? (
                  <QRCodeSVG value={info.url} size={220} level="M" includeMargin={false} fgColor="#000000" bgColor="#FFFFFF" />
                ) : (
                  <div className="w-[220px] h-[220px] grid place-items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Details */}
          {info && !info.serverError && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm font-mono space-y-1">
              <div className="flex items-center gap-2">
                <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">IP locale&nbsp;:</span>
                <strong className="text-foreground">{info.lanIp}</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Port&nbsp;:</span>
                <strong className="text-foreground">{info.port}</strong>
              </div>
              <div className="pt-1">
                <button
                  onClick={handleCopy}
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copié' : "Copier l'URL"}
                </button>
              </div>
            </div>
          )}

          {/* Connected devices badge */}
          <div
            className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-semibold border transition-colors ${
              connectedCount > 0
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
                : 'bg-muted/40 border-border text-muted-foreground'
            }`}
          >
            <span>
              {connectedCount === 0
                ? 'Aucun téléphone connecté'
                : `${connectedCount} téléphone${connectedCount > 1 ? 's' : ''} connecté${connectedCount > 1 ? 's' : ''}`}
            </span>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connectedCount > 0
                  ? 'bg-emerald-500 ring-4 ring-emerald-500/25 animate-pulse'
                  : 'bg-muted-foreground/40'
              }`}
            />
          </div>

          {/* Regenerate */}
          <button
            onClick={handleRegenerate}
            type="button"
            disabled={regenerating || !info}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
            Régénérer le code
          </button>

          {/* Firewall hint */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Astuce&nbsp;:</strong> si le téléphone ne se connecte pas, autorisez le port&nbsp;
            <strong className="text-foreground">{info?.port ?? 8765}</strong> dans le pare‑feu Windows pour OptiManage Desktop.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
