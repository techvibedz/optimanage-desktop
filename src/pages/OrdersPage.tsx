import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { Plus, Search, ShoppingCart, Eye, Pencil, Trash2 } from 'lucide-react'

export default function OrdersPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const fetchIdRef = useRef(0)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => { fetchOrders() }, [page, debouncedSearch, statusFilter])

  const fetchOrders = async () => {
    if (!user?.id) return
    const fetchId = ++fetchIdRef.current
    setLoading(true)
    const result = await window.electronAPI.getOrders({
      userId: user.id, page, limit: 10, search: debouncedSearch, status: statusFilter,
    })
    if (fetchId !== fetchIdRef.current) return
    if (result.data) {
      setOrders(result.data.orders || [])
      setTotalPages(result.data.pagination?.pages || 1)
    }
    setLoading(false)
  }

  const handleNewOrder = () => {
    navigate('/orders/new')
  }

  const handleStatusChange = async (id: string, status: string) => {
    const result = await window.electronAPI.updateOrder(id, { status })
    if (result.error) { toast.error(result.error); return }
    toast.success('Status updated')
    fetchOrders()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return
    const result = await window.electronAPI.deleteOrder(id)
    if (result.error) { toast.error(result.error); return }
    toast.success('Order deleted')
    fetchOrders()
  }

  const getStatusClass = (status: string) => {
    const s = status?.toLowerCase().replace(/\s+/g, '_')
    return `status-badge ${s}`
  }

  const getPaymentStatus = (order: any) => {
    const balance = order.balanceDue ?? 0
    const total = order.totalPrice ?? 0
    if (balance <= 0.01) return 'paid'
    if (balance < total) return 'partial'
    return 'unpaid'
  }

  const getPaymentBadge = (order: any) => {
    const ps = getPaymentStatus(order)
    switch (ps) {
      case 'paid': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('orders.paid')}</span>
      case 'partial': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">{t('orders.partial')}</span>
      case 'unpaid': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{t('orders.unpaid')}</span>
      default: return null
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1>{t('orders.title')}</h1>
            <p>{t('orders.subtitle')}</p>
          </div>
          <button onClick={handleNewOrder} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
            <Plus className="h-4 w-4" /> {t('orders.createOrder')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="toolbar">
        <div className="toolbar-search">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder={t('orders.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="toolbar-actions">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-border rounded-lg text-sm focus:outline-none">
            <option value="">{t('common.all')}</option>
            <option value="pending">{t('orders.pending')}</option>
            <option value="in_progress">{t('orders.in_progress')}</option>
            <option value="ready">{t('orders.ready')}</option>
            <option value="completed">{t('orders.completed')}</option>
            <option value="delivered">{t('orders.delivered')}</option>
            <option value="cancelled">{t('orders.cancelled')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="data-table-container">
        {loading ? (
          <div className="table-skeleton">
            <div className="flex items-center gap-4 px-4 py-3 bg-muted/50">
              <div className="table-skeleton-cell md" /><div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
            </div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="table-skeleton-row">
                <div className="table-skeleton-cell md" /><div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <ShoppingCart className="empty-state-icon" />
            <p className="empty-state-title">{t('orders.noOrders')}</p>
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('orders.orderNumber')}</th>
                  <th>{t('common.customer')}</th>
                  <th>{t('orders.totalPrice')}</th>
                  <th>{t('orders.balanceDue')}</th>
                  <th>{t('orders.paymentStatus')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="cursor-pointer hover:bg-primary/5 transition-colors">
                    <td className="font-medium text-primary">{o.orderNumber || '-'}</td>
                    <td>{o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : '-'}</td>
                    <td>{o.totalPrice?.toLocaleString()} DA</td>
                    <td className={o.balanceDue > 0 ? 'text-red-500 font-medium' : 'text-green-500'}>{o.balanceDue?.toLocaleString()} DA</td>
                    <td>
                      {getPaymentBadge(o)}
                    </td>
                    <td>{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => navigate(`/orders/${o.id}`)} className="p-1.5 rounded-md hover:bg-primary/10" title={t('common.view') || 'View'}>
                          <Eye className="h-4 w-4 text-primary" />
                        </button>
                        <button onClick={() => handleDelete(o.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30" title={t('common.delete')}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination */}
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
