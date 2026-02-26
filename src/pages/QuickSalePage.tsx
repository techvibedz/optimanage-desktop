import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { Zap, Check, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function QuickSalePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('PRODUCT')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) { toast.error(t('quickSale.amountRequired') || 'Amount is required'); return }
    if (!user?.id) return

    setIsSubmitting(true)
    try {
      const result = await window.electronAPI.createPayment({
        userId: user.id,
        amount: Number(amount),
        paymentMethod: paymentMethod.toLowerCase(),
        paymentDate: new Date(paymentDate),
        receiptNumber: `QS-${Date.now().toString().slice(-6)}`,
        reference: `Quick Sale - ${type}`,
        description: description || `Quick Sale: ${type}`,
      })

      if (result.error) { toast.error(result.error); return }
      toast.success(t('quickSale.success') || 'Quick sale recorded successfully!')
      setAmount('')
      setDescription('')
      setType('PRODUCT')
      setPaymentMethod('CASH')
      setPaymentDate(new Date().toISOString().split('T')[0])
    } catch (error) {
      toast.error(t('quickSale.error') || 'Failed to create quick sale')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('quickSale.title')}</h1>
              <p className="text-sm text-muted-foreground">{t('quickSale.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Amount */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t('quickSale.amount') || 'Amount'} (DA)
              </label>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            {/* Type */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t('quickSale.type') || 'Type'}
              </label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="PRODUCT">{t('quickSale.type.PRODUCT') || 'Product'}</option>
                <option value="SERVICE">{t('quickSale.type.SERVICE') || 'Service'}</option>
                <option value="OTHER">{t('quickSale.type.OTHER') || 'Other'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Payment Method */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t('quickSale.paymentMethod') || 'Payment Method'}
              </label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="CASH">{t('quickSale.method.CASH') || 'Cash'}</option>
                <option value="CREDIT_CARD">{t('quickSale.method.CREDIT_CARD') || 'Credit Card'}</option>
                <option value="DEBIT_CARD">{t('quickSale.method.DEBIT_CARD') || 'Debit Card'}</option>
                <option value="CHECK">{t('quickSale.method.CHECK') || 'Check'}</option>
                <option value="BANK_TRANSFER">{t('quickSale.method.BANK_TRANSFER') || 'Bank Transfer'}</option>
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t('quickSale.date') || 'Date'}
              </label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t('quickSale.description') || 'Description'}
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder={t('quickSale.descriptionPlaceholder') || 'Optional description...'}
              rows={3}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>

          {/* Submit */}
          <button type="submit" disabled={isSubmitting || !amount || Number(amount) <= 0}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t('quickSale.processing') || 'Processing...'}</>
            ) : (
              <><Check className="h-4 w-4" /> {t('quickSale.submit') || 'Record Quick Sale'}</>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
