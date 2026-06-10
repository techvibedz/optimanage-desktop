import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, Link2, Wrench, Trash2, X } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import type { SyncDiagnosis, SyncUnresolvedPayment } from '@/types/electron'

/**
 * Sync Repair panel. Surfaces offline records that are stuck syncing and gives
 * two ways to clear them:
 *   1. Relink — for payments whose order link was lost under the old buggy sync,
 *      pick the correct server order WITHOUT creating or editing any order.
 *   2. Discard — manually remove a stuck item the user has confirmed is fine
 *      (record already on the server / no longer needed). Two-step confirm, with
 *      a stronger warning before discarding a payment (money data).
 * Pairs with main-process `sync:diagnose` / `sync:relinkOrder` / `sync:discardItem`.
 */

type StuckItem = SyncDiagnosis['items'][number]

const KIND_LABELS: Record<string, string> = {
  customer: 'Client',
  prescription: 'Ordonnance',
  order: 'Commande',
  payment: 'Paiement',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'création',
  update: 'modification',
  delete: 'suppression',
}

export default function SyncRepairCard() {
  const { settings } = useSettings()
  const cur = settings.currency || 'DA'
  const [diag, setDiag] = useState<SyncDiagnosis | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})
  // Two-step discard confirmation: holds the "id|action" key awaiting confirm.
  const [confirmKey, setConfirmKey] = useState<string | null>(null)

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

  const discard = async (it: StuckItem) => {
    const key = `${it.id}|${it.action}`
    setBusyId(key)
    try {
      const res = await window.electronAPI.discardSyncItem({ id: it.id, action: it.action })
      if (res?.error) { toast.error(res.error); return }
      toast.success('Élément retiré de la file de synchronisation')
      setConfirmKey(null)
      setTimeout(load, 600)
    } catch {
      toast.error('Échec du retrait')
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
  const items = diag?.items ?? []
  // Order ids that already have a dedicated relink card below, so we don't also
  // list their payment row twice in the generic stuck-items list.
  const relinkQueueIds = new Set(unresolved.map((u) => u.queueId))
  const stuck = items.filter((it) => !relinkQueueIds.has(it.id))
  const allClear = pending === 0 && quarantined === 0 && unresolved.length === 0 && stuck.length === 0

  const describe = (it: StuckItem) => {
    const kind = KIND_LABELS[it.kind] || it.kind
    const op = ACTION_LABELS[it.action.split(':')[1]] || ''
    let detail = ''
    if (it.kind === 'order' && it.orderNumber) detail = ` ${it.orderNumber}`
    else if (it.kind === 'payment' && it.amount != null) detail = ` de ${money(it.amount)}`
    return `${kind}${detail}${op ? ` · ${op}` : ''}`
  }

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

          {/* Every stuck item, with a clear reason and a manual Discard escape hatch. */}
          {stuck.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Éléments bloqués dans la file. Si la donnée est déjà correcte sur le serveur ou n'a
                plus besoin d'être synchronisée, retirez-la pour débloquer la synchronisation.
              </p>
              {stuck.map((it) => {
                const key = `${it.id}|${it.action}`
                const confirming = confirmKey === key
                const isPayment = it.kind === 'payment'
                return (
                  <div key={key} className="border border-border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          {describe(it)}
                          {it.quarantined && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">quarantaine</span>}
                          {it.retries > 0 && <span className="text-[11px] text-muted-foreground">{it.retries} tentative{it.retries > 1 ? 's' : ''}</span>}
                        </div>
                        {it.reason && (
                          <p className="text-xs text-red-500 break-words mt-0.5">{it.reason}</p>
                        )}
                      </div>

                      {!confirming ? (
                        <button
                          onClick={() => setConfirmKey(key)}
                          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Retirer
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmKey(null)}
                          className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-border hover:bg-muted"
                        >
                          <X className="h-3.5 w-3.5" /> Annuler
                        </button>
                      )}
                    </div>

                    {confirming && (
                      <div className="rounded-lg bg-muted/60 p-2.5 space-y-2">
                        <p className="text-xs">
                          {isPayment ? (
                            <span className="text-red-600 font-medium">
                              ⚠ Ceci est un paiement. Ne le retirez que si vous êtes certain qu'il est
                              déjà enregistré sur le serveur — sinon le montant sera perdu.
                            </span>
                          ) : (
                            <>Retirer définitivement cet élément de la file de synchronisation ? La donnée locale n'est pas supprimée.</>
                          )}
                        </p>
                        <button
                          onClick={() => discard(it)}
                          disabled={busyId === key}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {busyId === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Confirmer le retrait
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

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
