import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { Plus, Search, Package, Pencil, Trash2 } from 'lucide-react'

export default function InventoryPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<'frames' | 'lensTypes'>('frames')
  const [frames, setFrames] = useState<any[]>([])
  const [lensTypes, setLensTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showFrameForm, setShowFrameForm] = useState(false)
  const [showLensForm, setShowLensForm] = useState(false)
  const [frameForm, setFrameForm] = useState({ brand: '', model: '', color: '', size: '', cost: 0, sellingPrice: 0, stock: 0, supplier: '' })
  const [lensForm, setLensForm] = useState({ name: '', category: '', material: '', index: '', cost: 0, sellingPrice: 0, stock: 0 })
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [tab, search])

  const fetchData = async () => {
    if (!user?.id) return
    setLoading(true)
    if (tab === 'frames') {
      const res = await window.electronAPI.getFrames({ userId: user.id, query: search })
      if (res.data) setFrames(res.data)
    } else {
      const res = await window.electronAPI.getLensTypes({ userId: user.id, search })
      if (res.data) setLensTypes(res.data)
    }
    setLoading(false)
  }

  const handleFrameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!frameForm.brand) { toast.error('Brand is required'); return }
    if (editingId) {
      const res = await window.electronAPI.updateFrame(editingId, frameForm)
      if (res.error) { toast.error(res.error); return }
      toast.success('Frame updated')
    } else {
      const res = await window.electronAPI.createFrame({ ...frameForm, userId: user!.id })
      if (res.error) { toast.error(res.error); return }
      toast.success('Frame created')
    }
    setShowFrameForm(false); setEditingId(null); fetchData()
  }

  const handleLensSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lensForm.name) { toast.error('Name is required'); return }
    if (editingId) {
      const res = await window.electronAPI.updateLensType(editingId, lensForm)
      if (res.error) { toast.error(res.error); return }
      toast.success('Lens type updated')
    } else {
      const res = await window.electronAPI.createLensType({ ...lensForm, userId: user!.id })
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
          <button onClick={() => { setEditingId(null); tab === 'frames' ? setShowFrameForm(true) : setShowLensForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
            <Plus className="h-4 w-4" /> {tab === 'frames' ? t('inventory.addFrame') : t('inventory.addLensType')}
          </button>
        </div>
      </div>

      <div className="filter-tabs mb-4">
        <button className={`filter-tab ${tab === 'frames' ? 'active' : ''}`} onClick={() => setTab('frames')}>{t('inventory.frames')}</button>
        <button className={`filter-tab ${tab === 'lensTypes' ? 'active' : ''}`} onClick={() => setTab('lensTypes')}>{t('inventory.lensTypes')}</button>
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
            <h2 className="text-lg font-semibold mb-4">{editingId ? t('common.edit') : t('common.add')} Frame</h2>
            <form onSubmit={handleFrameSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(['brand', 'model', 'color', 'size', 'supplier'] as const).map(f => (
                  <div key={f}>
                    <label className="text-sm font-medium text-muted-foreground capitalize">{t(`inventory.${f}` as any) || f}</label>
                    <input value={(frameForm as any)[f]} onChange={e => setFrameForm(p => ({ ...p, [f]: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['cost', 'sellingPrice', 'stock'] as const).map(f => (
                  <div key={f}>
                    <label className="text-sm font-medium text-muted-foreground">{t(`inventory.${f}` as any)}</label>
                    <input type="number" value={(frameForm as any)[f]} onChange={e => setFrameForm(p => ({ ...p, [f]: Number(e.target.value) }))}
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
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? t('common.edit') : t('common.add')} Lens Type</h2>
            <form onSubmit={handleLensSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(['name', 'category', 'material', 'index'] as const).map(f => (
                  <div key={f}>
                    <label className="text-sm font-medium text-muted-foreground capitalize">{t(`inventory.${f}` as any) || f}</label>
                    <input value={(lensForm as any)[f]} onChange={e => setLensForm(p => ({ ...p, [f]: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['cost', 'sellingPrice', 'stock'] as const).map(f => (
                  <div key={f}>
                    <label className="text-sm font-medium text-muted-foreground">{t(`inventory.${f}` as any)}</label>
                    <input type="number" value={(lensForm as any)[f]} onChange={e => setLensForm(p => ({ ...p, [f]: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowLensForm(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
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
                        <button onClick={() => { setFrameForm(f); setEditingId(f.id); setShowFrameForm(true) }} className="p-1.5 rounded-md hover:bg-muted"><Pencil className="h-4 w-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDeleteFrame(f.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          lensTypes.length === 0 ? (
            <div className="empty-state"><Package className="empty-state-icon" /><p className="empty-state-title">{t('inventory.noLensTypes')}</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>{t('inventory.category')}</th><th>{t('inventory.material')}</th><th>{t('inventory.cost')}</th><th>{t('inventory.sellingPrice')}</th><th>{t('inventory.stock')}</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {lensTypes.map((l: any) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.name}</td><td>{l.category || '-'}</td><td>{l.material || '-'}</td>
                    <td>{l.cost?.toLocaleString()} DA</td><td>{l.sellingPrice?.toLocaleString()} DA</td>
                    <td><span className={l.stock <= 0 ? 'text-red-500 font-medium' : l.stock <= 3 ? 'text-yellow-500 font-medium' : ''}>{l.stock}</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setLensForm(l); setEditingId(l.id); setShowLensForm(true) }} className="p-1.5 rounded-md hover:bg-muted"><Pencil className="h-4 w-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDeleteLens(l.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4 text-red-500" /></button>
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
