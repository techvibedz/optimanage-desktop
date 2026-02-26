import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { ArrowLeft, Printer } from 'lucide-react'
import AlgerianFacture from '@/components/print/AlgerianFacture'

export default function PrintFacturePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const componentRef = useRef<HTMLDivElement>(null)

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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="loading-spinner-lg" />
        <span className="ml-3 text-sm text-muted-foreground">Chargement de la facture...</span>
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

  const printStyles = `
    @media print {
      @page { size: A5 portrait; margin: 2mm 3mm 2mm 3mm; }
      .print-controls, .print\\:hidden, button { display: none !important; }
      .price-input, input[type="text"], input[type="number"], textarea, select, .add-frame-btn, .remove-frame-btn, .add-contact-lens-btn, .remove-contact-lens-btn, .remove-lens-btn, [placeholder], [title*="Supprimer"], [title*="Ajouter"] { display: none !important; }
      .price-input + span.final-value { display: inline !important; color: #000 !important; font-weight: 600 !important; }
      .frame-description, .contact-lens-description { display: block !important; color: #64748b !important; font-size: 8pt !important; }
      div[style*="display: flex"][style*="flexDirection: column"] > input, div[style*="display: flex"][style*="flexDirection: column"] > select { display: none !important; }
      .facture-print-container { margin: 0 !important; padding: 0 !important; background: white !important; width: 100% !important; height: 100% !important; }
      .facture-content { max-width: 148mm !important; margin: 0 !important; box-shadow: none !important; border: none !important; }
      .items-table td, .items-table td:last-child, .client-info .info-value, .company-details { color: #000 !important; font-weight: 600 !important; }
      .company-info .company-name, .company-info .company-details { color: white !important; }
      .items-table td:nth-child(2) { color: #000 !important; display: table-cell !important; }
    }
  `

  return (
    <>
      <style>{printStyles}</style>

      {/* Print Controls - Hidden during print */}
      <div className="print-controls bg-white dark:bg-gray-900 shadow-sm border-b dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => navigate(-1)} className="px-3 py-2 border border-border rounded-lg hover:bg-muted text-sm flex items-center gap-2 print:hidden">
                <ArrowLeft className="h-4 w-4" /> Retour
              </button>
              <h1 className="text-xl font-semibold dark:text-white">Facture {order.orderNumber}</h1>
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={handlePrint} className="print:hidden flex items-center space-x-2 border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-all duration-200 px-6 py-3 rounded-lg">
                <Printer className="h-5 w-5" />
                <span className="font-semibold">Imprimer</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Print Instructions - Hidden during print */}
      <div className="print-controls max-w-4xl mx-auto px-4 py-6">
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2 dark:text-blue-100">Instructions d'impression</h2>
          <ul className="list-disc list-inside space-y-1 text-sm dark:text-blue-200">
            <li>Assurez-vous d'utiliser du papier A5 (148 x 210 mm)</li>
            <li>Réglez votre imprimante sur l'orientation portrait</li>
            <li>Désactivez les en-têtes et pieds de page dans les paramètres d'impression</li>
            <li>Utilisez une échelle d'impression de 100%</li>
          </ul>
        </div>
      </div>

      {/* Floating Print Button - Hidden during print */}
      <button
        onClick={handlePrint}
        className="print:hidden fixed bottom-8 right-8 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white p-4 rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 z-50 group"
        title="Imprimer la facture"
      >
        <Printer className="h-6 w-6" />
        <span className="absolute right-full mr-3 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-3 py-1 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          Imprimer
        </span>
      </button>

      {/* Main Content */}
      <div className="facture-print-container bg-gray-100 dark:bg-gray-950 min-h-screen p-5">
        <div className="facture-content bg-white max-w-[148mm] mx-auto shadow-md" ref={componentRef}>
          <AlgerianFacture order={order} />
        </div>
      </div>
    </>
  )
}
