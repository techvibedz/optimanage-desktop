import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { Glasses, Eye, Package, Download, Plus, X, Loader2, CheckSquare, Square } from 'lucide-react'
import jsPDF from 'jspdf'

interface LensSummaryItem {
  id: string
  sph: string
  cyl: string
  lensType: string
  quantity: number
  orders: string[]
  isManual?: boolean
  manualIndex?: number
  lensIds?: string[]
  isTypeOnly?: boolean
}

const transposePrescription = (sphere: number, cylinder: number) => {
  if (sphere * cylinder < 0) {
    return { sphere: sphere + cylinder, cylinder: -cylinder, transposed: true }
  }
  return { sphere, cylinder, transposed: false }
}

export default function LensSummaryPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [orders, setOrders] = useState<any[]>([])
  const [selectedOrders, setSelectedOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [manualLenses, setManualLenses] = useState<LensSummaryItem[]>([])
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [newManualLens, setNewManualLens] = useState({ sph: '', cyl: '', lensType: '', quantity: 1 })
  const [excludedLenses, setExcludedLenses] = useState<Set<string>>(new Set())

  useEffect(() => { fetchOrders() }, [page])

  const fetchOrders = async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const result = await window.electronAPI.getOrders({ userId: user.id, page, limit: 20 })
      if (result.data) {
        setOrders(result.data.orders || [])
        setTotalPages(result.data.pagination?.pages || 1)
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleOrder = (orderId: string) => {
    const idx = selectedOrders.findIndex((o: any) => o.id === orderId)
    if (idx >= 0) {
      setSelectedOrders(prev => prev.filter((o: any) => o.id !== orderId))
    } else {
      const order = orders.find((o: any) => o.id === orderId)
      if (order) setSelectedOrders(prev => [...prev, order])
    }
  }

  const selectAll = () => {
    if (selectedOrders.length === orders.length) setSelectedOrders([])
    else setSelectedOrders([...orders])
  }

  const hasLensTypes = useMemo(() => {
    if (manualLenses.length > 0) return true
    return selectedOrders.some((o: any) =>
      o.vlRightEyeLensType || o.vlLeftEyeLensType || o.vpRightEyeLensType || o.vpLeftEyeLensType
    )
  }, [selectedOrders, manualLenses])

  const lensSummary = useMemo(() => {
    if (selectedOrders.length === 0 && manualLenses.length === 0) return []

    const allLenses: LensSummaryItem[] = []

    selectedOrders.forEach((order: any) => {
      if (!order.prescription) return
      const pData = [
        { sphere: order.prescription.vlRightEyeSphere, cylinder: order.prescription.vlRightEyeCylinder, lensType: order.vlRightEyeLensType?.name, eye: 'VL_R', qty: order.vlRightEyeLensQuantity || 1 },
        { sphere: order.prescription.vlLeftEyeSphere, cylinder: order.prescription.vlLeftEyeCylinder, lensType: order.vlLeftEyeLensType?.name, eye: 'VL_L', qty: order.vlLeftEyeLensQuantity || 1 },
        { sphere: order.prescription.vpRightEyeSphere, cylinder: order.prescription.vpRightEyeCylinder, lensType: order.vpRightEyeLensType?.name, eye: 'VP_R', qty: order.vpRightEyeLensQuantity || 1 },
        { sphere: order.prescription.vpLeftEyeSphere, cylinder: order.prescription.vpLeftEyeCylinder, lensType: order.vpLeftEyeLensType?.name, eye: 'VP_L', qty: order.vpLeftEyeLensQuantity || 1 },
      ]
      pData.forEach(d => {
        if (d.sphere !== undefined && d.cylinder !== undefined && d.lensType) {
          const { sphere: sph, cylinder: cyl } = transposePrescription(d.sphere, d.cylinder)
          const sphStr = sph === 0 ? '0.00' : sph.toFixed(2)
          const cylStr = cyl === 0 ? '0.00' : cyl.toFixed(2)
          const lensId = `${order.id}_${d.eye}_${sphStr}_${cylStr}_${d.lensType}`
          if (!excludedLenses.has(lensId)) {
            allLenses.push({ id: lensId, sph: sphStr, cyl: cylStr, lensType: d.lensType, quantity: d.qty, orders: [order.orderNumber || order.id.substring(0, 8)], isManual: false })
          }
        }
      })
    })

    manualLenses.forEach((lens, i) => {
      const lensId = `manual_${i}`
      if (!excludedLenses.has(lensId)) {
        allLenses.push({ id: lensId, sph: lens.sph, cyl: lens.cyl, lensType: lens.lensType, quantity: lens.quantity, orders: [], isManual: true, manualIndex: i, isTypeOnly: lens.isTypeOnly })
      }
    })

    const grouped: Record<string, LensSummaryItem> = {}
    allLenses.forEach(lens => {
      const key = lens.isManual ? `manual_${lens.manualIndex}` : `${lens.sph}_${lens.cyl}_${lens.lensType}`
      if (!grouped[key]) {
        grouped[key] = { ...lens, quantity: 0, lensIds: [] }
      }
      if (lens.isManual) {
        grouped[key].quantity = lens.quantity
        grouped[key].isTypeOnly = lens.isTypeOnly
      } else {
        grouped[key].quantity += lens.quantity
        grouped[key].lensIds?.push(lens.id)
        lens.orders.forEach(o => { if (!grouped[key].orders.includes(o)) grouped[key].orders.push(o) })
      }
    })

    return Object.values(grouped)
  }, [selectedOrders, manualLenses, excludedLenses])

  const addManualLens = () => {
    if (!newManualLens.lensType || newManualLens.quantity <= 0) return
    const lens: LensSummaryItem = {
      id: `manual_${Date.now()}`, sph: newManualLens.sph || '0', cyl: newManualLens.cyl || '0',
      lensType: newManualLens.lensType, quantity: newManualLens.quantity, orders: [], isManual: true,
      isTypeOnly: !newManualLens.sph && !newManualLens.cyl,
    }
    setManualLenses([...manualLenses, lens])
    setNewManualLens({ sph: '', cyl: '', lensType: '', quantity: 1 })
    setShowManualAdd(false)
  }

  const removeLens = (item: LensSummaryItem) => {
    if (item.isManual && item.manualIndex !== undefined) {
      setManualLenses(manualLenses.filter((_, i) => i !== item.manualIndex))
    } else if (item.lensIds && item.lensIds.length > 0) {
      setExcludedLenses(prev => new Set([...prev, item.lensIds![0]]))
    }
  }

  const generatePDF = () => {
    if (lensSummary.length === 0) return
    const doc = new jsPDF()
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.text(t('lensSummary.title'), 20, 30)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'normal')
    doc.text(`${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 20, 45)
    const totalLenses = lensSummary.reduce((sum, item) => sum + item.quantity, 0)
    doc.text(`Total: ${totalLenses} ${t('lensSummary.lenses')}`, 20, 60)

    let y = 75
    lensSummary.forEach(item => {
      let sphValue = parseFloat(item.sph)
      let cylValue = parseFloat(item.cyl)
      const transposed = transposePrescription(sphValue, cylValue)
      sphValue = transposed.sphere
      cylValue = transposed.cylinder

      let line = ''
      if (item.isTypeOnly) {
        line = `${item.quantity} ${item.lensType}`
      } else {
        const sphDisp = sphValue === 0 ? 'pl' : (sphValue > 0 ? `+${sphValue.toFixed(2)}` : sphValue.toFixed(2))
        if (cylValue === 0) {
          line = `${item.quantity}v ${sphDisp} ${item.lensType}`
        } else {
          const cylDisp = cylValue > 0 ? `+${cylValue.toFixed(2)}` : cylValue.toFixed(2)
          line = `${item.quantity}v (${cylDisp}) ${sphDisp} ${item.lensType}`
        }
      }
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text(line, 20, y)
      y += 10
      if (y > 280) { doc.addPage(); y = 20 }
    })
    doc.save(`lens-summary-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Glasses className="h-6 w-6 text-primary" />
          <div><h1>{t('lensSummary.title')}</h1><p>{t('lensSummary.subtitle')}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Selection Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">{t('lensSummary.selectOrders')}</h3>
              <button onClick={selectAll} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted">
                {selectedOrders.length === orders.length ? t('lensSummary.deselectAll') : t('lensSummary.selectAll')}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('lensSummary.selectedOf', { selected: selectedOrders.length, total: orders.length })}
            </p>

            <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
              {orders.map((order: any) => {
                const isSelected = selectedOrders.some((o: any) => o.id === order.id)
                return (
                  <div key={order.id} onClick={() => toggleOrder(order.id)}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border/50 hover:bg-muted/50'}`}>
                    {isSelected ? <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">#{order.orderNumber || order.id.substring(0, 8)}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] border border-border capitalize">{order.status?.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {order.customer?.firstName} {order.customer?.lastName} • {order.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted disabled:opacity-50">{t('common.previous')}</button>
              <span className="text-xs text-muted-foreground">{t('common.pageXofY', { page, total: totalPages })}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted disabled:opacity-50">{t('common.next')}</button>
            </div>
          </div>
        </div>

        {/* Lens Summary Panel */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold">{t('lensSummary.lensSummary')}</h3>
                <p className="text-xs text-muted-foreground">
                  {hasLensTypes ? t('lensSummary.uniqueCombinations', { count: lensSummary.length }) : t('lensSummary.noLensTypes')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowManualAdd(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted">
                  <Plus className="h-4 w-4" /> {t('lensSummary.addManualLens')}
                </button>
                <button onClick={generatePDF} disabled={lensSummary.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  <Download className="h-4 w-4" /> {t('lensSummary.downloadPDF')}
                </button>
              </div>
            </div>

            {!hasLensTypes ? (
              <div className="text-center py-12">
                <Eye className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {selectedOrders.length === 0 && manualLenses.length === 0 ? t('lensSummary.noOrdersSelected') : t('lensSummary.noLensData')}
                </h3>
                <p className="text-sm text-muted-foreground">{t('lensSummary.selectOrdersPrompt')}</p>
              </div>
            ) : lensSummary.length === 0 ? (
              <div className="text-center py-12">
                <Eye className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">{t('lensSummary.noLensData')}</h3>
              </div>
            ) : (
              <div className="space-y-3">
                {lensSummary.map((item, idx) => {
                  let sphValue = parseFloat(item.sph)
                  let cylValue = parseFloat(item.cyl)
                  const transposed = transposePrescription(sphValue, cylValue)
                  sphValue = transposed.sphere
                  cylValue = transposed.cylinder

                  return (
                    <div key={`${item.sph}_${item.cyl}_${item.lensType}_${idx}`}
                      className="p-4 border border-border/50 rounded-lg flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-2xl font-bold">
                            {cylValue === 0 ? '' : `(${cylValue > 0 ? `+${cylValue.toFixed(2)}` : cylValue.toFixed(2)}) `}
                            {sphValue === 0 ? 'pl' : (sphValue > 0 ? `+${sphValue.toFixed(2)}` : sphValue.toFixed(2))}
                          </span>
                          <span className="px-2 py-1 rounded-md text-sm font-medium border border-border">{item.lensType}</span>
                          {item.isManual && (
                            <span className="px-2 py-0.5 rounded-md text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{t('lensSummary.manual')}</span>
                          )}
                        </div>
                        <div className="mt-3 pt-2 border-t border-border/30">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-semibold">{item.quantity} {item.quantity > 1 ? t('lensSummary.lenses') : t('lensSummary.lens')}</span>
                            {!item.isManual && item.orders.length > 0 && (
                              <span className="ml-3">{t('lensSummary.orders')}: {item.orders.join(', ')}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="px-3 py-1 rounded-lg text-lg font-bold bg-muted">{item.quantity}</span>
                        <button onClick={() => removeLens(item)}
                          className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                          {t('lensSummary.remove')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Lens Modal */}
      {showManualAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('lensSummary.addManualLens')}</h3>
              <button onClick={() => setShowManualAdd(false)} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{t('lensSummary.sphere')}</label>
                <input type="text" value={newManualLens.sph} onChange={e => setNewManualLens({ ...newManualLens, sph: e.target.value })}
                  placeholder="-2.50 or +1.00" className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('lensSummary.cylinder')}</label>
                <input type="text" value={newManualLens.cyl} onChange={e => setNewManualLens({ ...newManualLens, cyl: e.target.value })}
                  placeholder="-1.25 or 0" className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('lensSummary.lensType')}</label>
                <input type="text" value={newManualLens.lensType} onChange={e => setNewManualLens({ ...newManualLens, lensType: e.target.value })}
                  placeholder="Single Vision, Progressive..." className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('lensSummary.quantity')}</label>
                <input type="number" value={newManualLens.quantity} onChange={e => setNewManualLens({ ...newManualLens, quantity: parseInt(e.target.value) || 1 })}
                  min="1" className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowManualAdd(false); setNewManualLens({ sph: '', cyl: '', lensType: '', quantity: 1 }) }}
                className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">{t('common.cancel')}</button>
              <button onClick={addManualLens}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">{t('lensSummary.addLens')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
