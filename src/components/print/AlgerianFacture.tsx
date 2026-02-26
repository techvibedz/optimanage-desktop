import { useSettings } from '@/lib/settings-context'
import { useTranslation } from '@/lib/use-translation'

interface FactureExtraItem {
  id: string
  desc: string
  qty: number
  price: number
  type: string
}

interface AlgerianFactureProps {
  order: any
  extraItems?: FactureExtraItem[]
  priceOverrides?: Record<string, number>
}

export default function AlgerianFacture({ order, extraItems = [], priceOverrides = {} }: AlgerianFactureProps) {
  const { settings } = useSettings()
  const { language } = useTranslation()

  const fmt = (amount: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' DA'
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US') : '-'
  const customerName = `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 'N/A'

  // Build line items (no services/addons)
  const items: Array<{ desc: string; qty: number; price: number }> = []

  // Frame
  const framePrice = priceOverrides['frame'] ?? order.framePrice ?? order.frame?.sellingPrice ?? 0
  if (order.frame && framePrice > 0) {
    items.push({ desc: `Monture: ${order.frame.brand} ${order.frame.model || ''} ${order.frame.color ? `(${order.frame.color})` : ''}`.trim(), qty: 1, price: framePrice })
  }

  // VL Right Eye Lens
  if (order.vlRightEyeLensPrice > 0 || priceOverrides['vlR']) {
    const name = order.vlRightEyeLensType?.name || 'Verre VL'
    items.push({ desc: `${name} — VL OD`, qty: 1, price: priceOverrides['vlR'] ?? order.vlRightEyeLensPrice })
  }
  // VL Left Eye Lens
  if (order.vlLeftEyeLensPrice > 0 || priceOverrides['vlL']) {
    const name = order.vlLeftEyeLensType?.name || 'Verre VL'
    items.push({ desc: `${name} — VL OG`, qty: 1, price: priceOverrides['vlL'] ?? order.vlLeftEyeLensPrice })
  }
  // VP Right Eye Lens
  if (order.vpRightEyeLensPrice > 0 || priceOverrides['vpR']) {
    const name = order.vpRightEyeLensType?.name || 'Verre VP'
    items.push({ desc: `${name} — VP OD`, qty: 1, price: priceOverrides['vpR'] ?? order.vpRightEyeLensPrice })
  }
  // VP Left Eye Lens
  if (order.vpLeftEyeLensPrice > 0 || priceOverrides['vpL']) {
    const name = order.vpLeftEyeLensType?.name || 'Verre VP'
    items.push({ desc: `${name} — VP OG`, qty: 1, price: priceOverrides['vpL'] ?? order.vpLeftEyeLensPrice })
  }

  // Fallback old lens type
  if (items.length <= 1 && order.lensType) {
    const lp = order.lensType.sellingPrice || 0
    if (lp > 0) items.push({ desc: `Verres: ${order.lensType.name}`, qty: 2, price: lp })
  }

  // Extra items (frames, contact lenses, custom — no services)
  extraItems.forEach(item => {
    if (item.type === 'service') return
    const typePrefix = item.type === 'frame' ? 'Monture: ' : item.type === 'contact_lens' ? 'Lentilles: ' : ''
    items.push({ desc: `${typePrefix}${item.desc}`, qty: item.qty, price: item.price })
  })

  // Calculate total
  const hasOverrides = Object.keys(priceOverrides).length > 0 || extraItems.length > 0
  const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0)
  const displayTotal = hasOverrides ? itemsTotal : order.totalPrice

  const totalPaid = order.payments?.reduce((s: number, p: any) => s + (p.amount || 0), 0) || order.depositAmount || 0
  const balanceDue = Math.max(0, displayTotal - totalPaid)

  // Auto-scale font sizes based on item count to fit A5
  const itemCount = items.length + (order.payments?.length || 0)
  const scale = itemCount <= 4 ? 1 : itemCount <= 7 ? 0.92 : itemCount <= 10 ? 0.85 : 0.78
  const fs = (base: number) => `${(base * scale).toFixed(1)}pt`

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: fs(11), color: '#1a1a1a', padding: '6mm 7mm', width: '100%', maxWidth: '148mm', minHeight: '210mm', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', color: 'white', padding: '6mm 7mm', borderRadius: '3mm', marginBottom: '4mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
          {settings.logoUrl && (
            <img src={settings.logoUrl} alt="Logo" style={{ width: '14mm', height: '14mm', objectFit: 'contain', borderRadius: '2mm' }} />
          )}
          <div>
            <div style={{ fontSize: fs(16), fontWeight: 700, letterSpacing: '0.5px' }}>{settings.opticianName || 'OptiManage'}</div>
            {settings.opticianAddress && <div style={{ fontSize: fs(9), opacity: 0.9, marginTop: '1mm' }}>{settings.opticianAddress}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: fs(14), fontWeight: 700, letterSpacing: '1px' }}>FACTURE</div>
          <div style={{ fontSize: fs(11), opacity: 0.9, marginTop: '1mm' }}>N° {order.orderNumber || '-'}</div>
          <div style={{ fontSize: fs(9), opacity: 0.8, marginTop: '0.5mm' }}>{fmtDate(order.createdAt)}</div>
        </div>
      </div>

      {/* Client */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '2mm', padding: '4mm 5mm', marginBottom: '4mm' }}>
        <div style={{ fontSize: fs(8), fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2mm', letterSpacing: '0.5px' }}>Client</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: fs(12) }}>{customerName}</div>
            {order.customer?.phone && <div style={{ fontSize: fs(10), color: '#64748b', marginTop: '1mm' }}>Tél: {order.customer.phone}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: fs(10), color: '#64748b' }}>
            {order.expectedCompletionDate && <div>Prête le: {fmtDate(order.expectedCompletionDate)}</div>}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '2mm', overflow: 'hidden', marginBottom: '4mm', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs(10) }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: '3mm 4mm', fontWeight: 700, borderBottom: '1px solid #e2e8f0', fontSize: fs(9) }}>Désignation</th>
              <th style={{ textAlign: 'center', padding: '3mm', fontWeight: 700, borderBottom: '1px solid #e2e8f0', width: '10%', fontSize: fs(9) }}>Qté</th>
              <th style={{ textAlign: 'right', padding: '3mm 4mm', fontWeight: 700, borderBottom: '1px solid #e2e8f0', width: '25%', fontSize: fs(9) }}>Prix</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '3mm 4mm', fontSize: fs(10) }}>{item.desc}</td>
                <td style={{ textAlign: 'center', padding: '3mm', fontSize: fs(10) }}>{item.qty}</td>
                <td style={{ textAlign: 'right', padding: '3mm 4mm', fontWeight: 600, fontSize: fs(10) }}>{fmt(item.price * item.qty)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={3} style={{ padding: '4mm', textAlign: 'center', color: '#94a3b8' }}>—</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment History */}
      {order.payments && order.payments.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '2mm', overflow: 'hidden', marginBottom: '4mm' }}>
          <div style={{ background: '#f8fafc', padding: '2.5mm 4mm', borderBottom: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: fs(8), fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Paiements</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs(9) }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '2mm 4mm', fontWeight: 600 }}>Date</th>
                <th style={{ textAlign: 'left', padding: '2mm 4mm', fontWeight: 600 }}>Méthode</th>
                <th style={{ textAlign: 'right', padding: '2mm 4mm', fontWeight: 600 }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {order.payments.map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '2mm 4mm' }}>{p.paymentDate ? fmtDate(p.paymentDate) : '-'}</td>
                  <td style={{ padding: '2mm 4mm', textTransform: 'capitalize' }}>{p.paymentMethod || '-'}</td>
                  <td style={{ padding: '2mm 4mm', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{fmt(p.amount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4mm' }}>
        <div style={{ width: '55%', border: '1px solid #e2e8f0', borderRadius: '2mm', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3mm 4mm', borderBottom: '1px solid #f1f5f9', fontSize: fs(11) }}>
            <span style={{ fontWeight: 600 }}>Total</span><span style={{ fontWeight: 700 }}>{fmt(displayTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3mm 4mm', borderBottom: '1px solid #f1f5f9', fontSize: fs(10) }}>
            <span>Versement</span><span style={{ fontWeight: 600, color: '#16a34a' }}>{fmt(totalPaid)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3.5mm 4mm', background: balanceDue > 0 ? '#fef2f2' : '#f0fdf4', fontSize: fs(11), fontWeight: 700 }}>
            <span>Reste à payer</span><span style={{ color: balanceDue > 0 ? '#dc2626' : '#16a34a' }}>{fmt(balanceDue)}</span>
          </div>
        </div>
      </div>

      {/* Signature area */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '3mm' }}>
        <div style={{ textAlign: 'center', width: '40%' }}>
          <div style={{ borderTop: '1px solid #cbd5e1', marginTop: '14mm', paddingTop: '1.5mm', fontSize: fs(8), color: '#94a3b8' }}>Signature Client</div>
        </div>
        <div style={{ textAlign: 'center', width: '40%' }}>
          <div style={{ borderTop: '1px solid #cbd5e1', marginTop: '14mm', paddingTop: '1.5mm', fontSize: fs(8), color: '#94a3b8' }}>Cachet & Signature</div>
        </div>
      </div>
    </div>
  )
}
