import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { useConnectivityRefresh } from '@/lib/use-connectivity-refresh'
import { toast } from 'sonner'
import { Plus, Search, Package, Pencil, Trash2 } from 'lucide-react'

// Predefined options for lens type dropdowns
const LENS_CATEGORIES = ['Unifocal', 'Bifocal', 'Progressif', 'Mi-distance', 'Solaire']
const LENS_MATERIALS = ['CR-39', 'Polycarbonate', 'Trivex', 'Haut indice', 'Min\u00e9ral']
const LENS_INDICES = ['1.50', '1.56', '1.59', '1.60', '1.67', '1.74']

// Stored priceRanges (array or JSON string) → editable string rows.
const parseRangesForForm = (raw: any): { sphMax: string; cylMax: string; cost: string }[] => {
  let val = raw
  if (typeof raw === 'string') { try { val = JSON.parse(raw) } catch { return [] } }
  if (!Array.isArray(val)) return []
  return val.map((r: any) => ({
    sphMax: r?.sphMax == null ? '' : String(r.sphMax),
    cylMax: r?.cylMax == null ? '' : String(r.cylMax),
    cost: r?.cost == null ? '' : String(r.cost),
  }))
}

export default function InventoryPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<'frames' | 'lensTypes' | 'contactLenses'>('frames')
  const [frames, setFrames] = useState<any[]>([])
  const [lensTypes, setLensTypes] = useState<any[]>([])
  const [contactLenses, setContactLenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showFrameForm, setShowFrameForm] = useState(false)
  const [showLensForm, setShowLensForm] = useState(false)
  const [showCLForm, setShowCLForm] = useState(false)
  const [frameForm, setFrameForm] = useState({ brand: '', model: '', color: '', size: '', cost: '', sellingPrice: '', stock: '' })
  const [lensForm, setLensForm] = useState({ name: '', category: '', material: '', index: '', baseCost: '', sellingPrice: '', stock: '', reorderThreshold: '', supplierName: '', supplierContact: '' })
  // Per-prescription cost groups for the lens type being edited: each row is
  // { sphere ≤, cylinder ≤, cost }. Blank bound = no limit on that axis.
  const [lensRanges, setLensRanges] = useState<{ sphMax: string; cylMax: string; cost: string }[]>([])
  const [clForm, setClForm] = useState({ brand: '', model: '', price: '', cost: '' })
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [tab, search])
  useConnectivityRefresh(useCallback(() => { fetchData() }, [tab, search]))

  const fetchData = async () => {
    if (!user?.id) return
    setLoading(true)
    if (tab === 'frames') {
      const res = await window.electronAPI.getFrames({ userId: user.id, query: search })
      if (res.data) setFrames(res.data)
    } else if (tab === 'lensTypes') {
      const res = await window.electronAPI.getLensTypes({ userId: user.id, search })
      if (res.data) setLensTypes(res.data)
    } else {
      const res = await window.electronAPI.getContactLenses({ userId: user.id, search })
      if (res.data) setContactLenses(res.data)
    }
    setLoading(false)
  }

  const handleCLSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clForm.brand) { toast.error('Brand is required'); return }
    const payload = {
      brand: clForm.brand,
      model: clForm.model || null,
      price: parseFloat(clForm.price) || 0,
      cost: parseFloat(clForm.cost) || 0,
    }
    if (editingId) {
      const res = await window.electronAPI.updateContactLens(editingId, payload)
      if (res.error) { toast.error(res.error); return }
      toast.success('Contact lens updated')
    } else {
      const res = await window.electronAPI.createContactLens({ ...payload, userId: user!.id })
      if (res.error) { toast.error(res.error); return }
      toast.success('Contact lens created')
    }
    setShowCLForm(false); setEditingId(null); fetchData()
  }

  const handleDeleteCL = async (id: string) => {
    if (!confirm('Delete this contact lens?')) return
    const res = await window.electronAPI.deleteContactLens(id)
    if (res.error) { toast.error(res.error); return }
    toast.success('Contact lens deleted'); fetchData()
  }

  const handleFrameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!frameForm.brand) { toast.error('Brand is required'); return }
    const payload = {
      brand: frameForm.brand,
      model: frameForm.model || '',
      color: frameForm.color || '',
      size: frameForm.size || '',
      cost: parseFloat(frameForm.cost) || 0,
      sellingPrice: parseFloat(frameForm.sellingPrice) || 0,
      stock: parseInt(frameForm.stock, 10) || 0,
    }
    if (editingId) {
      const res = await window.electronAPI.updateFrame(editingId, payload)
      if (res.error) { toast.error(res.error); return }
      toast.success('Frame updated')
    } else {
      const res = await window.electronAPI.createFrame({ ...payload, userId: user!.id })
      if (res.error) { toast.error(res.error); return }
      toast.success('Frame created')
    }
    setShowFrameForm(false); setEditingId(null); fetchData()
  }

  const handleLensSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lensForm.name) { toast.error('Name is required'); return }
    const priceRanges = lensRanges
      .filter(r => r.cost !== '' && !isNaN(parseFloat(r.cost)))
      .map(r => ({
        sphMax: r.sphMax === '' ? null : parseFloat(r.sphMax),
        cylMax: r.cylMax === '' ? null : parseFloat(r.cylMax),
        cost: parseFloat(r.cost) || 0,
      }))
    const payload = {
      name: lensForm.name,
      category: lensForm.category || '',
      material: lensForm.material || '',
      index: parseFloat(lensForm.index) || 1.5,
      baseCost: parseFloat(lensForm.baseCost) || 0,
      priceRanges,
      sellingPrice: parseFloat(lensForm.sellingPrice) || 0,
      stock: parseInt(lensForm.stock, 10) || 0,
      reorderThreshold: parseInt(lensForm.reorderThreshold, 10) || 5,
      supplierName: lensForm.supplierName || '',
      supplierContact: lensForm.supplierContact || '',
    }
    if (editingId) {
      const res = await window.electronAPI.updateLensType(editingId, payload)
      if (res.error) { toast.error(res.error); return }
      toast.success('Lens type updated')
    } else {
      const res = await window.electronAPI.createLensType({ ...payload, userId: user!.id })
      if (res.error) { toast.error(res.error); return }
      toast.success('Lens type created')
    }
    setShowLensForm(false); setEditingId(null); fetchData()
  }

  const handleDeleteFrame = async (id: string) => {
    if (!confirm('Delete this frame?')) return
    const res = await window.electronAPI.deleteFrame(id)
    if (res.error) { toast.error(res.error); return }
    toast.success('Frame deleted'); fetchData()
  }

  const handleDeleteLens = async (id: string) => {
    if (!confirm('Delete this lens type?')) return
    const res = await window.electronAPI.deleteLensType(id)
    if (res.error) { toast.error(res.error); return }
    toast.success('Lens type deleted'); fetchData()
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1>{t('inventory.title')}</h1><p>{t('inventory.subtitle')}</p></div>
          <button onClick={() => {
            setEditingId(null)
            if (tab === 'frames') {
              setFrameForm({ brand: '', model: '', color: '', size: '', cost: '', sellingPrice: '', stock: '' })
              setShowFrameForm(true)
            } else if (tab === 'lensTypes') {
              setLensForm({ name: '', category: '', material: '', index: '', baseCost: '', sellingPrice: '', stock: '', reorderThreshold: '', supplierName: '', supplierContact: '' })
              setLensRanges([])
              setShowLensForm(true)
            } else {
              setClForm({ brand: '', model: '', price: '', cost: '' })
              setShowCLForm(true)
            }
          }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
            <Plus className="h-4 w-4" /> {tab === 'frames' ? t('inventory.addFrame') : tab === 'lensTypes' ? t('inventory.addLensType') : t('inventory.addContactLens')}
          </button>
        </div>
      </div>

      <div className="filter-tabs mb-4">
        <button className={`filter-tab ${tab === 'frames' ? 'active' : ''}`} onClick={() => setTab('frames')}>{t('inventory.frames')}</button>
        <button className={`filter-tab ${tab === 'lensTypes' ? 'active' : ''}`} onClick={() => setTab('lensTypes')}>{t('inventory.lensTypes')}</button>
        <button className={`filter-tab ${tab === 'contactLenses' ? 'active' : ''}`} onClick={() => setTab('contactLenses')}>{t('inventory.contactLenses')}</button>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder={t('common.search') + '...'} value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {/* Frame Form Modal */}
      {showFrameForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFrameForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? t('inventory.editFrame') : t('inventory.addFrame')}</h2>
            <form onSubmit={handleFrameSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(['brand', 'model', 'color', 'size'] as const).map(f => (
                  <div key={f}>
                    <label className="text-sm font-medium text-muted-foreground">{t(`inventory.${f}` as any)}</label>
                    <input value={(frameForm as any)[f]} onChange={e => setFrameForm(p => ({ ...p, [f]: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['cost', 'sellingPrice', 'stock'] as const).map(f => (
                  <div key={f}>
                    <label className="text-sm font-medium text-muted-foreground">{t(`inventory.${f}` as any)}</label>
                    <input type="number" step="any" min="0" value={(frameForm as any)[f]}
                      onChange={e => setFrameForm(p => ({ ...p, [f]: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowFrameForm(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{editingId ? t('common.update') : t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lens Type Form Modal */}
      {showLensForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLensForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? t('inventory.editLensType') : t('inventory.addLensType')}</h2>
            <form onSubmit={handleLensSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.name')}</label>
                  <input value={lensForm.name} onChange={e => setLensForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.category')}</label>
                  <select value={lensForm.category} onChange={e => setLensForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background">
                    <option value="">{t('inventory.selectOption')}</option>
                    {LENS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.material')}</label>
                  <select value={lensForm.material} onChange={e => setLensForm(p => ({ ...p, material: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background">
                    <option value="">{t('inventory.selectOption')}</option>
                    {LENS_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.index')}</label>
                  <select value={lensForm.index} onChange={e => setLensForm(p => ({ ...p, index: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background">
                    <option value="">{t('inventory.selectOption')}</option>
                    {LENS_INDICES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['baseCost', 'sellingPrice', 'stock'] as const).map(f => (
                  <div key={f}>
                    <label className="text-sm font-medium text-muted-foreground">{t(`inventory.${f}` as any)}</label>
                    <input type="number" step="any" min="0" value={(lensForm as any)[f]}
                      onChange={e => setLensForm(p => ({ ...p, [f]: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.supplierName')}</label>
                  <input value={lensForm.supplierName} onChange={e => setLensForm(p => ({ ...p, supplierName: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.supplierContact')}</label>
                  <input value={lensForm.supplierContact} onChange={e => setLensForm(p => ({ ...p, supplierContact: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
              </div>

              {/* Prescription cost groups — cost of this lens by sphere/cylinder */}
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">{t('inventory.priceRanges')}</label>
                  <button type="button" onClick={() => setLensRanges(p => [...p, { sphMax: '', cylMax: '', cost: '' }])}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted">
                    <Plus className="h-3 w-3" /> {t('inventory.addRange')}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{t('inventory.priceRangesHint')}</p>
                {lensRanges.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-0.5">
                      <span>{t('inventory.sphereMax')}</span><span>{t('inventory.cylinderMax')}</span><span>{t('inventory.cost')} (DA)</span><span className="w-8" />
                    </div>
                    {lensRanges.map((r, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <input type="number" step="any" placeholder="∞" value={r.sphMax}
                          onChange={e => setLensRanges(p => p.map((x, j) => j === i ? { ...x, sphMax: e.target.value } : x))}
                          className="w-full px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
                        <input type="number" step="any" placeholder="∞" value={r.cylMax}
                          onChange={e => setLensRanges(p => p.map((x, j) => j === i ? { ...x, cylMax: e.target.value } : x))}
                          className="w-full px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
                        <input type="number" step="any" min="0" placeholder="0" value={r.cost}
                          onChange={e => setLensRanges(p => p.map((x, j) => j === i ? { ...x, cost: e.target.value } : x))}
                          className="w-full px-2 py-1.5 border border-border rounded-lg text-sm bg-background" />
                        <button type="button" onClick={() => setLensRanges(p => p.filter((_, j) => j !== i))}
                          className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4 text-red-500" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowLensForm(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{editingId ? t('common.update') : t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contact Lens Form Modal */}
      {showCLForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCLForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? t('inventory.editContactLens') : t('inventory.addContactLens')}</h2>
            <form onSubmit={handleCLSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.brand')}</label>
                  <input value={clForm.brand} onChange={e => setClForm(p => ({ ...p, brand: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.model')}</label>
                  <input value={clForm.model} onChange={e => setClForm(p => ({ ...p, model: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('inventory.cost')}</label>
                  <input type="number" step="any" min="0" value={clForm.cost}
                    onChange={e => setClForm(p => ({ ...p, cost: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('common.price')}</label>
                  <input type="number" step="any" min="0" value={clForm.price}
                    onChange={e => setClForm(p => ({ ...p, price: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCLForm(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{editingId ? t('common.update') : t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="data-table-container">
        {loading ? (
          <div className="table-skeleton">
            <div className="flex items-center gap-4 px-4 py-3 bg-muted/50">
              <div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
            </div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="table-skeleton-row">
                <div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
              </div>
            ))}
          </div>
        ) : tab === 'frames' ? (
          frames.length === 0 ? (
            <div className="empty-state"><Package className="empty-state-icon" /><p className="empty-state-title">{t('inventory.noFrames')}</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>{t('inventory.brand')}</th><th>{t('inventory.model')}</th><th>{t('inventory.color')}</th><th>{t('inventory.cost')}</th><th>{t('inventory.sellingPrice')}</th><th>{t('inventory.stock')}</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {frames.map((f: any) => (
                  <tr key={f.id}>
                    <td className="font-medium">{f.brand}</td><td>{f.model || '-'}</td><td>{f.color || '-'}</td>
                    <td>{f.cost?.toLocaleString()} DA</td><td>{f.sellingPrice?.toLocaleString()} DA</td>
                    <td><span className={f.stock <= 0 ? 'text-red-500 font-medium' : f.stock <= 3 ? 'text-yellow-500 font-medium' : ''}>{f.stock}</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => {
                          setFrameForm({
                            brand: f.brand || '', model: f.model || '', color: f.color || '', size: f.size || '',
                            cost: f.cost != null ? String(f.cost) : '',
                            sellingPrice: f.sellingPrice != null ? String(f.sellingPrice) : '',
                            stock: f.stock != null ? String(f.stock) : '',
                          })
                          setEditingId(f.id); setShowFrameForm(true)
                        }} className="p-1.5 rounded-md hover:bg-muted"><Pencil className="h-4 w-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDeleteFrame(f.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : tab === 'lensTypes' ? (
          lensTypes.length === 0 ? (
            <div className="empty-state"><Package className="empty-state-icon" /><p className="empty-state-title">{t('inventory.noLensTypes')}</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>{t('inventory.name')}</th><th>{t('inventory.category')}</th><th>{t('inventory.material')}</th><th>{t('inventory.cost')}</th><th>{t('inventory.sellingPrice')}</th><th>{t('inventory.stock')}</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {lensTypes.map((l: any) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.name}</td><td>{l.category || '-'}</td><td>{l.material || '-'}</td>
                    <td>{(l.baseCost ?? l.cost)?.toLocaleString()} DA</td><td>{l.sellingPrice?.toLocaleString()} DA</td>
                    <td><span className={l.stock <= 0 ? 'text-red-500 font-medium' : l.stock <= 3 ? 'text-yellow-500 font-medium' : ''}>{l.stock}</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => {
                          setLensForm({
                            name: l.name || '', category: l.category || '', material: l.material || '',
                            index: l.index != null ? String(l.index) : '',
                            baseCost: l.baseCost != null ? String(l.baseCost) : '',
                            sellingPrice: l.sellingPrice != null ? String(l.sellingPrice) : '',
                            stock: l.stock != null ? String(l.stock) : '',
                            reorderThreshold: l.reorderThreshold != null ? String(l.reorderThreshold) : '',
                            supplierName: l.supplierName || '', supplierContact: l.supplierContact || '',
                          })
                          setLensRanges(parseRangesForForm(l.priceRanges))
                          setEditingId(l.id); setShowLensForm(true)
                        }} className="p-1.5 rounded-md hover:bg-muted"><Pencil className="h-4 w-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDeleteLens(l.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          contactLenses.length === 0 ? (
            <div className="empty-state"><Package className="empty-state-icon" /><p className="empty-state-title">{t('inventory.noContactLenses')}</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>{t('inventory.brand')}</th><th>{t('inventory.model')}</th><th>{t('inventory.cost')}</th><th>{t('common.price')}</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {contactLenses.map((c: any) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.brand}</td>
                    <td>{c.model || '-'}</td>
                    <td>{(c.cost ?? 0).toLocaleString()} DA</td>
                    <td>{c.price?.toLocaleString()} DA</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => {
                          setClForm({
                            brand: c.brand || '',
                            model: c.model || '',
                            price: c.price != null ? String(c.price) : '',
                            cost: c.cost != null ? String(c.cost) : '',
                          })
                          setEditingId(c.id); setShowCLForm(true)
                        }} className="p-1.5 rounded-md hover:bg-muted"><Pencil className="h-4 w-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDeleteCL(c.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  )
}
