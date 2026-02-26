import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, Users } from 'lucide-react'

export default function CustomersPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', address: '' })

  useEffect(() => { fetchCustomers() }, [search])

  const fetchCustomers = async () => {
    if (!user?.id) return
    setLoading(true)
    const result = await window.electronAPI.getCustomers({ userId: user.id, query: search, limit: 100 })
    if (result.data) setCustomers(result.data)
    setLoading(false)
  }

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', address: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName) { toast.error('First name and last name are required'); return }

    if (editingId) {
      const result = await window.electronAPI.updateCustomer(editingId, form)
      if (result.error) { toast.error(result.error); return }
      toast.success('Customer updated')
    } else {
      const result = await window.electronAPI.createCustomer({ ...form, userId: user!.id })
      if (result.error) { toast.error(result.error); return }
      toast.success('Customer created')
    }
    resetForm()
    fetchCustomers()
  }

  const handleEdit = (c: any) => {
    setForm({ firstName: c.firstName, lastName: c.lastName, phone: c.phone || '', email: c.email || '', dateOfBirth: c.dateOfBirth || '', address: c.address || '' })
    setEditingId(c.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('customers.deleteConfirm'))) return
    const result = await window.electronAPI.deleteCustomer(id)
    if (result.error) { toast.error(result.error); return }
    toast.success('Customer deleted')
    fetchCustomers()
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>{t('customers.title')}</h1>
            <p>{t('customers.subtitle')}</p>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
            <Plus className="h-4 w-4" /> {t('customers.addCustomer')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="toolbar">
        <div className="toolbar-search">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder={t('customers.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {/* Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => resetForm()}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? t('common.edit') : t('common.add')} {t('common.customer')}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('common.firstName')} *</label>
                  <input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('common.lastName')} *</label>
                  <input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('common.phone')}</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('common.email')}</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">{editingId ? t('common.update') : t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="data-table-container">
        {loading ? (
          <div className="table-skeleton">
            <div className="flex items-center gap-4 px-4 py-3 bg-muted/50">
              <div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell xl" /><div className="table-skeleton-cell sm" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="table-skeleton-row">
                <div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell xl" /><div className="table-skeleton-cell sm" />
              </div>
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">{t('customers.noCustomers')}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('customers.name')}</th>
                <th>{t('common.phone')}</th>
                <th>{t('common.email')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td className="font-medium">{c.firstName} {c.lastName}</td>
                  <td>{c.phone || '-'}</td>
                  <td>{c.email || '-'}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(c)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title={t('common.edit')}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors" title={t('common.delete')}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
