import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { Plus, Search, Users, Trash2, Shield } from 'lucide-react'

export default function UsersPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'USER' })

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const result = await window.electronAPI.getUsers()
    if (result.data) setUsers(result.data)
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) { toast.error('All fields are required'); return }
    const result = await window.electronAPI.createUser(form)
    if (result.error) { toast.error(result.error); return }
    toast.success('User created')
    setShowForm(false)
    setForm({ name: '', email: '', password: '', role: 'USER' })
    fetchUsers()
  }

  const handleDelete = async (id: string) => {
    if (id === user?.id) { toast.error('Cannot delete yourself'); return }
    if (!confirm('Delete this user?')) return
    const result = await window.electronAPI.deleteUser(id)
    if (result.error) { toast.error(result.error); return }
    toast.success('User deleted')
    fetchUsers()
  }

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      USER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      ASSISTANT: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    }
    return `px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || colors.USER}`
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1>{t('users.title')}</h1><p>{t('users.subtitle')}</p></div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
            <Plus className="h-4 w-4" /> {t('users.addUser')}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{t('users.addUser')}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('common.name')} *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('common.email')} *</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('common.password')} *</label>
                <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('users.role')}</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background">
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                  <option value="ASSISTANT">Assistant</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{t('common.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="data-table-container">
        {loading ? (
          <div className="table-skeleton">
            <div className="flex items-center gap-4 px-4 py-3 bg-muted/50">
              <div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="table-skeleton-row">
                <div className="table-skeleton-cell lg" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell md" /><div className="table-skeleton-cell sm" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state"><Users className="empty-state-icon" /><p className="empty-state-title">{t('users.noUsers')}</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>{t('common.name')}</th><th>{t('common.email')}</th><th>{t('users.role')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className={getRoleBadge(u.role)}><Shield className="inline h-3 w-3 mr-1" />{u.role}</span></td>
                  <td>
                    {u.id !== user?.id && (
                      <button onClick={() => handleDelete(u.id)} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30"><Trash2 className="h-4 w-4 text-red-500" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
