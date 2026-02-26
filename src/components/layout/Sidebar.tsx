import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { useSettings } from '@/lib/settings-context'
import {
  LayoutDashboard, Users, ShoppingCart, FileText, CreditCard,
  Package, Settings, Eye, LogOut, BarChart3, Sun, Moon, Zap
} from 'lucide-react'

const navItems = [
  { title: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'nav.quickSale', href: '/quick-sale', icon: Zap },
  { title: 'nav.customers', href: '/customers', icon: Users },
  { title: 'nav.orders', href: '/orders', icon: ShoppingCart },
  { title: 'nav.prescriptions', href: '/prescriptions', icon: FileText },
  { title: 'nav.lensSummary', href: '/lens-summary', icon: BarChart3 },
  { title: 'nav.payments', href: '/payments', icon: CreditCard },
  { title: 'nav.inventory', href: '/inventory', icon: Package },
  { title: 'nav.userManagement', href: '/users', icon: Users, adminOnly: true },
  { title: 'nav.settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const { settings, toggleTheme } = useSettings()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const filtered = navItems.filter(item => {
    if (item.adminOnly) return user?.role === 'ADMIN'
    return true
  })

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link to="/dashboard" className="sidebar-brand">
          <Eye className="sidebar-logo" />
          <span>OptiManage</span>
        </Link>
      </div>

      <nav className="sidebar-nav">
        <ul className="space-y-1">
          {filtered.map(item => {
            const isActive = location.pathname === item.href
            return (
              <li key={item.href}>
                <Link to={item.href} className={isActive ? 'active' : undefined}>
                  <item.icon className="sidebar-icon" />
                  <span>{t(item.title)}</span>
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="sidebar-divider" />
        <div className="sidebar-section-title">{t('common.account')}</div>

        <ul className="space-y-1">
          <li>
            <Link to="/profile">
              <Users className="sidebar-icon" />
              <span>{t('common.profile')}</span>
            </Link>
          </li>
          <li>
            <button onClick={toggleTheme} type="button">
              {settings.theme === 'dark' ? <Sun className="sidebar-icon" /> : <Moon className="sidebar-icon" />}
              <span>{settings.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </li>
          <li>
            <button onClick={handleLogout} type="button">
              <LogOut className="sidebar-icon" />
              <span>{t('common.logout')}</span>
            </button>
          </li>
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <p className="user-name">{user?.name || user?.email?.split('@')[0] || 'User'}</p>
          <p className="user-role">{user?.role === 'ADMIN' ? t('common.administrator') : t('common.user')}</p>
        </div>
      </div>
    </aside>
  )
}
