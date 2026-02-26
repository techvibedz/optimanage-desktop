import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Eye } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
  const { login, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const isLoading = loading || isSubmitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    if (!email) { setErrors(prev => ({ ...prev, email: 'Email is required' })); return }
    if (!password) { setErrors(prev => ({ ...prev, password: 'Password is required' })); return }

    try {
      setIsSubmitting(true)
      await login(email, password)
    } catch (err: any) {
      const msg = err?.message || 'Login failed'
      toast.error('Login failed', { description: msg })
      setErrors({ password: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-background">
      <div className="login-container">
        <div className="brand-header">
          <div className="brand-icon">
            <Eye className="w-10 h-10 text-white" />
          </div>
          <h1 className="brand-title">OptiManage</h1>
          <p className="brand-subtitle">Optical Shop Management System</p>
        </div>

        <div className="login-card">
          <div className="login-card-header">
            <h2 className="login-card-title">Welcome Back</h2>
            <p className="login-card-description">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="login-form-group">
              <label htmlFor="email" className="login-form-label">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={`login-form-input w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 ${errors.email ? 'border-red-500' : ''}`}
                disabled={isLoading}
              />
              {errors.email && <p className="login-form-error">{errors.email}</p>}
            </div>

            <div className="login-form-group">
              <label htmlFor="password" className="login-form-label">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`login-form-input w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 ${errors.password ? 'border-red-500' : ''}`}
                disabled={isLoading}
              />
              {errors.password && <p className="login-form-error">{errors.password}</p>}
            </div>

            <div className="login-form-group">
              <button type="submit" className={`login-btn ${isLoading ? 'loading' : ''}`} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="loading-spinner" />
                    Signing in...
                  </>
                ) : 'Sign In'}
              </button>
            </div>
          </form>

          <div className="login-footer">
            <p>Secure login powered by OptiManage</p>
          </div>
        </div>
      </div>
    </div>
  )
}
