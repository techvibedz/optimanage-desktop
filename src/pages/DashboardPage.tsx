import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign, ShoppingCart, Users, RefreshCw, Package, Zap, Eye, EyeOff,
  TrendingUp, TrendingDown, Minus, ArrowRight, FileText, CreditCard, BarChart3
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'today' | 'week' | 'month'>('today')
  const [showPriceStats, setShowPriceStats] = useState(() => {
    const saved = localStorage.getItem('dashboard_show_prices')
    return saved !== null ? saved === 'true' : true
  })

  useEffect(() => { fetchStats(activeFilter) }, [])

  const fetchStats = async (filter: string) => {
    if (!user?.id) return
    setLoading(true)
    try {
      const result = await window.electronAPI.getDashboardStats({ userId: user.id, filter })
      if (result.data) {
        setStats({ ...defaultStats, ...result.data })
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (filter: 'all' | 'today' | 'week' | 'month') => {
    setActiveFilter(filter)
    fetchStats(filter)
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
      <div className="inline-flex gap-1 bg-white/60 dark:bg-gray-800/60 rounded-xl p-1 border border-border/50">
        {(['today', 'week', 'month', 'all'] as const).map(f => (
          <button key={f}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeFilter === f
              ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-gray-700'}`}
            onClick={() => handleFilterChange(f)}>
            {t(`dashboard.${f === 'week' ? 'thisWeek' : f === 'month' ? 'thisMonth' : f === 'all' ? 'allTime' : 'today'}`)}
          </button>
        ))}
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

      {/* Revenue Analytics + Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Breakdown */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-border/50 p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">{t('dashboard.revenueBreakdown') || 'Revenue Breakdown'}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <span className="text-sm text-muted-foreground">{t('dashboard.payments') || 'Payments'}</span>
              <span className="text-sm font-semibold text-green-600">{loading ? '—' : fmtAmount(stats.revenueAnalytics.payments)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <span className="text-sm text-muted-foreground">{t('dashboard.deposits') || 'Deposits'}</span>
              <span className="text-sm font-semibold">{loading ? '—' : fmtAmount(stats.revenueAnalytics.deposits)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <span className="text-sm text-muted-foreground">{t('dashboard.outstanding') || 'Outstanding'}</span>
              <span className="text-sm font-semibold text-orange-600">{loading ? '—' : fmtAmount(stats.revenueAnalytics.outstanding)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium">{t('dashboard.totalRevenue') || 'Net Revenue'}</span>
              <span className="text-sm font-bold text-primary">{loading ? '—' : fmtAmount(stats.totalRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-border/50 p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">{t('dashboard.paymentMethods') || 'Payment Methods'}</h3>
          {stats.paymentMethodBreakdown.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t('common.noData') || 'No data yet'}</p>
          ) : (
            <div className="space-y-3">
              {stats.paymentMethodBreakdown.map((m, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm capitalize">{m.method}</span>
                    <span className="text-sm font-semibold">{fmtAmount(m.amount)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${m.percentage}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.percentage}%</p>
                </div>
              ))}
            </div>
          )}
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
    </div>
  )
}
