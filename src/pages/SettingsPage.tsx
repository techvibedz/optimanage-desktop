import { useState, useRef } from 'react'
import { useSettings } from '@/lib/settings-context'
import { useTranslation } from '@/lib/use-translation'
import { setLanguage, Language } from '@/lib/translations'
import { toast } from 'sonner'
import { Upload, X } from 'lucide-react'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { settings, updateSettings } = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    </div>
  )
}
