import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign, ShoppingCart, Users, RefreshCw, Package, Zap, Eye, EyeOff,
  TrendingUp, TrendingDown, Minus, ArrowRight, FileText, CreditCard, BarChart3, CalendarDays,
  Clock, UserPlus, Receipt
} from 'lucide-react'
import { useTranslation } from '@/lib/use-translation'
import { useAuth } from '@/lib/auth-context'

interface DashboardStats {
  totalCustomers: number
  ordersThisMonth: number
  totalPrescriptions: number
  totalRevenue: number
  totalPayments: number
  lastUpdated: string
  customerGrowth: number
  orderGrowth: number
  prescriptionGrowth: number
  revenueGrowth: number
  paymentMethodBreakdown: Array<{ method: string; amount: number; percentage: number }>
  revenueAnalytics: { deposits: number; payments: number; outstanding: number; collectionRate: number }
}

const defaultStats: DashboardStats = {
  totalCustomers: 0, ordersThisMonth: 0, totalPrescriptions: 0,
  totalRevenue: 0, totalPayments: 0, lastUpdated: '',
  customerGrowth: 0, orderGrowth: 0, prescriptionGrowth: 0, revenueGrowth: 0,
  paymentMethodBreakdown: [],
  revenueAnalytics: { deposits: 0, payments: 0, outstanding: 0, collectionRate: 0 },
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats>(defaultStats)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPriceStats, setShowPriceStats] = useState(() => {
    const saved = localStorage.getItem('dashboard_show_prices')
    return saved !== null ? saved === 'true' : true
  })
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])

  useEffect(() => { fetchStats(activeFilter); fetchRecentData() }, [])

  const fetchRecentData = async () => {
    if (!user?.id) return
    try {
      const [ordersRes, activityRes] = await Promise.all([
        window.electronAPI.getOrders({ userId: user.id, page: 1, limit: 5 }),
        window.electronAPI.getRecentActivity({ userId: user.id, limit: 8 }),
      ])
      if (ordersRes.data) setRecentOrders(ordersRes.data.orders || ordersRes.data)
      if (activityRes.data) setActivities(activityRes.data)
    } catch (err) { console.error('Error fetching recent data:', err) }
  }

  const fetchStats = async (filter: string, startDate?: string, endDate?: string) => {
    if (!user?.id) return
    setLoading(true)
    try {
      const result = await window.electronAPI.getDashboardStats({ userId: user.id, filter, startDate, endDate })
      if (result.data) {
        setStats({ ...defaultStats, ...result.data })
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (filter: 'all' | 'today' | 'week' | 'month' | 'custom') => {
    setActiveFilter(filter)
    if (filter === 'custom') {
      setShowDatePicker(true)
      if (customStart && customEnd) fetchStats('custom', customStart, customEnd)
    } else {
      setShowDatePicker(false)
      fetchStats(filter)
    }
  }

  const handleCustomDateApply = () => {
    if (customStart && customEnd) {
      fetchStats('custom', customStart, customEnd)
    }
  }

  const handlePriceToggle = () => {
    const newVal = !showPriceStats
    setShowPriceStats(newVal)
    localStorage.setItem('dashboard_show_prices', String(newVal))
  }

  const fmtAmount = (n: number) => showPriceStats ? `${n.toLocaleString()} DA` : '••••'

  const GrowthBadge = ({ value }: { value: number }) => {
    if (value === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</span>
    return value > 0
      ? <span className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400 font-medium"><TrendingUp className="h-3 w-3" />+{value}%</span>
      : <span className="inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400 font-medium"><TrendingDown className="h-3 w-3" />{value}%</span>
  }

  const greeting = () => {
    const h = new Date().getHours()
    const name = user?.name || user?.email?.split('@')[0] || ''
    if (h < 12) return `${t('dashboard.goodMorning') || 'Good morning'}, ${name}`
    if (h < 18) return `${t('dashboard.goodAfternoon') || 'Good afternoon'}, ${name}`
    return `${t('dashboard.goodEvening') || 'Good evening'}, ${name}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{greeting()}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePriceToggle}
            className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-border/50 hover:bg-muted transition-all" title={showPriceStats ? 'Hide amounts' : 'Show amounts'}>
            {showPriceStats ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button onClick={() => fetchStats(activeFilter)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-border/50 hover:bg-muted transition-all text-sm font-medium ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('dashboard.refreshData') || 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex gap-1 bg-white/60 dark:bg-gray-800/60 rounded-xl p-1 border border-border/50">
          {(['today', 'week', 'month', 'all', 'custom'] as const).map(f => (
            <button key={f}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeFilter === f
                ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-gray-700'}`}
              onClick={() => handleFilterChange(f)}>
              {f === 'custom' ? (
                <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{t('dashboard.custom')}</span>
              ) : t(`dashboard.${f === 'week' ? 'thisWeek' : f === 'month' ? 'thisMonth' : f === 'all' ? 'allTime' : 'today'}`)}
            </button>
          ))}
        </div>
        {showDatePicker && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-white dark:bg-gray-800 text-sm" />
            <span className="text-muted-foreground text-sm">→</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-white dark:bg-gray-800 text-sm" />
            <button onClick={handleCustomDateApply}
              disabled={!customStart || !customEnd}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none">
              {t('common.confirm')}
            </button>
          </div>
        )}
      </div>

      {/* Stats Grid — 4 columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Customers */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-border/50 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <GrowthBadge value={stats.customerGrowth} />
          </div>
          <p className="text-2xl font-bold">{loading ? '—' : stats.totalCustomers.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('dashboard.totalCustomers')}</p>
        </div>

        {/* Orders */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-border/50 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <GrowthBadge value={stats.orderGrowth} />
          </div>
          <p className="text-2xl font-bold">{loading ? '—' : stats.ordersThisMonth}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {activeFilter === 'today' ? t('dashboard.ordersToday') :
             activeFilter === 'week' ? t('dashboard.ordersThisWeek') :
             activeFilter === 'month' ? t('dashboard.ordersThisMonth') :
             t('dashboard.ordersAllTime')}
          </p>
        </div>

        {/* Revenue (payments - expenses) */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-border/50 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <GrowthBadge value={stats.revenueGrowth} />
          </div>
          <p className="text-2xl font-bold">{loading ? '—' : fmtAmount(stats.totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('dashboard.totalRevenue') || 'Revenue'}</p>
        </div>

        {/* Collection Rate */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-border/50 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <p className="text-2xl font-bold">{loading ? '—' : `${stats.revenueAnalytics.collectionRate}%`}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('dashboard.collectionRate') || 'Collection Rate'}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">{t('dashboard.quickActions')}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: '/customers', icon: Users, color: 'blue', title: t('dashboard.addCustomer'), desc: t('dashboard.createCustomerDesc') },
            { to: '/orders/new', icon: ShoppingCart, color: 'green', title: t('dashboard.createOrder'), desc: t('dashboard.createOrderDesc') },
            { to: '/quick-sale', icon: Zap, color: 'orange', title: t('dashboard.quickSale'), desc: t('dashboard.quickSaleDesc') },
            { to: '/inventory', icon: Package, color: 'purple', title: t('dashboard.addInventory'), desc: t('dashboard.addInventoryDesc') },
          ].map((action, i) => (
            <Link key={i} to={action.to}
              className="group bg-white dark:bg-gray-800/50 rounded-2xl p-4 border border-border/50 hover:border-primary/30 hover:shadow-md transition-all no-underline block">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${
                action.color === 'blue' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                action.color === 'green' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                action.color === 'orange' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
              }`}>
                <action.icon className="h-4 w-4" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{action.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      </div>
      {/* Bottom Grid: Recent Orders + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Orders */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-border/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.recentOrders') || 'Commandes récentes'}
            </h2>
            <Link to="/orders" className="text-xs text-primary hover:underline flex items-center gap-1">
              {t('common.viewAll') || 'Voir tout'} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('dashboard.noOrders') || 'Aucune commande'}</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order: any, i: number) => {
                const statusColors: Record<string, string> = {
                  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                  delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                }
                const statusLabel = order.status?.replace('_', ' ') || 'pending'
                return (
                  <Link key={order.id || i} to={`/orders`}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors no-underline group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {order.orderNumber || `#${String(i + 1).padStart(3, '0')}`}
                          <span className="text-muted-foreground font-normal ml-2">
                            {`${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || '—'}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColors[order.status] || statusColors.pending}`}>
                        {statusLabel}
                      </span>
                      <span className="text-sm font-semibold">{fmtAmount(order.totalPrice || 0)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-border/50 p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {t('dashboard.recentActivity') || 'Activité récente'}
          </h2>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('dashboard.noActivity') || 'Aucune activité'}</p>
          ) : (
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-1">
                {activities.map((act: any, i: number) => {
                  const iconMap: Record<string, { icon: any; bg: string; text: string }> = {
                    order: { icon: ShoppingCart, bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
                    customer: { icon: UserPlus, bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400' },
                    payment: { icon: CreditCard, bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
                  }
                  const { icon: Icon, bg, text } = iconMap[act.type] || iconMap.order

                  let label = ''
                  if (act.type === 'order') {
                    label = `Commande ${act.data.orderNumber || ''} — ${act.data.customer || ''}${act.data.amount ? ` · ${fmtAmount(act.data.amount)}` : ''}`
                  } else if (act.type === 'customer') {
                    label = `Nouveau client : ${act.data.name || ''}${act.data.phone ? ` (${act.data.phone})` : ''}`
                  } else if (act.type === 'payment') {
                    label = `Paiement ${fmtAmount(act.data.amount || 0)}${act.data.method ? ` (${act.data.method})` : ''}${act.data.customer ? ` — ${act.data.customer}` : ''}`
                  }

                  return (
                    <div key={i} className="flex items-start gap-3 py-2 relative">
                      <div className={`w-[30px] h-[30px] rounded-full ${bg} flex items-center justify-center flex-shrink-0 z-10`}>
                        <Icon className={`h-3.5 w-3.5 ${text}`} />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm truncate">{label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {act.date ? new Date(act.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
