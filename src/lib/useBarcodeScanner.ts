import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from './auth-context'

/**
 * Global barcode scanner listener.
 *
 * USB barcode scanners typically act as keyboards: they emit characters very
 * quickly (a few ms apart) followed by Enter. This hook detects that pattern
 * and, if the scanned value matches an order number (`ORD-...`), looks up the
 * order and navigates to its details page.
 *
 * Safety:
 * - Ignored when the user is currently typing in an input/textarea/contenteditable.
 * - Buffer is reset after `MAX_GAP_MS` of inactivity so manual typing is not
 *   accidentally captured.
 */

// A barcode scanner is much faster than a human typist; ~50ms is a safe upper bound.
const MAX_GAP_MS = 50
// Minimum length of a valid barcode payload (avoids accidental Enter after one key).
const MIN_LEN = 4
// Pattern of order numbers we recognize (matches `ORD-1`, `ORD-1841`, etc.)
const ORDER_NUMBER_RE = /^ORD-\d+$/i

function isTypingInField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

export function useBarcodeScanner() {
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return

    let buffer = ''
    let lastKeyAt = 0

    const handleKey = async (e: KeyboardEvent) => {
      // Don't interfere with users typing in form fields.
      if (isTypingInField(e.target)) return

      const now = performance.now()
      const gap = now - lastKeyAt
      lastKeyAt = now

      // If too much time passed since last key, start a new buffer.
      if (gap > MAX_GAP_MS) buffer = ''

      if (e.key === 'Enter') {
        const code = buffer.trim()
        buffer = ''
        if (code.length < MIN_LEN) return

        // Match order number pattern.
        if (ORDER_NUMBER_RE.test(code)) {
          e.preventDefault()
          const upper = code.toUpperCase()
          const res = await window.electronAPI.findOrderByNumber({
            userId: user.id,
            orderNumber: upper,
          })
          if (res.data?.id) {
            toast.success(`Commande ${upper} ouverte`)
            navigate(`/orders/${res.data.id}`)
          } else {
            toast.error(`Commande ${upper} introuvable`)
          }
        }
        return
      }

      // Only buffer printable single-character keys (letters, digits, dashes…).
      if (e.key.length === 1) {
        buffer += e.key
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [user?.id, navigate])
}
