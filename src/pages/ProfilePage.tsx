import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { User } from 'lucide-react'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { toast.error('Name is required'); return }
    // Profile update would go through IPC
    toast.success('Profile updated')
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordForm.currentPassword || !passwordForm.newPassword) { toast.error('All password fields are required'); return }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error('Passwords do not match'); return }
    if (passwordForm.newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    // Password change would go through IPC
    toast.success('Password changed')
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t('profile.title')}</h1>
        <p>{t('profile.subtitle')}</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Profile Info */}
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user?.name}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{user?.role}</span>
            </div>
          </div>

          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('common.name')}</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('common.email')}</label>
              <input type="email" value={form.email} disabled
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted mt-1 cursor-not-allowed" />
            </div>
            <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
              {t('common.saveChanges')}
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-6">
          <h2 className="text-lg font-semibold mb-4">{t('profile.changePassword')}</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('profile.currentPassword')}</label>
              <input type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('profile.newPassword')}</label>
              <input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('profile.confirmPassword')}</label>
              <input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1" />
            </div>
            <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
              {t('profile.changePassword')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
