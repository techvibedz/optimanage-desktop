import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { Plus, Search, FileText, Trash2 } from 'lucide-react'

export default function PrescriptionsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [form, setForm] = useState({
    customerId: '', doctor: '', examinationDate: '', expirationDate: '',
    vlOdSphere: '', vlOdCylinder: '', vlOdAxis: '', vlOdAdd: '',
    vlOsSphere: '', vlOsCylinder: '', vlOsAxis: '', vlOsAdd: '',
    vpOdSphere: '', vpOdCylinder: '', vpOdAxis: '', vpOdAdd: '',
    vpOsSphere: '', vpOsCylinder: '', vpOsAxis: '', vpOsAdd: '',
    pdRight: '', pdLeft: '', notes: '',
  })

  useEffect(() => { fetchPrescriptions() }, [page])

  const fetchPrescriptions = async () => {
    if (!user?.id) return
    setLoading(true)
    const result = await window.electronAPI.getPrescriptions({ userId: user.id, page, limit: 10 })
    if (result.data) {
      setPrescriptions(result.data.prescriptions || [])
      setTotalPages(result.data.pagination?.pages || 1)
    }
    setLoading(false)
  }

  const handleNew = async () => {
    const custRes = await window.electronAPI.getCustomers({ userId: user!.id, limit: 200 })
    if (custRes.data) setCustomers(custRes.data)
    setForm({
      customerId: '', doctor: '', examinationDate: new Date().toISOString().split('T')[0], expirationDate: '',
      vlOdSphere: '', vlOdCylinder: '', vlOdAxis: '', vlOdAdd: '',
      vlOsSphere: '', vlOsCylinder: '', vlOsAxis: '', vlOsAdd: '',
      vpOdSphere: '', vpOdCylinder: '', vpOdAxis: '', vpOdAdd: '',
      vpOsSphere: '', vpOsCylinder: '', vpOsAxis: '', vpOsAdd: '',
      pdRight: '', pdLeft: '', notes: '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customerId) { toast.error('Please select a customer'); return }
    const payload: any = { customerId: form.customerId, doctor: form.doctor, notes: form.notes }
    if (form.examinationDate) payload.examinationDate = new Date(form.examinationDate).toISOString()
    if (form.expirationDate) payload.expirationDate = new Date(form.expirationDate).toISOString()
    const numFields = ['vlOdSphere','vlOdCylinder','vlOdAxis','vlOdAdd','vlOsSphere','vlOsCylinder','vlOsAxis','vlOsAdd',
      'vpOdSphere','vpOdCylinder','vpOdAxis','vpOdAdd','vpOsSphere','vpOsCylinder','vpOsAxis','vpOsAdd','pdRight','pdLeft'] as const
    numFields.forEach(f => { if ((form as any)[f]) payload[f] = parseFloat((form as any)[f]) })

    const result = await window.electronAPI.createPrescription(payload)
    if (result.error) { toast.error(result.error); return }
    toast.success('Prescription created')
    setShowForm(false)
    fetchPrescriptions()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prescription?')) return
    const result = await window.electronAPI.deletePrescription(id)
    if (result.error) { toast.error(result.error); return }
    toast.success('Prescription deleted')
    fetchPrescriptions()
  }

  const renderVisionInput = (label: string, prefix: string) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">{label}</h4>
      <div className="grid grid-cols-4 gap-2">
        {['Sphere', 'Cylinder', 'Axis', 'Add'].map(field => {
          const key = `${prefix}${field}` as keyof typeof form
          return (
            <div key={key}>
              <label className="text-xs text-muted-foreground">{field}</label>
              <input type="number" step="0.25" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background" />
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1>{t('prescriptions.title')}</h1><p>{t('prescriptions.subtitle')}</p></div>
          <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
            <Plus className="h-4 w-4" /> {t('prescriptions.addPrescription')}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{t('prescriptions.addPrescription')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('common.customer')} *</label>
                  <select value={form.customerId} onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background">
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('prescriptions.doctor')}</label>
                  <input value={form.doctor} onChange={e => setForm(p => ({ ...p, doctor: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('prescriptions.examinationDate')}</label>
                  <input type="date" value={form.examinationDate} onChange={e => setForm(p => ({ ...p, examinationDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm border-b pb-1">{t('prescriptions.distanceVision')}</h3>
                  {renderVisionInput(t('prescriptions.rightEye'), 'vlOd')}
                  {renderVisionInput(t('prescriptions.leftEye'), 'vlOs')}
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm border-b pb-1">{t('prescriptions.nearVision')}</h3>
                  {renderVisionInput(t('prescriptions.rightEye'), 'vpOd')}
                  {renderVisionInput(t('prescriptions.leftEye'), 'vpOs')}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">PD Right</label>
                  <input type="number" step="0.5" value={form.pdRight} onChange={e => setForm(p => ({ ...p, pdRight: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">PD Left</label>
                  <input type="number" step="0.5" value={form.pdLeft} onChange={e => setForm(p => ({ ...p, pdLeft: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="data-table-container">
        {loading ? (
          <div className="table-skeleton">
            <div className="flex items-center gap-4 px-4 py-3 bg-muted/50">
              <div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="table-skeleton-row">
                <div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
              </div>
            ))}
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="empty-state"><FileText className="empty-state-icon" /><p className="empty-state-title">{t('prescriptions.noPrescriptions')}</p></div>
        ) : (
          <>
            <table className="data-table">
              <thead><tr><th>{t('common.customer')}</th><th>{t('prescriptions.doctor')}</th><th>{t('prescriptions.examinationDate')}</th><th>VL OD</th><th>VL OS</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {prescriptions.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.customer ? `${p.customer.firstName} ${p.customer.lastName}` : '-'}</td>
                    <td>{p.doctor || '-'}</td>
                    <td>{p.examinationDate ? new Date(p.examinationDate).toLocaleDateString() : '-'}</td>
                    <td className="text-xs">{p.vlOdSphere || '-'}/{p.vlOdCylinder || '-'}x{p.vlOdAxis || '-'}</td>
                    <td className="text-xs">{p.vlOsSphere || '-'}/{p.vlOsCylinder || '-'}x{p.vlOsAxis || '-'}</td>
                    <td>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30" title={t('common.delete')}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <div className="pagination-info">{t('common.pageXofY', { page, total: totalPages })}</div>
              <div className="pagination-buttons">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="pagination-btn">{t('common.previous')}</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="pagination-btn">{t('common.next')}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
