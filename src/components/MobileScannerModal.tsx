import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { X, RefreshCw, Smartphone, Wifi, Copy, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
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

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--background, #fff)',
          color: 'var(--foreground, #000)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 480,
          padding: '1.5rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Smartphone size={22} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Scanner Mobile</h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Fermer"
            style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4, color: 'inherit' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', opacity: 0.75, marginTop: 0, marginBottom: '1rem' }}>
          Scannez ce QR code depuis l'application <strong>OptiManage Scanner</strong> sur votre téléphone
          pour le jumeler à ce poste. Les deux appareils doivent être sur le même réseau Wi‑Fi.
        </p>

        {/* QR or server-error banner */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          {info?.serverError ? (
            <div
              style={{
                width: 248,
                minHeight: 248,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 16,
                borderRadius: 10,
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.45)',
                color: 'rgb(239,68,68)',
                textAlign: 'center',
              }}
            >
              <AlertTriangle size={32} />
              <strong>Serveur scanner mobile indisponible</strong>
              <span style={{ fontSize: '0.85rem', opacity: 0.9, color: 'inherit' }}>
                {info.serverError}
              </span>
            </div>
          ) : (
            <div
              style={{
                background: '#fff',
                padding: 14,
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.08)',
              }}
            >
              {info ? (
                <QRCodeSVG value={info.url} size={220} level="M" includeMargin={false} />
              ) : (
                <div style={{ width: 220, height: 220, display: 'grid', placeItems: 'center' }}>
                  <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Details */}
        {info && (
          <div
            style={{
              background: 'rgba(127,127,127,0.08)',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Wifi size={14} />
              <span>IP locale&nbsp;: <strong>{info.lanIp}</strong></span>
            </div>
            <div>Port&nbsp;: <strong>{info.port}</strong></div>
            <div style={{ wordBreak: 'break-all', marginTop: 6 }}>
              <button
                onClick={handleCopy}
                type="button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  border: '1px solid rgba(127,127,127,0.3)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  color: 'inherit',
                  fontSize: '0.8rem',
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copié' : 'Copier l\'URL'}
              </button>
            </div>
          </div>
        )}

        {/* Connected devices badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: connectedCount > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(127,127,127,0.08)',
            border: `1px solid ${connectedCount > 0 ? 'rgba(34,197,94,0.4)' : 'rgba(127,127,127,0.2)'}`,
            color: connectedCount > 0 ? 'rgb(22,163,74)' : 'inherit',
            borderRadius: 8,
            padding: '0.6rem 0.9rem',
            marginBottom: '1rem',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <span>
            {connectedCount === 0
              ? 'Aucun téléphone connecté'
              : `${connectedCount} téléphone${connectedCount > 1 ? 's' : ''} connecté${connectedCount > 1 ? 's' : ''}`}
          </span>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connectedCount > 0 ? 'rgb(34,197,94)' : 'rgb(127,127,127)',
            boxShadow: connectedCount > 0 ? '0 0 0 4px rgba(34,197,94,0.2)' : 'none',
            animation: connectedCount > 0 ? 'pulse 2s ease-in-out infinite' : 'none',
          }} />
        </div>

        {/* Regenerate */}
        <button
          onClick={handleRegenerate}
          type="button"
          disabled={regenerating || !info}
          style={{
            width: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'transparent',
            border: '1px solid rgba(127,127,127,0.3)',
            borderRadius: 8,
            padding: '0.6rem 1rem',
            cursor: regenerating ? 'wait' : 'pointer',
            opacity: regenerating ? 0.6 : 1,
            color: 'inherit',
            fontSize: '0.9rem',
            marginBottom: '1rem',
          }}
        >
          <RefreshCw size={16} className={regenerating ? 'animate-spin' : ''} />
          Régénérer le code
        </button>

        {/* Firewall hint */}
        <p style={{ fontSize: '0.75rem', opacity: 0.65, margin: 0, lineHeight: 1.5 }}>
          <strong>Astuce&nbsp;:</strong> si le téléphone ne se connecte pas, autorisez le port&nbsp;
          <strong>{info?.port ?? 8765}</strong> dans le pare‑feu Windows pour OptiManage Desktop.
        </p>
      </div>
    </div>,
    document.body,
  )
}
