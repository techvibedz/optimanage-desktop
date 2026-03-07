import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { Search, CreditCard, Trash2, Receipt, Calendar, DollarSign, Filter, Eye, Plus, Edit, Loader2 } from 'lucide-react'

export default function PaymentsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [methodFilter, setMethodFilter] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<string>('all')

  // Expenses state
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'Other', notes: '' });
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  useEffect(() => { fetchPayments() }, [page, search, methodFilter, dateFilter])
  useEffect(() => { fetchExpenses() }, [expenseDate, expenseCategoryFilter])

  const fetchPayments = async () => {
    if (!user?.id) return
    setLoading(true)
    const params: any = { userId: user.id, page, limit: 15, search }
    if (methodFilter) params.paymentMethod = methodFilter

    // Date filtering
    const now = new Date()
    if (dateFilter === 'today') {
      params.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      params.endDate = now.toISOString()
    } else if (dateFilter === 'week') {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      weekStart.setHours(0, 0, 0, 0)
      params.startDate = weekStart.toISOString()
      params.endDate = now.toISOString()
    } else if (dateFilter === 'month') {
      params.startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      params.endDate = now.toISOString()
    }

    const result = await window.electronAPI.getPayments(params)
    if (result.data) {
      setPayments(result.data.payments || [])
      setTotalPages(result.data.pagination?.pages || 1)
    }
    setLoading(false)
  }

  const fetchExpenses = async () => {
    setExpensesLoading(true);
    try {
      const result = await window.electronAPI.getExpenses({
        userId: user?.id,
        date: expenseDate,
        category: expenseCategoryFilter === 'all' ? undefined : expenseCategoryFilter,
        limit: 50,
      });
      setExpenses(result.data?.expenses || result.data || []);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    } finally {
      setExpensesLoading(false);
    }
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount || Number(expenseForm.amount) <= 0) {
      toast.error(t('expenses.description') + ' & ' + t('expenses.amount') + ' required');
      return;
    }
    setIsSavingExpense(true);
    try {
      if (editingExpense) {
        const result = await window.electronAPI.updateExpense(editingExpense.id, {
          description: expenseForm.description,
          amount: Number(expenseForm.amount),
          category: expenseForm.category,
          notes: expenseForm.notes || null,
          date: expenseDate,
        });
        if (result.error) { toast.error(result.error); return; }
        toast.success(t('expenses.updated'));
      } else {
        const result = await window.electronAPI.createExpense({
          description: expenseForm.description,
          amount: Number(expenseForm.amount),
          category: expenseForm.category,
          notes: expenseForm.notes || null,
          date: expenseDate,
          userId: user!.id,
        });
        if (result.error) { toast.error(result.error); return; }
        toast.success(t('expenses.created'));
      }
      setShowExpenseForm(false);
      setEditingExpense(null);
      setExpenseForm({ description: '', amount: '', category: 'Other', notes: '' });
      fetchExpenses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save expense');
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm(t('expenses.deleteConfirm'))) return;
    try {
      const result = await window.electronAPI.deleteExpense(id);
      if (result.error) { toast.error(result.error); return; }
      toast.success(t('expenses.deleted'));
      fetchExpenses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete expense');
    }
  };

  const handleEditExpense = (expense: any) => {
    setEditingExpense(expense);
    setExpenseForm({
      description: expense.description,
      amount: String(expense.amount),
      category: expense.category,
      notes: expense.notes || '',
    });
    setShowExpenseForm(true);
  };

  const expenseStats = useMemo(() => {
    const total = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const categories = [...new Set(expenses.map((e: any) => e.category))];
    return { total, count: expenses.length, categories: categories.length };
  }, [expenses]);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Worker Payment': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Supplies': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'Maintenance': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this payment?')) return
    const result = await window.electronAPI.deletePayment(id)
    if (result.error) { toast.error(result.error); return }
    toast.success('Payment deleted')
    fetchPayments()
  }

  // Stats computed from current page — expenses subtract from revenue
  const stats = useMemo(() => {
    const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
    const todayStr = new Date().toDateString()
    const todayPayments = payments.filter(p => {
      if (!p.paymentDate) return false
      return new Date(p.paymentDate).toDateString() === todayStr
    })
    const todayPayTotal = todayPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
    const todayExpenses = expenses.filter((e: any) => {
      if (!e.date) return false
      return new Date(e.date).toDateString() === todayStr
    }).reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
    return {
      count: payments.length,
      total: totalPayments - totalExpenses,
      todayCount: todayPayments.length,
      todayTotal: todayPayTotal - todayExpenses,
    }
  }, [payments, expenses])

  const getMethodBadgeClass = (method: string) => {
    switch (method?.toLowerCase()) {
      case 'cash': return 'bg-green-100 text-green-700 border-green-200'
      case 'card': case 'credit_card': case 'debit_card': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'check': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'bank_transfer': return 'bg-purple-100 text-purple-700 border-purple-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1>{t('payments.title')}</h1><p>{t('payments.subtitle')}</p></div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{t('payments.totalPayments') || 'Total Payments'}</span>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.count}</p>
        </div>
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{t('payments.totalRevenue') || 'Total Revenue'}</span>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.total.toLocaleString()} DA</p>
        </div>
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{t('payments.todayPayments') || 'Today'}</span>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.todayCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{t('payments.todayRevenue') || "Today's Revenue"}</span>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.todayTotal.toLocaleString()} DA</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-4 mb-5">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder={t('payments.searchPlaceholder')} value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {/* Method Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {[
              { value: '', label: t('common.all') || 'All' },
              { value: 'cash', label: t('payments.cash') || 'Cash' },
              { value: 'card', label: t('payments.card') || 'Card' },
              { value: 'check', label: t('payments.check') || 'Check' },
            ].map(m => (
              <button key={m.value} onClick={() => { setMethodFilter(m.value); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${methodFilter === m.value
                  ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <select value={dateFilter} onChange={e => { setDateFilter(e.target.value); setPage(1) }}
              className="px-3 py-1.5 border border-border rounded-lg text-xs bg-background focus:outline-none">
              <option value="all">{t('common.allTime') || 'All Time'}</option>
              <option value="today">{t('common.today') || 'Today'}</option>
              <option value="week">{t('common.thisWeek') || 'This Week'}</option>
              <option value="month">{t('common.thisMonth') || 'This Month'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="data-table-container">
        {loading ? (
          <div className="table-skeleton">
            <div className="flex items-center gap-4 px-4 py-3 bg-muted/50">
              <div className="table-skeleton-cell sm" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
            </div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="table-skeleton-row">
                <div className="table-skeleton-cell sm" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
              </div>
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="empty-state"><CreditCard className="empty-state-icon" /><p className="empty-state-title">{t('payments.noPayments')}</p></div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('payments.receiptNumber')}</th>
                  <th>{t('payments.orderNumber') || 'Order'}</th>
                  <th>{t('common.customer')}</th>
                  <th>{t('common.amount')}</th>
                  <th>{t('payments.paymentMethod')}</th>
                  <th>{t('payments.paymentDate')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs">{p.receiptNumber || '-'}</td>
                    <td>
                      {p.order ? (
                        <button onClick={() => navigate(`/orders/${p.order.id}`)}
                          className="text-primary hover:underline font-medium text-sm">
                          {p.order.orderNumber}
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">{t('nav.quickSale') || 'Quick Sale'}</span>
                      )}
                    </td>
                    <td>
                      {p.order?.customer ? (
                        <span className="font-medium">{p.order.customer.firstName} {p.order.customer.lastName}</span>
                      ) : '-'}
                    </td>
                    <td className="font-semibold">{p.amount?.toLocaleString()} DA</td>
                    <td>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${getMethodBadgeClass(p.paymentMethod)}`}>
                        {p.paymentMethod || '-'}
                      </span>
                    </td>
                    <td>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        {p.order && (
                          <button onClick={() => navigate(`/orders/${p.order.id}`)} className="p-1.5 rounded-md hover:bg-primary/10" title="View Order">
                            <Eye className="h-4 w-4 text-primary" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </button>
                      </div>
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

      {/* Expenses Section */}
      <div className="mt-8">
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t('expenses.dailyTracker')}</h2>
            <button onClick={() => { setEditingExpense(null); setExpenseForm({ description: '', amount: '', category: 'Other', notes: '' }); setShowExpenseForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
              <Plus className="h-4 w-4" /> {t('expenses.addExpense')}
            </button>
          </div>

          {/* Expense Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{t('expenses.totalDaily')}</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{expenseStats.total.toLocaleString()} DA</p>
              <p className="text-xs text-red-500 dark:text-red-400">{expenseStats.count} {t('expenses.title').toLowerCase()}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <p className="text-sm text-blue-600 dark:text-blue-400">{t('expenses.expenseDate')}</p>
              <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                className="mt-1 px-2 py-1 border border-border rounded text-sm bg-background" />
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/20 p-3 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('expenses.activeCategories')}</p>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{expenseStats.categories} {t('expenses.active')}</p>
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select value={expenseCategoryFilter} onChange={e => setExpenseCategoryFilter(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm bg-background">
              <option value="all">{t('common.all')}</option>
              <option value="Worker Payment">{t('expenses.workerPayment')}</option>
              <option value="Supplies">{t('expenses.supplies')}</option>
              <option value="Maintenance">{t('expenses.maintenance')}</option>
              <option value="Other">{t('expenses.other')}</option>
            </select>
          </div>

          {/* Expenses Table */}
          {expensesLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t('expenses.noExpensesForDate')}</p>
              <button onClick={() => { setEditingExpense(null); setExpenseForm({ description: '', amount: '', category: 'Other', notes: '' }); setShowExpenseForm(true); }}
                className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">
                <Plus className="h-4 w-4" /> {t('expenses.addFirstExpense')}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('expenses.description')}</th>
                    <th>{t('common.category')}</th>
                    <th>{t('expenses.amount')}</th>
                    <th>{t('expenses.notes')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense: any) => (
                    <tr key={expense.id}>
                      <td className="font-medium">{expense.description}</td>
                      <td>
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${getCategoryColor(expense.category)}`}>
                          {expense.category === 'Worker Payment' ? t('expenses.workerPayment')
                            : expense.category === 'Supplies' ? t('expenses.supplies')
                            : expense.category === 'Maintenance' ? t('expenses.maintenance')
                            : t('expenses.other')}
                        </span>
                      </td>
                      <td className="font-semibold text-red-600 dark:text-red-400">{expense.amount?.toLocaleString()} DA</td>
                      <td className="max-w-xs truncate text-muted-foreground">{expense.notes || '-'}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEditExpense(expense)} className="p-1.5 rounded-md hover:bg-primary/10">
                            <Edit className="h-4 w-4 text-primary" />
                          </button>
                          <button onClick={() => handleDeleteExpense(expense.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editingExpense ? t('common.edit') + ' ' + t('expenses.title') : t('expenses.addExpense')}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{t('expenses.description')}</label>
                <input type="text" value={expenseForm.description}
                  onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('expenses.amount')}</label>
                <input type="number" value={expenseForm.amount}
                  onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" placeholder="0" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('common.category')}</label>
                <select value={expenseForm.category}
                  onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background">
                  <option value="Worker Payment">{t('expenses.workerPayment')}</option>
                  <option value="Supplies">{t('expenses.supplies')}</option>
                  <option value="Maintenance">{t('expenses.maintenance')}</option>
                  <option value="Other">{t('expenses.other')}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('expenses.notes')}</label>
                <textarea value={expenseForm.notes}
                  onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background min-h-[60px]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowExpenseForm(false); setEditingExpense(null); }}
                className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">{t('common.cancel')}</button>
              <button onClick={handleSaveExpense} disabled={isSavingExpense}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {isSavingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingExpense ? t('common.update') : t('common.create'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
