import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import OrderSlip from '@/components/print/OrderSlip'

export default function PrintOrderSlipPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (id) fetchOrder() }, [id])

  const fetchOrder = async () => {
    if (!user?.id || !id) return
    setLoading(true)
    const res = await window.electronAPI.getOrder(id)
    if (res.data) setOrder(res.data)
    setLoading(false)
  }

  const handlePrint = () => window.electronAPI.printSlip()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">{t('common.loading') || 'Loading...'}</span>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">{t('common.error') || 'Error'}</h2>
          <p className="text-muted-foreground">{t('orders.notFound') || 'Order not found'}</p>
          <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 border border-border rounded-lg hover:bg-muted text-sm flex items-center gap-2 mx-auto">
            <ArrowLeft className="h-4 w-4" /> {t('common.back') || 'Back'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-slip-content, .print-slip-content * { visibility: visible; }
          .print-slip-content { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: A5 portrait; margin: 0; }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 border border-border rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">{t('orders.orderSlip') || 'Order Slip'} — {order.orderNumber}</h1>
            <p className="text-xs text-muted-foreground">{t('print.a5Instructions') || 'Print on A5 portrait paper. Top = workshop, Bottom = client.'}</p>
          </div>
        </div>
        <button onClick={handlePrint} className="px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium flex items-center gap-2 transition-colors">
          <Printer className="h-4 w-4" /> {t('common.print') || 'Print'}
        </button>
      </div>

      {/* Preview */}
      <div className="no-print bg-gray-100 dark:bg-gray-950 min-h-[calc(100vh-56px)] flex items-start justify-center py-8 px-4">
        <div className="print-slip-content bg-white rounded-sm shadow-lg" style={{ width: '148mm', minHeight: '210mm' }}>
          <OrderSlip order={order} />
        </div>
      </div>

      {/* Actual print target (hidden on screen, visible on print) */}
      <div className="print-slip-content hidden print:block">
        <OrderSlip order={order} />
      </div>
    </div>
  )
}
