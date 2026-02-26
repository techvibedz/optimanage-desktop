import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { ArrowLeft, Printer } from 'lucide-react'
import Receipt from '@/components/print/Receipt'

export default function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (id) fetchOrder() }, [id])

  const fetchOrder = async () => {
    if (!user?.id || !id) return
    setLoading(true)
    const res = await window.electronAPI.getOrder(id)
    if (res.data) setOrder(res.data)
    setLoading(false)
  }

  const handlePrint = () => window.print()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="loading-spinner-lg" />
        <span className="ml-3 text-sm text-muted-foreground">Chargement...</span>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Erreur</h2>
          <p className="text-muted-foreground">Commande introuvable</p>
          <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 border border-border rounded-lg hover:bg-muted text-sm flex items-center gap-2 mx-auto">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { position: absolute; left: 0; top: 0; width: 100%; }
          .print-controls { display: none !important; }
          @page { size: A5 portrait; margin: 0; }
        }
      `}</style>

      <div className="print-controls bg-white dark:bg-gray-900 shadow-sm border-b border-border px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="px-3 py-2 border border-border rounded-lg hover:bg-muted text-sm flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <h1 className="text-lg font-semibold">Reçu — {order.orderNumber}</h1>
          </div>
          <button onClick={handlePrint} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium flex items-center gap-2">
            <Printer className="h-4 w-4" /> Imprimer
          </button>
        </div>
      </div>

      <div className="bg-gray-100 dark:bg-gray-950 min-h-[60vh] p-5">
        <div className="print-content bg-white max-w-[148mm] mx-auto shadow-md" ref={printRef}>
          <Receipt order={order} />
        </div>
      </div>
    </>
  )
}
