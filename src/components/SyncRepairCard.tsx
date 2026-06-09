import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, Link2, Wrench } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import type { SyncDiagnosis, SyncUnresolvedPayment } from '@/types/electron'

/**
 * Sync Repair panel. Surfaces offline records that are stuck syncing — in
 * particular payments whose order link was lost under the old buggy sync — and
 * lets the user relink a payment to the correct server order WITHOUT creating or
 * editing any order. Pairs with the main-process `sync:diagnose` / `sync:relinkOrder`.
 */
export default function SyncRepairCard() {
  const { settings } = useSettings()
  const cur = settings.currency || 'DA'
  const [diag, setDiag] = useState<SyncDiagnosis | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})

  const money = (n: number | null | undefined) =>
    `${Number(n || 0).toLocaleString('fr-FR')} ${cur}`
  const day = (d?: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')

  const load = useCallback(async () => {
    if (!window.electronAPI?.diagnoseSync) return
    setLoading(true)
    try {
      const res = await window.electronAPI.diagnoseSync()
      setDiag(res)
    } catch (e: any) {
      toast.error("Échec du diagnostic de synchronisation")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const relink = async (p: SyncUnresolvedPayment) => {
    const serverOrderId = picks[p.queueId]
    if (!serverOrderId) {
      toast.error("Choisissez d'abord la commande correspondante")
      return
    }
    setBusyId(p.queueId)
    try {
      const res = await window.electronAPI.relinkSyncOrder({ localOrderId: p.localOrderId, serverOrderId })
      if (res?.error) { toast.error(res.error); return }
      toast.success('Paiement relié — synchronisation relancée')
      setTimeout(load, 1500)
    } catch (e: any) {
      toast.error("Échec de la liaison")
    } finally {
      setBusyId(null)
    }
  }

  const retryAll = async () => {
    setLoading(true)
    try {
      await window.electronAPI.retrySyncNow()
      toast.success('Synchronisation relancée')
      setTimeout(load, 1500)
    } catch {
      toast.error('Échec de la relance')
    } finally {
      setLoading(false)
    }
  }

  const pending = diag?.pendingItems ?? 0
  const quarantined = diag?.quarantinedItems ?? 0
  const unresolved = diag?.unresolvedPayments ?? []
  const allClear = pending === 0 && quarantined === 0 && unresolved.length === 0

  return (
    <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-6 max-w-2xl mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wrench className="h-4.5 w-4.5" /> Réparation de synchronisation
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Actualiser
        </button>
      </div>

      {!diag ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : allClear ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Tout est synchronisé. Rien à réparer.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            {pending} en attente{quarantined > 0 ? `, ${quarantined} en quarantaine` : ''}.
          </div>

          {unresolved.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Ces paiements ont été faits hors-ligne sur une commande dont le lien a été perdu.
              Choisissez la bonne commande pour chacun afin de terminer la synchronisation —
              <strong> aucune commande ne sera créée ni modifiée.</strong>
            </p>
          )}

          {unresolved.map((p) => (
            <div key={p.queueId} className="border border-border rounded-lg p-3 space-y-2">
              <div className="text-sm">
                <span className="font-semibold">Paiement de {money(p.amount)}</span>
                <span className="text-muted-foreground"> · {p.paymentMethod || 'paiement'} · {day(p.paymentDate)}</span>
                {p.quarantined && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">quarantaine</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                Commande hors-ligne : <span className="font-mono">{p.localOrder?.orderNumber || '—'}</span>
                {p.localOrder && <> · {p.localOrder.customerName || 'client inconnu'} · {money(p.localOrder.totalPrice)} · {day(p.localOrder.createdAt)}</>}
              </div>

              {p.candidates.length === 0 ? (
                <p className="text-xs text-red-500">
                  Aucune commande trouvée sur le serveur pour ce client. Vérifiez la connexion puis actualisez.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <select
                    value={picks[p.queueId] || ''}
                    onChange={(e) => setPicks((s) => ({ ...s, [p.queueId]: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  >
                    <option value="">— Choisir la commande serveur —</option>
                    {p.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.orderNumber} · {c.customerName} · {money(c.totalPrice)} · {day(c.createdAt)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => relink(p)}
                    disabled={busyId === p.queueId || !picks[p.queueId]}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {busyId === p.queueId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Lier
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="pt-1">
            <button
              onClick={retryAll}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Réessayer la synchronisation
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
