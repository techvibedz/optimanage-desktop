import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Language, setLanguage } from './translations'
import { useAuth } from './auth-context'

export interface Settings {
  opticianName: string
  opticianAddress: string
  opticianPhone: string
  opticianEmail?: string
  logoUrl?: string
  language: Language
  currency: string
  timezone: string
  theme: 'light' | 'dark'
}

interface SettingsContextType {
  settings: Settings
  loading: boolean
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  refreshSettings: () => Promise<void>
  toggleTheme: () => void
}

const defaultSettings: Settings = {
  opticianName: 'Optical Shop',
  opticianAddress: '123 Main Street, City, Country',
  opticianPhone: '+1 234 567 8900',
  opticianEmail: '',
  logoUrl: '',
  language: 'en',
  currency: 'DA',
  timezone: 'Africa/Algiers',
  theme: 'light',
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated } = useAuth()
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = localStorage.getItem('settings')
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    const storedLang = localStorage.getItem('language') as Language | null

    const base = stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings
    if (storedTheme) base.theme = storedTheme
    if (storedLang) base.language = storedLang
    return base
  })
  const [loading, setLoading] = useState(true)

  // Apply theme
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(settings.theme)
    localStorage.setItem('theme', settings.theme)
  }, [settings.theme])

  // Fetch settings from DB when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      fetchSettings()
    } else {
      setLoading(false)
    }
  }, [isAuthenticated, user?.id])

  const fetchSettings = async () => {
    try {
      if (!user?.id) return
      const result = await window.electronAPI.getSettings(user.id)
      if (result.data) {
        const merged = { ...settings, ...result.data }
        setSettings(merged)
        localStorage.setItem('settings', JSON.stringify(result.data))
        if (result.data.language) {
          setLanguage(result.data.language)
          localStorage.setItem('language', result.data.language)
        }
      }
    } catch (err) {
      console.error('Error fetching settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleTheme = () => {
    setSettings(prev => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }))
  }

  const updateSettings = async (newSettings: Partial<Settings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings }
      localStorage.setItem('settings', JSON.stringify(updated))
      if (newSettings.language) {
        localStorage.setItem('language', newSettings.language)
        setLanguage(newSettings.language)
      }
      return updated
    })

    try {
      if (user?.id) {
        await window.electronAPI.updateSettings(user.id, newSettings)
      }
    } catch (err) {
      console.error('Error updating settings:', err)
    }
  }

  const refreshSettings = () => fetchSettings()

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, refreshSettings, toggleTheme }}>
      {children}
    </SettingsContext.Provider>
  )
}
