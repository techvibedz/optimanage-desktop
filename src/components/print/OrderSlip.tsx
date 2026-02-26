import { useSettings } from '@/lib/settings-context'
import { useTranslation } from '@/lib/use-translation'

interface LensTypeInfo { name: string }

interface OrderSlipProps {
  order: {
    id: string
    orderNumber: string
    customer: { firstName?: string; lastName?: string; phone?: string }
    frame?: { brand: string; model: string; color: string; size?: string }
    lensType?: LensTypeInfo
    vlRightEyeLensType?: LensTypeInfo
    vlLeftEyeLensType?: LensTypeInfo
    vpRightEyeLensType?: LensTypeInfo
    vpLeftEyeLensType?: LensTypeInfo
    prescription?: {
      hasVLData?: boolean; hasVPData?: boolean
      vlRightEyeSphere?: number; vlRightEyeCylinder?: number; vlRightEyeAxis?: number
      vlLeftEyeSphere?: number; vlLeftEyeCylinder?: number; vlLeftEyeAxis?: number
      vpRightEyeSphere?: number; vpRightEyeCylinder?: number; vpRightEyeAxis?: number; vpRightEyeAdd?: number
      vpLeftEyeSphere?: number; vpLeftEyeCylinder?: number; vpLeftEyeAxis?: number; vpLeftEyeAdd?: number
      pupillaryDistance?: number
    }
    totalPrice: number
    depositAmount: number
    balanceDue: number
    expectedCompletionDate?: string
    createdAt: string
    notes?: string
    technicalNotes?: string
  }
}

