import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import { ArrowLeft, Printer, User, CalendarDays, Stethoscope, Eye, FileText } from 'lucide-react'

export default function PrescriptionDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [prescription, setPrescription] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    window.electronAPI.getPrescription(id).then(res => {
      if (res.data) setPrescription(res.data)
      else if (res.error) setError(res.error)
    }).catch(err => setError(err.message || 'Failed to load')).finally(() => setLoading(false))
  }, [id])

  const handlePrint = () => {
    window.print()
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'
  const fmtVal = (v: number | null | undefined) => v != null ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : '-'
  const fmtAxis = (v: number | null | undefined) => v != null ? `${v}°` : '-'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !prescription) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-destructive font-medium">{error || 'Prescription not found'}</p>
        <button onClick={() => navigate('/prescriptions')} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </button>
      </div>
    )
  }

  const p = prescription
  const customer = p.customer
  const hasVL = p.hasVLData || p.vlRightEyeSphere != null || p.vlLeftEyeSphere != null
  const hasVP = p.hasVPData || p.vpRightEyeSphere != null || p.vpLeftEyeSphere != null

  return (
    <>
      <style>{`
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          #root { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          .print-prescription, .print-prescription * { visibility: visible !important; }
          .print-prescription {
            position: fixed !important; left: 0 !important; top: 0 !important;
            width: 210mm !important; height: 297mm !important;
            margin: 0 !important; padding: 20mm !important;
            overflow: hidden !important; z-index: 99999 !important;
            background: white !important; color: black !important;
          }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      {/* Screen header */}
      <div className="no-print page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/prescriptions')} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">{t('prescriptions.prescriptionDetails')}</h1>
              <p className="text-sm text-muted-foreground">
                {customer ? `${customer.firstName} ${customer.lastName}` : '-'} — {fmtDate(p.examinationDate)}
              </p>
            </div>
          </div>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium shadow-sm">
            <Printer className="h-4 w-4" /> {t('prescriptions.print')}
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div className="print-prescription">
        {/* Patient & Doctor Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Patient card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <User className="h-4 w-4" /> {t('prescriptions.patientInfo')}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('common.name')}</span>
                <span className="text-sm font-medium">{customer ? `${customer.firstName} ${customer.lastName}` : '-'}</span>
              </div>
              {customer?.phone && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t('common.phone')}</span>
                  <span className="text-sm font-medium">{customer.phone}</span>
                </div>
              )}
              {customer?.email && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t('common.email')}</span>
                  <span className="text-sm font-medium">{customer.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Doctor & Dates card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> {t('prescriptions.doctorAndDates')}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('prescriptions.doctor')}</span>
                <span className="text-sm font-medium">{p.doctorName || '-'}</span>
              </div>
              {p.doctorLicense && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t('prescriptions.license')}</span>
                  <span className="text-sm font-medium">{p.doctorLicense}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('prescriptions.examinationDate')}</span>
                <span className="text-sm font-medium">{fmtDate(p.examinationDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('prescriptions.expirationDate')}</span>
                <span className="text-sm font-medium">{fmtDate(p.expirationDate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Prescription Tables */}
        <div className="space-y-4 mb-6">
          {/* Distance Vision (VL) */}
          {hasVL && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                {t('prescriptions.distanceVision')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium w-24"></th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.sphere')}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.cylinder')}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.axis')}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.prism')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 px-3 font-semibold text-blue-600 dark:text-blue-400">{t('prescriptions.rightEye')}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vlRightEyeSphere)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vlRightEyeCylinder)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtAxis(p.vlRightEyeAxis)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vlRightEyePrism)}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-green-600 dark:text-green-400">{t('prescriptions.leftEye')}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vlLeftEyeSphere)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vlLeftEyeCylinder)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtAxis(p.vlLeftEyeAxis)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vlLeftEyePrism)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Near Vision (VP) */}
          {hasVP && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Eye className="h-4 w-4 text-purple-500" />
                {t('prescriptions.nearVision')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium w-24"></th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.sphere')}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.cylinder')}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.axis')}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.add')}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{t('prescriptions.prism')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 px-3 font-semibold text-blue-600 dark:text-blue-400">{t('prescriptions.rightEye')}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vpRightEyeSphere)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vpRightEyeCylinder)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtAxis(p.vpRightEyeAxis)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vpRightEyeAdd)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vpRightEyePrism)}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-green-600 dark:text-green-400">{t('prescriptions.leftEye')}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vpLeftEyeSphere)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vpLeftEyeCylinder)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtAxis(p.vpLeftEyeAxis)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vpLeftEyeAdd)}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-medium">{fmtVal(p.vpLeftEyePrism)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PD */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">{t('prescriptions.pupillaryDistance')}</h3>
            <div className="flex gap-8">
              <div>
                <span className="text-sm text-muted-foreground">{t('prescriptions.pd')}</span>
                <span className="ml-2 text-sm font-mono font-medium">{p.pupillaryDistance != null ? `${p.pupillaryDistance} mm` : '-'}</span>
              </div>
              {p.readingDistance != null && (
                <div>
                  <span className="text-sm text-muted-foreground">{t('prescriptions.readingDistance')}</span>
                  <span className="ml-2 text-sm font-mono font-medium">{p.readingDistance} mm</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        {p.notes && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5 mb-6">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" /> {t('common.notes')}
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.notes}</p>
          </div>
        )}

        {/* Related Orders */}
        {p.orders && p.orders.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5 no-print">
            <h3 className="text-sm font-semibold mb-3">{t('prescriptions.relatedOrders')}</h3>
            <div className="space-y-2">
              {p.orders.map((o: any) => (
                <button key={o.id} onClick={() => navigate(`/orders/${o.id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left">
                  <div>
                    <span className="text-sm font-medium text-primary">{o.orderNumber}</span>
                    <span className="text-xs text-muted-foreground ml-2">{fmtDate(o.createdAt)}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    o.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                    o.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                  }`}>{o.status}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
