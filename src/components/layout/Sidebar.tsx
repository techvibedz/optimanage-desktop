import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { useSettings } from '@/lib/settings-context'
import { processScannedCode } from '@/lib/useBarcodeScanner'
import CameraBarcodeScanner from '@/components/CameraBarcodeScanner'
import MobileScannerModal from '@/components/MobileScannerModal'
import {
  LayoutDashboard, Users, ShoppingCart, FileText, CreditCard,
  Package, Settings, Eye, LogOut, BarChart3, Sun, Moon, Zap, ScanLine, Smartphone, Calculator
} from 'lucide-react'

const navItems = [
  { title: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'nav.quickSale', href: '/quick-sale', icon: Zap },
  { title: 'nav.customers', href: '/customers', icon: Users },
  { title: 'nav.orders', href: '/orders', icon: ShoppingCart },
  { title: 'nav.prescriptions', href: '/prescriptions', icon: FileText },
  { title: 'nav.lensSummary', href: '/lens-summary', icon: BarChart3 },
  { title: 'nav.lensCostCalculator', href: '/lens-cost-calculator', icon: Calculator },
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

  const [scannerOpen, setScannerOpen] = useState(false)
  const [mobileScannerOpen, setMobileScannerOpen] = useState(false)
  const [mobileScannerCount, setMobileScannerCount] = useState(0)

  // Seed initial count + subscribe to live changes (no need to open the modal).
  useEffect(() => {
    let cancelled = false
    window.electronAPI.getMobileScannerInfo().then((info) => {
      if (!cancelled) setMobileScannerCount(info.connectedDevices)
    }).catch(() => { /* ignore */ })
    const off = window.electronAPI.onMobileScannerClientChange((count) => {
      setMobileScannerCount(count)
    })
    return () => { cancelled = true; off() }
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleScanned = async (text: string) => {
    setScannerOpen(false)
    if (!user?.id) return
    await processScannedCode(text, user.id, navigate)
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
            <button onClick={() => setScannerOpen(true)} type="button">
              <ScanLine className="sidebar-icon" />
              <span>Scanner code-barres</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => setMobileScannerOpen(true)}
              type="button"
              style={{ position: 'relative' }}
              title={mobileScannerCount > 0 ? `${mobileScannerCount} téléphone(s) connecté(s)` : 'Aucun téléphone connecté'}
            >
              <Smartphone className="sidebar-icon" />
              <span>Scanner Mobile</span>
              {mobileScannerCount > 0 && (
                <span
                  aria-label={`${mobileScannerCount} connecté`}
                  style={{
                    marginLeft: 'auto',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: 'rgb(34,197,94)',
                    boxShadow: '0 0 0 4px rgba(34,197,94,0.2)',
                    flexShrink: 0,
                  }}
                />
              )}
            </button>
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

      <CameraBarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScanned}
      />

      <MobileScannerModal
        open={mobileScannerOpen}
        onClose={() => setMobileScannerOpen(false)}
      />
    </aside>
  )
}