export default function OrderSlip({ order }: OrderSlipProps) {
  const { settings } = useSettings()
  const { language } = useTranslation()
  const locale = language === 'fr' ? 'fr-FR' : 'en-US'

  const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' DA'
  const formatDate = (d: string) => new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  const formatReadyDate = (d: string) => {
    const date = new Date(d)
    const dayName = date.toLocaleDateString(locale, { weekday: 'long' })
    const dateStr = date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dateStr}`
  }
  const fmtRx = (v?: number) => v == null ? '-' : (v > 0 ? '+' : '') + v.toFixed(2)
  const fmtAxis = (v?: number) => v == null ? '-' : v.toFixed(0) + '°'
  const customerName = `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 'N/A'

  const totalPaid = order.depositAmount || 0
  const balanceDue = Math.max(0, order.totalPrice - totalPaid)
  const paymentStatusText = balanceDue <= 0 ? 'PAYÉ' : totalPaid > 0 ? 'PARTIEL' : 'IMPAYÉ'

  const hasAnyLensType = order.vlRightEyeLensType || order.vlLeftEyeLensType || order.vpRightEyeLensType || order.vpLeftEyeLensType || order.lensType
  const hasVL = order.prescription?.hasVLData !== false
  const hasVP = order.prescription?.hasVPData !== false
  const hasBoth = hasVL && hasVP

  // Auto-adjust heights: Atelier needs more when it has VL+VP, less when VL-only
  // Total usable A5 = 210mm, cut line ~2mm
  const atelierHeight = hasBoth ? '118mm' : order.prescription ? '108mm' : '95mm'
  const clientHeight = hasBoth ? '90mm' : order.prescription ? '100mm' : '113mm'

  const ACCENT = '#1a1a2e'

  // Table cell styles
  const thStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '1.8mm 2.5mm', textAlign: 'center', fontWeight: 800, fontSize: '8.5pt',
    color: '#fff', backgroundColor: ACCENT, border: '1.5px solid #000', ...extra
  })
  const tdStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '1.5mm 2.5mm', textAlign: 'center', fontSize: '9pt', fontWeight: 600, color: '#000',
    border: '1.5px solid #000', ...extra
  })

  // ─── Section title bar ─────────────────────────────────────────
  const sectionTitle = (label: string) => (
    <div style={{ fontSize: '7.5pt', fontWeight: 800, color: '#fff', backgroundColor: ACCENT, padding: '1mm 3mm', marginBottom: '2mm', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
      {label}
    </div>
  )

  // ─── Shared header ─────────────────────────────────────────────
  const renderHeader = (title: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3mm', paddingBottom: '2.5mm', borderBottom: `2.5px solid ${ACCENT}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '3mm' }}>
        {settings.logoUrl && (
          <img src={settings.logoUrl} alt="Logo" style={{ width: '12mm', height: '12mm', objectFit: 'contain', borderRadius: '1.5mm', border: `1px solid ${ACCENT}` }} />
        )}
        <div>
          <div style={{ fontSize: '12pt', fontWeight: 900, color: ACCENT, letterSpacing: '0.3px' }}>{settings.opticianName || 'OptiManage'}</div>
          {settings.opticianAddress && <div style={{ fontSize: '7pt', color: '#333', maxWidth: '55mm', fontWeight: 500, lineHeight: '1.3' }}>{settings.opticianAddress}</div>}
          {settings.opticianPhone && <div style={{ fontSize: '7.5pt', color: '#333', fontWeight: 600 }}>Tél: {settings.opticianPhone}</div>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '8pt', fontWeight: 800, color: '#fff', backgroundColor: ACCENT, padding: '1mm 4mm', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1.5mm' }}>{title}</div>
        <div style={{ fontSize: '15pt', fontWeight: 900, color: ACCENT, lineHeight: '1.1' }}>N° {order.orderNumber}</div>
        <div style={{ fontSize: '7.5pt', color: '#555', fontWeight: 500, marginTop: '0.5mm' }}>{formatDate(order.createdAt)}</div>
      </div>
    </div>
  )

  // ─── Payment block — bigger and clearer ────────────────────────
  const renderPayment = (big: boolean) => {
    const szLabel = big ? '10pt' : '9.5pt'
    const szValue = big ? '10.5pt' : '10pt'
    const szReste = big ? '11.5pt' : '11pt'
    return (
      <div style={{ borderTop: `2.5px solid ${ACCENT}`, paddingTop: '2.5mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5mm' }}>
          {order.expectedCompletionDate && (
            <div style={{ fontSize: big ? '9pt' : '8.5pt', fontWeight: 700, color: ACCENT, padding: '1.5mm 4mm', border: `2px solid ${ACCENT}`, display: 'inline-block' }}>
              📅 Prête: {formatReadyDate(order.expectedCompletionDate)}
            </div>
          )}
          <div style={{ display: 'inline-block', padding: '1.2mm 5mm', border: `2.5px solid ${ACCENT}`, fontSize: big ? '9pt' : '8.5pt', fontWeight: 900, color: ACCENT, letterSpacing: '1px', textAlign: 'center' }}>
            {paymentStatusText}
          </div>
        </div>
        <div style={{ minWidth: '45%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: `2px solid ${ACCENT}` }}>
            <tbody>
              <tr>
                <td style={{ padding: '1.5mm 4mm', fontSize: szLabel, fontWeight: 700, textAlign: 'left', borderBottom: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}` }}>Total</td>
                <td style={{ padding: '1.5mm 4mm', fontSize: szValue, fontWeight: 800, textAlign: 'right', borderBottom: `1.5px solid ${ACCENT}` }}>{formatCurrency(order.totalPrice)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1.5mm 4mm', fontSize: szLabel, fontWeight: 700, textAlign: 'left', borderBottom: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}` }}>Versé</td>
                <td style={{ padding: '1.5mm 4mm', fontSize: szValue, fontWeight: 800, textAlign: 'right', borderBottom: `1.5px solid ${ACCENT}` }}>{formatCurrency(totalPaid)}</td>
              </tr>
              <tr style={{ backgroundColor: ACCENT }}>
                <td style={{ padding: '2mm 4mm', fontSize: szReste, fontWeight: 900, textAlign: 'left', color: '#fff', borderRight: `1.5px solid #fff` }}>Reste</td>
                <td style={{ padding: '2mm 4mm', fontSize: szReste, fontWeight: 900, textAlign: 'right', color: '#fff' }}>{formatCurrency(balanceDue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ─── BON ATELIER ───────────────────────────────────────────────
  const renderAtelier = () => (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: '9pt', color: '#000', padding: '3mm 4mm', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderHeader('BON ATELIER')}

      {/* Client & Frame info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5mm', padding: '2mm 3mm', border: `1.5px solid ${ACCENT}`, borderLeft: `4px solid ${ACCENT}` }}>
        <div>
          <div style={{ fontSize: '7pt', fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client</div>
          <div style={{ fontWeight: 800, fontSize: '10.5pt', color: ACCENT }}>{customerName}</div>
          {order.customer?.phone && <div style={{ fontSize: '8.5pt', color: '#333', fontWeight: 600 }}>📞 {order.customer.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {order.frame && (
            <div>
              <div style={{ fontSize: '7pt', fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monture</div>
              <div style={{ fontSize: '9.5pt', fontWeight: 700, color: ACCENT }}>{order.frame.brand} {order.frame.model}</div>
              <div style={{ fontSize: '8pt', color: '#555', fontWeight: 500 }}>{order.frame.color}{order.frame.size ? ` — ${order.frame.size}` : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Prescription */}
      {order.prescription && (
        <>
          {sectionTitle('Ordonnance')}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2.5mm', border: `2px solid ${ACCENT}` }}>
            <thead>
              <tr>
                <th style={thStyle({ textAlign: 'left', width: '18%' })}></th>
                <th style={thStyle()}>Sph</th>
                <th style={thStyle()}>Cyl</th>
                <th style={thStyle()}>Axe</th>
                <th style={thStyle()}>Add</th>
              </tr>
            </thead>
            <tbody>
              {hasVL && (
                <>
                  <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VL OD</td><td style={tdStyle()}>{fmtRx(order.prescription.vlRightEyeSphere)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vlRightEyeCylinder)}</td><td style={tdStyle()}>{fmtAxis(order.prescription.vlRightEyeAxis)}</td><td style={tdStyle()}>-</td></tr>
                  <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VL OS</td><td style={tdStyle()}>{fmtRx(order.prescription.vlLeftEyeSphere)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vlLeftEyeCylinder)}</td><td style={tdStyle()}>{fmtAxis(order.prescription.vlLeftEyeAxis)}</td><td style={tdStyle()}>-</td></tr>
                </>
              )}
              {hasVP && (
                <>
                  <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VP OD</td><td style={tdStyle()}>{fmtRx(order.prescription.vpRightEyeSphere)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vpRightEyeCylinder)}</td><td style={tdStyle()}>{fmtAxis(order.prescription.vpRightEyeAxis)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vpRightEyeAdd)}</td></tr>
                  <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VP OS</td><td style={tdStyle()}>{fmtRx(order.prescription.vpLeftEyeSphere)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vpLeftEyeCylinder)}</td><td style={tdStyle()}>{fmtAxis(order.prescription.vpLeftEyeAxis)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vpLeftEyeAdd)}</td></tr>
                </>
              )}
              {order.prescription.pupillaryDistance && (
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>EP</td><td colSpan={4} style={tdStyle({ fontWeight: 700 })}>{order.prescription.pupillaryDistance} mm</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* Lens Types per eye */}
      {hasAnyLensType && (
        <>
          {sectionTitle('Verres')}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2.5mm', border: `2px solid ${ACCENT}` }}>
            <thead>
              <tr>
                <th style={thStyle({ textAlign: 'left', width: '18%' })}></th>
                <th style={thStyle()}>OD (Droit)</th>
                <th style={thStyle()}>OS (Gauche)</th>
              </tr>
            </thead>
            <tbody>
              {(order.vlRightEyeLensType || order.vlLeftEyeLensType) && (
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VL</td><td style={tdStyle()}>{order.vlRightEyeLensType?.name || '-'}</td><td style={tdStyle()}>{order.vlLeftEyeLensType?.name || '-'}</td></tr>
              )}
              {(order.vpRightEyeLensType || order.vpLeftEyeLensType) && (
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VP</td><td style={tdStyle()}>{order.vpRightEyeLensType?.name || '-'}</td><td style={tdStyle()}>{order.vpLeftEyeLensType?.name || '-'}</td></tr>
              )}
              {!order.vlRightEyeLensType && !order.vlLeftEyeLensType && !order.vpRightEyeLensType && !order.vpLeftEyeLensType && order.lensType && (
                <tr><td colSpan={3} style={tdStyle({ fontWeight: 700 })}>{order.lensType.name}</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* Notes / Services */}
      {order.technicalNotes && (
        <div style={{ fontSize: '8.5pt', color: '#000', marginBottom: '2mm', padding: '1.5mm 3mm', border: `1.5px solid ${ACCENT}`, borderLeft: `4px solid ${ACCENT}` }}>
          <strong>Notes:</strong> {order.technicalNotes}
        </div>
      )}

      <div style={{ flex: 1 }} />
      {renderPayment(false)}
    </div>
  )

  // ─── BON CLIENT (no prescription — just info, lens types, payment) ─
  const renderClient = () => (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: '9pt', color: '#000', padding: '3mm 4mm', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderHeader('BON CLIENT')}

      {/* Client & Frame info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3mm', padding: '2mm 3mm', border: `1.5px solid ${ACCENT}`, borderLeft: `4px solid ${ACCENT}` }}>
        <div>
          <div style={{ fontSize: '7pt', fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client</div>
          <div style={{ fontWeight: 800, fontSize: '10.5pt', color: ACCENT }}>{customerName}</div>
          {order.customer?.phone && <div style={{ fontSize: '8.5pt', color: '#333', fontWeight: 600 }}>📞 {order.customer.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {order.frame && (
            <div>
              <div style={{ fontSize: '7pt', fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monture</div>
              <div style={{ fontSize: '9.5pt', fontWeight: 700, color: ACCENT }}>{order.frame.brand} {order.frame.model}</div>
              <div style={{ fontSize: '8pt', color: '#555', fontWeight: 500 }}>{order.frame.color}{order.frame.size ? ` — ${order.frame.size}` : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Lens Types */}
      {hasAnyLensType && (
        <>
          {sectionTitle('Verres')}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3mm', border: `2px solid ${ACCENT}` }}>
            <thead>
              <tr>
                <th style={thStyle({ textAlign: 'left', width: '18%' })}></th>
                <th style={thStyle()}>OD (Droit)</th>
                <th style={thStyle()}>OS (Gauche)</th>
              </tr>
            </thead>
            <tbody>
              {(order.vlRightEyeLensType || order.vlLeftEyeLensType) && (
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VL</td><td style={tdStyle()}>{order.vlRightEyeLensType?.name || '-'}</td><td style={tdStyle()}>{order.vlLeftEyeLensType?.name || '-'}</td></tr>
              )}
              {(order.vpRightEyeLensType || order.vpLeftEyeLensType) && (
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VP</td><td style={tdStyle()}>{order.vpRightEyeLensType?.name || '-'}</td><td style={tdStyle()}>{order.vpLeftEyeLensType?.name || '-'}</td></tr>
              )}
              {!order.vlRightEyeLensType && !order.vlLeftEyeLensType && !order.vpRightEyeLensType && !order.vpLeftEyeLensType && order.lensType && (
                <tr><td colSpan={3} style={tdStyle({ fontWeight: 700 })}>{order.lensType.name}</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* Ready date highlight for client */}
      {order.expectedCompletionDate && (
        <div style={{ textAlign: 'center', marginBottom: '3mm', padding: '2mm 4mm', border: `2px solid ${ACCENT}`, fontSize: '10pt', fontWeight: 800, color: ACCENT }}>
          📅 Date de retrait: {formatReadyDate(order.expectedCompletionDate)}
        </div>
      )}

      <div style={{ flex: 1 }} />
      {renderPayment(true)}
    </div>
  )

  return (
    <div style={{ width: '100%', maxWidth: '148mm', minHeight: '210mm', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: atelierHeight, overflow: 'hidden' }}>
        {renderAtelier()}
      </div>

      {/* Cut line */}
      <div style={{ borderTop: `2px dashed ${ACCENT}`, margin: '0 4mm', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: '-6pt', left: '50%', transform: 'translateX(-50%)', padding: '0 3mm', fontSize: '7pt', color: ACCENT, fontWeight: 700, backgroundColor: 'white', letterSpacing: '1px' }}>✂ DÉCOUPER ICI</span>
      </div>

      <div style={{ height: clientHeight, overflow: 'hidden' }}>
        {renderClient()}
      </div>
    </div>
  )
}
