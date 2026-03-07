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
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">{t('common.loading') || 'Loading...'}</span>
      </div>
    )
  }

  if (!order) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
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
    <>
      <style>{`
        .slip-page { height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: #f3f4f6; }
        .dark .slip-page { background: #0a0a0f; }
        .slip-toolbar { flex-shrink: 0; }
        .slip-scroll { flex: 1; overflow-y: auto; }
        .print-slip-target { position: absolute; left: -9999px; top: 0; width: 148mm; height: 210mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
          #root { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          .print-slip-target, .print-slip-target * { visibility: visible !important; }
          .print-slip-target { position: fixed !important; left: 0 !important; top: 0 !important; width: 148mm !important; height: 210mm !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; z-index: 99999 !important; }
          @page { size: A5 portrait; margin: 0mm 0mm 2mm 0mm; }
        }
      `}</style>

      <div className="slip-page">
        {/* Toolbar */}
        <div className="slip-toolbar no-print" style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate(-1)} style={{ padding: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'transparent', cursor: 'pointer', display: 'flex' }}>
              <ArrowLeft style={{ width: 16, height: 16 }} />
            </button>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                {t('orders.orderSlip') || 'Print Preview'} — {order.orderNumber}
              </h1>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                {t('print.a5Instructions') || 'A5 portrait · Top = Atelier · Bottom = Client'}
              </p>
            </div>
          </div>
          <button onClick={handlePrint} style={{ padding: '8px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer style={{ width: 16, height: 16 }} /> {t('common.print') || 'Print'}
          </button>
        </div>

        {/* Scrollable preview */}
        <div className="slip-scroll no-print">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 16px 64px' }}>
            <div style={{ width: '148mm', height: '210mm', background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', borderRadius: '4px', overflow: 'hidden' }}>
              <OrderSlip order={order} />
            </div>
          </div>
        </div>
      </div>

      {/* Actual print target (hidden on screen, visible on print) */}
      <div className="print-slip-target">
        <OrderSlip order={order} />
      </div>
    </>
  )
}
