import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { ArrowLeft, Printer, Plus, Trash2 } from 'lucide-react'
import AlgerianFacture from '@/components/print/AlgerianFacture'

export interface FactureItem {
  id: string
  desc: string
  qty: number
  price: number
  type: 'frame' | 'lens' | 'contact_lens' | 'service' | 'custom'
}

export default function PrintFacturePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)
  const [extraItems, setExtraItems] = useState<FactureItem[]>([])
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({})
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState({ desc: '', qty: 1, price: 0, type: 'custom' as FactureItem['type'] })

  useEffect(() => { if (id) fetchOrder() }, [id])

  const fetchOrder = async () => {
    if (!user?.id || !id) return
    setLoading(true)
    const res = await window.electronAPI.getOrder(id)
    if (res.data) setOrder(res.data)
    setLoading(false)
  }

  const handlePrint = () => window.electronAPI.printSlip()

  const addExtraItem = () => {
    if (!newItem.desc || newItem.price <= 0) return
    setExtraItems(prev => [...prev, { ...newItem, id: `extra_${Date.now()}` }])
    setNewItem({ desc: '', qty: 1, price: 0, type: 'custom' })
    setShowAddItem(false)
  }

  const removeExtraItem = (itemId: string) => {
    setExtraItems(prev => prev.filter(i => i.id !== itemId))
  }

  const handlePriceOverride = (key: string, value: number) => {
    setPriceOverrides(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="loading-spinner-lg" />
        <span className="ml-3 text-sm text-muted-foreground">Chargement de la facture...</span>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Erreur</h2>
          <p className="text-muted-foreground">Commande introuvable</p>
          <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 border border-border rounded-lg hover:bg-muted text-sm flex items-center gap-2 mx-auto">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { position: absolute; left: 0; top: 0; width: 100%; }
          .print-controls { display: none !important; }
          @page { size: A5 portrait; margin: 2mm 3mm; }
        }
      `}</style>

      <div className="print-controls bg-white dark:bg-gray-900 shadow-sm border-b border-border px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="px-3 py-2 border border-border rounded-lg hover:bg-muted text-sm flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <h1 className="text-lg font-semibold">Facture {order.orderNumber}</h1>
          </div>
          <button onClick={handlePrint} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium flex items-center gap-2">
            <Printer className="h-4 w-4" /> Imprimer
          </button>
        </div>
      </div>

      {/* Editable items panel */}
      <div className="print-controls max-w-4xl mx-auto px-4 py-4 space-y-4">
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2">Instructions d'impression</h2>
          <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
            <li>Utilisez du papier A5 (148 x 210 mm)</li>
            <li>Orientation portrait</li>
            <li>Désactivez les en-têtes et pieds de page</li>
            <li>Échelle d'impression: 100%</li>
          </ul>
        </div>

        {/* Price override + extra items */}
        <div className="bg-white dark:bg-gray-800/50 border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Modifier les prix de la facture</h3>
          <div className="space-y-2 text-sm">
            {/* Frame price override */}
            {order.frame && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Monture: {order.frame.brand} {order.frame.model || ''}</span>
                <input type="number" value={priceOverrides['frame'] ?? (order.framePrice || order.frame?.sellingPrice || 0)}
                  onChange={e => handlePriceOverride('frame', Number(e.target.value))}
                  className="w-28 px-2 py-1 border border-border rounded text-sm bg-background text-right" />
              </div>
            )}
            {/* VL lens price overrides */}
            {order.vlRightEyeLensPrice > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">VL OD: {order.vlRightEyeLensType?.name || 'Verre VL'}</span>
                <input type="number" value={priceOverrides['vlR'] ?? order.vlRightEyeLensPrice}
                  onChange={e => handlePriceOverride('vlR', Number(e.target.value))}
                  className="w-28 px-2 py-1 border border-border rounded text-sm bg-background text-right" />
              </div>
            )}
            {order.vlLeftEyeLensPrice > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">VL OG: {order.vlLeftEyeLensType?.name || 'Verre VL'}</span>
                <input type="number" value={priceOverrides['vlL'] ?? order.vlLeftEyeLensPrice}
                  onChange={e => handlePriceOverride('vlL', Number(e.target.value))}
                  className="w-28 px-2 py-1 border border-border rounded text-sm bg-background text-right" />
              </div>
            )}
            {/* VP lens price overrides */}
            {order.vpRightEyeLensPrice > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">VP OD: {order.vpRightEyeLensType?.name || 'Verre VP'}</span>
                <input type="number" value={priceOverrides['vpR'] ?? order.vpRightEyeLensPrice}
                  onChange={e => handlePriceOverride('vpR', Number(e.target.value))}
                  className="w-28 px-2 py-1 border border-border rounded text-sm bg-background text-right" />
              </div>
            )}
            {order.vpLeftEyeLensPrice > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">VP OG: {order.vpLeftEyeLensType?.name || 'Verre VP'}</span>
                <input type="number" value={priceOverrides['vpL'] ?? order.vpLeftEyeLensPrice}
                  onChange={e => handlePriceOverride('vpL', Number(e.target.value))}
                  className="w-28 px-2 py-1 border border-border rounded text-sm bg-background text-right" />
              </div>
            )}
          </div>

          {/* Extra items */}
          {extraItems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">Articles supplémentaires</h4>
              {extraItems.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1">{item.desc} (x{item.qty})</span>
                  <span className="font-medium">{item.price.toLocaleString()} DA</span>
                  <button onClick={() => removeExtraItem(item.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add item form */}
          {showAddItem ? (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <select value={newItem.type} onChange={e => setNewItem(p => ({ ...p, type: e.target.value as FactureItem['type'] }))}
                  className="px-2 py-1.5 border border-border rounded text-xs bg-background">
                  <option value="frame">Monture</option>
                  <option value="contact_lens">Lentilles</option>
                  <option value="service">Service</option>
                  <option value="custom">Autre</option>
                </select>
                <input value={newItem.desc} onChange={e => setNewItem(p => ({ ...p, desc: e.target.value }))}
                  placeholder="Description" className="px-2 py-1.5 border border-border rounded text-xs bg-background" />
                <input type="number" value={newItem.qty} onChange={e => setNewItem(p => ({ ...p, qty: Number(e.target.value) }))}
                  min={1} placeholder="Qté" className="px-2 py-1.5 border border-border rounded text-xs bg-background" />
                <input type="number" value={newItem.price || ''} onChange={e => setNewItem(p => ({ ...p, price: Number(e.target.value) }))}
                  placeholder="Prix" className="px-2 py-1.5 border border-border rounded text-xs bg-background" />
              </div>
              <div className="flex gap-2">
                <button onClick={addExtraItem} disabled={!newItem.desc || newItem.price <= 0}
                  className="px-3 py-1.5 bg-primary text-white rounded text-xs font-medium disabled:opacity-50">Ajouter</button>
                <button onClick={() => setShowAddItem(false)} className="px-3 py-1.5 border border-border rounded text-xs">Annuler</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddItem(true)} className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Ajouter un article (monture, lentilles, etc.)
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-100 dark:bg-gray-950 min-h-[60vh] p-5">
        <div className="print-content bg-white max-w-[148mm] mx-auto shadow-md" ref={printRef}>
          <AlgerianFacture order={order} extraItems={extraItems} priceOverrides={priceOverrides} />
        </div>
      </div>
    </>
  )
}
