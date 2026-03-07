import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { Plus, Search, Receipt, Trash2 } from 'lucide-react'

const EXPENSE_CATEGORIES = ['Worker Payment', 'Supplies', 'Maintenance', 'Other']

export default function ExpensesPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ description: '', amount: 0, category: 'Other', date: new Date().toISOString().split('T')[0] })

  useEffect(() => { fetchExpenses() }, [page, search])

  const fetchExpenses = async () => {
    if (!user?.id) return
    setLoading(true)
    const result = await window.electronAPI.getExpenses({ userId: user.id, page, limit: 15, search })
    if (result.data) {
      setExpenses(result.data.expenses || [])
      setTotalPages(result.data.pagination?.pages || 1)
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description || !form.amount) { toast.error('Description and amount are required'); return }
    const result = await window.electronAPI.createExpense({
      ...form, userId: user!.id, amount: Number(form.amount),
      date: new Date(form.date).toISOString(),
    })
    if (result.error) { toast.error(result.error); return }
    toast.success('Expense added')
    setShowForm(false)
    setForm({ description: '', amount: 0, category: 'Other', date: new Date().toISOString().split('T')[0] })
    fetchExpenses()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    const result = await window.electronAPI.deleteExpense(id)
    if (result.error) { toast.error(result.error); return }
    toast.success('Expense deleted')
    fetchExpenses()
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1>{t('expenses.title')}</h1><p>{t('expenses.subtitle')}</p></div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
            <Plus className="h-4 w-4" /> {t('expenses.addExpense')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder={t('common.search') + '...'} value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{t('expenses.addExpense')}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('expenses.description')} *</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('common.amount')} *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('expenses.category')}</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background">
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('common.date')}</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
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
        ) : expenses.length === 0 ? (
          <div className="empty-state"><Receipt className="empty-state-icon" /><p className="empty-state-title">{t('expenses.noExpenses')}</p></div>
        ) : (
          <>
            <table className="data-table">
              <thead><tr><th>{t('expenses.description')}</th><th>{t('common.amount')}</th><th>{t('expenses.category')}</th><th>{t('common.date')}</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {expenses.map((exp: any) => (
                  <tr key={exp.id}>
                    <td className="font-medium">{exp.description}</td>
                    <td className="text-red-500 font-medium">{exp.amount?.toLocaleString()} DA</td>
                    <td><span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700">{exp.category}</span></td>
                    <td>{exp.date ? new Date(exp.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td>
                      <button onClick={() => handleDelete(exp.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4 text-red-500" /></button>
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
