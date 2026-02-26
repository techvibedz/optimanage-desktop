import { useSettings } from './settings-context'
import { useLanguage, t as translate, Language } from './translations'
import { useEffect, useState } from 'react'

export const useTranslation = () => {
  const { settings, loading } = useSettings()
  useLanguage()

  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem('language') as Language
    return stored || settings.language
  })

  useEffect(() => {
    if (!loading) {
      const stored = localStorage.getItem('language') as Language
      setLanguage(stored || settings.language)
    }
  }, [loading, settings.language])

  useEffect(() => {
    const handler = () => {
      const stored = localStorage.getItem('language') as Language
      if (stored) setLanguage(stored)
    }
    window.addEventListener('languageChanged', handler)
    return () => window.removeEventListener('languageChanged', handler)
  }, [])

  const t = (key: string, params?: Record<string, string | number>) => {
    return translate(key, params, language)
  }

  return { t, language }
}
