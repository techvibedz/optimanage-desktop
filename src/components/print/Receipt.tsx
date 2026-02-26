import { useSettings } from '@/lib/settings-context'
import { useTranslation } from '@/lib/use-translation'

interface ReceiptProps {
  order: {
    id: string
    orderNumber: string
    customer: { firstName?: string; lastName?: string; phone?: string }
    frame?: { brand?: string; model?: string; color?: string; sellingPrice?: number }
    lensType?: { name?: string; sellingPrice?: number }
    prescription?: {
      vlOdSphere?: number; vlOdCylinder?: number; vlOdAxis?: number
      vlOsSphere?: number; vlOsCylinder?: number; vlOsAxis?: number
      vpOdSphere?: number; vpOdCylinder?: number; vpOdAxis?: number
      vpOsSphere?: number; vpOsCylinder?: number; vpOsAxis?: number
      vlOdAdd?: number; vlOsAdd?: number; vpOdAdd?: number; vpOsAdd?: number
    }
    totalPrice: number
    depositAmount: number
    balanceDue: number
    createdAt: string
    expectedCompletionDate?: string
    status?: string
  }
  showPaidStamp?: boolean
}

export default function Receipt({ order, showPaidStamp }: ReceiptProps) {
  const { settings } = useSettings()
  const { language } = useTranslation()

  const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' DA'
  const formatDate = (d: string | Date) => {
    const date = new Date(d)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }
  const fmtRx = (v?: number, isAxis = false) => {
    if (v == null) return '-'
    if (isAxis) return v.toFixed(0)
    return (v > 0 ? '+' : '') + v.toFixed(2)
  }
  const customerName = `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 'N/A'
  const orderNum = order.orderNumber?.replace(/^ORD-/, '').replace(/^\d{6}-/, '') || '-'
  const isPaid = showPaidStamp !== undefined ? showPaidStamp : order.balanceDue <= 0

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", fontSize: '10pt', color: '#000', padding: '8mm', width: '100%', maxWidth: '148mm', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '4mm', paddingBottom: '3mm', borderBottom: '2px solid #000' }}>
        <div style={{ fontSize: '16pt', fontWeight: 700, letterSpacing: '1px' }}>{settings.opticianName || 'OptiManage'}</div>
        <div style={{ fontSize: '8pt', color: '#555', marginTop: '1mm' }}>{settings.opticianAddress || ''}</div>
        <div style={{ fontSize: '8pt', color: '#555' }}>Tél: {settings.opticianPhone || ''}</div>
      </div>

      {/* Receipt Title */}
      <div style={{ textAlign: 'center', marginBottom: '4mm' }}>
        <div style={{ fontSize: '14pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Reçu</div>
        <div style={{ fontSize: '9pt', color: '#555' }}>N° {orderNum} — {formatDate(order.createdAt)}</div>
      </div>

      {/* Customer */}
      <div style={{ marginBottom: '4mm', padding: '3mm', border: '1px solid #ccc', borderRadius: '2mm' }}>
        <div style={{ fontSize: '8pt', fontWeight: 700, color: '#666', textTransform: 'uppercase', marginBottom: '1mm' }}>Client</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600, fontSize: '11pt' }}>{customerName}</div>
          {order.customer?.phone && <div style={{ fontSize: '9pt', color: '#555' }}>{order.customer.phone}</div>}
        </div>
      </div>

      {/* Prescription Summary */}
      {order.prescription && (
        <div style={{ marginBottom: '4mm' }}>
          <div style={{ fontSize: '8pt', fontWeight: 700, color: '#666', textTransform: 'uppercase', marginBottom: '1.5mm' }}>Ordonnance</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt', border: '1px solid #ddd' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '1.5mm 2mm', textAlign: 'left', borderBottom: '1px solid #ddd' }}></th>
                <th style={{ padding: '1.5mm', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Sph</th>
                <th style={{ padding: '1.5mm', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Cyl</th>
                <th style={{ padding: '1.5mm', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Axe</th>
                <th style={{ padding: '1.5mm', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Add</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: '1mm 2mm', fontWeight: 600 }}>VL OD</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vlOdSphere)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vlOdCylinder)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vlOdAxis, true)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vlOdAdd)}</td></tr>
              <tr style={{ borderBottom: '1px solid #eee' }}><td style={{ padding: '1mm 2mm', fontWeight: 600 }}>VL OS</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vlOsSphere)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vlOsCylinder)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vlOsAxis, true)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vlOsAdd)}</td></tr>
              <tr><td style={{ padding: '1mm 2mm', fontWeight: 600 }}>VP OD</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vpOdSphere)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vpOdCylinder)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vpOdAxis, true)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vpOdAdd)}</td></tr>
              <tr><td style={{ padding: '1mm 2mm', fontWeight: 600 }}>VP OS</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vpOsSphere)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vpOsCylinder)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vpOsAxis, true)}</td><td style={{ textAlign: 'center' }}>{fmtRx(order.prescription.vpOsAdd)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Items */}
      <div style={{ marginBottom: '4mm' }}>
        <div style={{ fontSize: '8pt', fontWeight: 700, color: '#666', textTransform: 'uppercase', marginBottom: '1.5mm' }}>Articles</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', border: '1px solid #ddd' }}>
          <tbody>
            {order.frame && (
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '2mm 3mm' }}>Monture: {order.frame.brand} {order.frame.model} ({order.frame.color})</td>
                <td style={{ padding: '2mm 3mm', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(order.frame.sellingPrice || 0)}</td>
              </tr>
            )}
            {order.lensType && (
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '2mm 3mm' }}>Verres: {order.lensType.name}</td>
                <td style={{ padding: '2mm 3mm', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(order.lensType.sellingPrice || 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Summary */}
      <div style={{ border: '2px solid #000', borderRadius: '2mm', padding: '3mm 4mm', marginBottom: '4mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5mm', fontSize: '10pt' }}>
          <span>Total:</span><span style={{ fontWeight: 700 }}>{formatCurrency(order.totalPrice)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5mm', fontSize: '10pt' }}>
          <span>Versement:</span><span style={{ fontWeight: 600, color: '#16a34a' }}>{formatCurrency(order.depositAmount)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11pt', fontWeight: 700, paddingTop: '1.5mm', borderTop: '1px solid #ccc' }}>
          <span>Reste à payer:</span><span style={{ color: order.balanceDue > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(order.balanceDue)}</span>
        </div>
      </div>

      {/* Paid Stamp */}
      {isPaid && (
        <div style={{ textAlign: 'center', marginBottom: '4mm' }}>
          <span style={{ display: 'inline-block', border: '3px solid #16a34a', color: '#16a34a', padding: '2mm 6mm', borderRadius: '2mm', fontSize: '14pt', fontWeight: 700, transform: 'rotate(-5deg)', opacity: 0.8 }}>PAYÉ</span>
        </div>
      )}

      {/* Delivery Date */}
      {order.expectedCompletionDate && (
        <div style={{ textAlign: 'center', fontSize: '9pt', marginBottom: '3mm' }}>
          <strong>Date de livraison prévue:</strong> {formatDate(order.expectedCompletionDate)}
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: '7pt', color: '#999', marginTop: '4mm', paddingTop: '2mm', borderTop: '1px solid #ddd' }}>
        Merci pour votre confiance — {settings.opticianName || 'OptiManage'}
      </div>
    </div>
  )
}
