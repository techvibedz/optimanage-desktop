import { useState, useRef, useEffect } from 'react'
import { useSettings } from '@/lib/settings-context'
import { useTranslation } from '@/lib/use-translation'
import { setLanguage, Language } from '@/lib/translations'
import { toast } from 'sonner'
import { Upload, X, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import type { UpdaterStatus } from '@/types/electron'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { settings, updateSettings } = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState('')

  useEffect(() => {
    if (!window.electronAPI?.onUpdaterStatus) return
    const cleanup = window.electronAPI.onUpdaterStatus((status: UpdaterStatus) => {
      switch (status.type) {
        case 'checking-for-update': setUpdateStatus('checking'); break
        case 'update-available': setUpdateStatus('available'); setUpdateVersion(status.data?.version || ''); break
        case 'update-not-available': setUpdateStatus('up-to-date'); break
        case 'error': setUpdateStatus('error'); break
      }
    })
    return cleanup
  }, [])

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking')
    await window.electronAPI.checkUpdate()
  }

  const [form, setForm] = useState({
    opticianName: settings.opticianName,
    opticianAddress: settings.opticianAddress,
    opticianPhone: settings.opticianPhone,
    opticianEmail: settings.opticianEmail || '',
    logoUrl: settings.logoUrl || '',
    language: settings.language,
    currency: settings.currency,
    timezone: settings.timezone,
  })

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.invalidImage') || 'Please select an image file')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('settings.imageTooLarge') || 'Image must be less than 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setForm(p => ({ ...p, logoUrl: base64 }))
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    setForm(p => ({ ...p, logoUrl: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await updateSettings(form)
    if (form.language !== settings.language) {
      setLanguage(form.language as Language)
    }
    toast.success(t('settings.saved'))
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.subtitle')}</p>
      </div>

      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-6 max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">{t('settings.shopInfo')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Logo Upload */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('settings.logo') || 'Logo'}</label>
            <div className="mt-1 flex items-center gap-4">
              {form.logoUrl ? (
                <div className="relative">
                  <img src={form.logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-lg border border-border" />
                  <button type="button" onClick={removeLogo}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                  <Upload className="h-5 w-5" />
                </div>
              )}
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
                  {form.logoUrl ? (t('settings.changeLogo') || 'Change Logo') : (t('settings.uploadLogo') || 'Upload Logo')}
                </button>
                <p className="text-xs text-muted-foreground mt-1">{t('settings.logoHint') || 'PNG, JPG up to 2MB. Shows on facture & order slip.'}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('settings.shopName')}</label>
            <input value={form.opticianName} onChange={e => setForm(p => ({ ...p, opticianName: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('settings.shopAddress')}</label>
            <input value={form.opticianAddress} onChange={e => setForm(p => ({ ...p, opticianAddress: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('settings.shopPhone')}</label>
              <input value={form.opticianPhone} onChange={e => setForm(p => ({ ...p, opticianPhone: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('settings.shopEmail')}</label>
              <input type="email" value={form.opticianEmail} onChange={e => setForm(p => ({ ...p, opticianEmail: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('settings.language')}</label>
              <select value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value as Language }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1">
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('settings.currency')}</label>
              <input value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('settings.timezone')}</label>
              <input value={form.timezone} onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
            </div>
          </div>
          <div className="pt-2">
            <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
              {t('common.saveChanges')}
            </button>
          </div>
        </form>
      </div>

      {/* Application Updates */}
      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-6 max-w-2xl mt-6">
        <h2 className="text-lg font-semibold mb-4">Mises à jour de l'application</h2>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              Vérifiez si une nouvelle version d'OptiManage est disponible.
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              {updateStatus === 'checking' && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vérification en cours...
                </span>
              )}
              {updateStatus === 'up-to-date' && (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Vous êtes à jour
                </span>
              )}
              {updateStatus === 'available' && (
                <span className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
                  <RefreshCw className="h-3.5 w-3.5" /> Version {updateVersion} disponible !
                </span>
              )}
              {updateStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-red-500">
                  <AlertCircle className="h-3.5 w-3.5" /> Erreur de vérification
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleCheckUpdate}
            disabled={updateStatus === 'checking'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {updateStatus === 'checking'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />
            }
            Vérifier les mises à jour
          </button>
        </div>
      </div>
    </div>
  )
}
