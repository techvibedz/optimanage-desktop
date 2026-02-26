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
  const statusColor = balanceDue <= 0 ? '#000' : totalPaid > 0 ? '#000' : '#000'

  const hasAnyLensType = order.vlRightEyeLensType || order.vlLeftEyeLensType || order.vpRightEyeLensType || order.vpLeftEyeLensType || order.lensType

  // Bold black borders for all table cells
  const thStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '1.5mm 2.5mm', textAlign: 'center', fontWeight: 800, fontSize: '8.5pt', color: '#000',
    border: '1.5px solid #000', ...extra
  })
  const tdStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '1.2mm 2.5mm', textAlign: 'center', fontSize: '9pt', fontWeight: 500, color: '#000',
    border: '1px solid #000', ...extra
  })

  // ─── Shared header ─────────────────────────────────────────────
  const renderHeader = (title: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3mm', paddingBottom: '2mm', borderBottom: '3px solid #000' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '3mm' }}>
        {settings.logoUrl && (
          <img src={settings.logoUrl} alt="Logo" style={{ width: '13mm', height: '13mm', objectFit: 'contain', borderRadius: '1mm' }} />
        )}
        <div>
          <div style={{ fontSize: '13pt', fontWeight: 900, color: '#000', letterSpacing: '0.3px' }}>{settings.opticianName || 'OptiManage'}</div>
          {settings.opticianAddress && <div style={{ fontSize: '7.5pt', color: '#000', maxWidth: '55mm', fontWeight: 500 }}>{settings.opticianAddress}</div>}
          {settings.opticianPhone && <div style={{ fontSize: '8pt', color: '#000', fontWeight: 600 }}>{settings.opticianPhone}</div>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '9pt', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid #000', paddingBottom: '1mm', marginBottom: '1mm' }}>{title}</div>
        <div style={{ fontSize: '16pt', fontWeight: 900, color: '#000', lineHeight: '1.1' }}>{order.orderNumber}</div>
        <div style={{ fontSize: '8pt', color: '#000', fontWeight: 500 }}>{formatDate(order.createdAt)}</div>
      </div>
    </div>
  )

  // ─── Payment footer ─────────────────────────────────────────────
  const renderPayment = (big: boolean) => {
    const sz = big ? '9.5pt' : '9pt'
    const szSm = big ? '9pt' : '8.5pt'
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '2px solid #000', paddingTop: '2mm' }}>
        <div>
          {order.expectedCompletionDate && (
            <div style={{ fontSize: big ? '9.5pt' : '9pt', fontWeight: 800, color: '#000', padding: '1.5mm 4mm', border: '2px solid #000' }}>
              Prête: {formatReadyDate(order.expectedCompletionDate)}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', minWidth: '40%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
            <tbody>
              <tr>
                <td style={{ padding: '1mm 3mm', fontSize: szSm, fontWeight: 700, textAlign: 'left', border: '1px solid #000' }}>Total</td>
                <td style={{ padding: '1mm 3mm', fontSize: szSm, fontWeight: 800, textAlign: 'right', border: '1px solid #000' }}>{formatCurrency(order.totalPrice)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1mm 3mm', fontSize: szSm, fontWeight: 700, textAlign: 'left', border: '1px solid #000' }}>Versé</td>
                <td style={{ padding: '1mm 3mm', fontSize: szSm, fontWeight: 800, textAlign: 'right', border: '1px solid #000' }}>{formatCurrency(totalPaid)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1.2mm 3mm', fontSize: sz, fontWeight: 900, textAlign: 'left', border: '1.5px solid #000' }}>Reste</td>
                <td style={{ padding: '1.2mm 3mm', fontSize: sz, fontWeight: 900, textAlign: 'right', border: '1.5px solid #000' }}>{formatCurrency(balanceDue)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'inline-block', marginTop: '1.5mm', padding: '1mm 5mm', border: '2.5px solid #000', fontSize: big ? '8.5pt' : '8pt', fontWeight: 900, color: '#000', letterSpacing: '0.5px' }}>{paymentStatusText}</div>
        </div>
      </div>
    )
  }

  // ─── BON ATELIER ───────────────────────────────────────────────
  const renderAtelier = () => (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: '9pt', color: '#000', padding: '3mm 4mm', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderHeader('BON ATELIER')}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5mm', padding: '1.5mm 3mm', border: '1.5px solid #000' }}>
        <div>
          <div style={{ fontSize: '7pt', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client</div>
          <div style={{ fontWeight: 800, fontSize: '10.5pt' }}>{customerName}</div>
          {order.customer?.phone && <div style={{ fontSize: '8.5pt', color: '#000', fontWeight: 600 }}>{order.customer.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {order.frame && (
            <div>
              <div style={{ fontSize: '7pt', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monture</div>
              <div style={{ fontSize: '9.5pt', fontWeight: 700 }}>{order.frame.brand} {order.frame.model}</div>
              <div style={{ fontSize: '8.5pt', color: '#000', fontWeight: 500 }}>{order.frame.color}{order.frame.size ? ` — ${order.frame.size}` : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Prescription */}
      {order.prescription && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2.5mm', border: '2px solid #000' }}>
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
            {order.prescription.hasVLData !== false && (
              <>
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VL OD</td><td style={tdStyle()}>{fmtRx(order.prescription.vlRightEyeSphere)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vlRightEyeCylinder)}</td><td style={tdStyle()}>{fmtAxis(order.prescription.vlRightEyeAxis)}</td><td style={tdStyle()}>-</td></tr>
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VL OS</td><td style={tdStyle()}>{fmtRx(order.prescription.vlLeftEyeSphere)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vlLeftEyeCylinder)}</td><td style={tdStyle()}>{fmtAxis(order.prescription.vlLeftEyeAxis)}</td><td style={tdStyle()}>-</td></tr>
              </>
            )}
            {order.prescription.hasVPData !== false && (
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
      )}

      {/* Lens Types per eye */}
      {hasAnyLensType && (
        <div style={{ marginBottom: '2.5mm' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
            <thead>
              <tr>
                <th style={thStyle({ textAlign: 'left', width: '18%' })}>Verres</th>
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
        </div>
      )}

      {/* Notes / Services */}
      {order.technicalNotes && (
        <div style={{ fontSize: '8.5pt', color: '#000', marginBottom: '2mm', padding: '1.5mm 3mm', border: '1.5px solid #000' }}>
          <strong>Notes / Services:</strong> {order.technicalNotes}
        </div>
      )}

      <div style={{ flex: 1 }} />
      {renderPayment(true)}
    </div>
  )

  // ─── BON CLIENT ────────────────────────────────────────────────
  const renderClient = () => (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: '9pt', color: '#000', padding: '3mm 4mm', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderHeader('BON CLIENT')}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5mm', padding: '1.5mm 3mm', border: '1.5px solid #000' }}>
        <div>
          <div style={{ fontSize: '7pt', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client</div>
          <div style={{ fontWeight: 800, fontSize: '10pt' }}>{customerName}</div>
          {order.customer?.phone && <div style={{ fontSize: '8.5pt', color: '#000', fontWeight: 600 }}>{order.customer.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {order.frame && (
            <div>
              <div style={{ fontSize: '7pt', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monture</div>
              <div style={{ fontSize: '9pt', fontWeight: 700 }}>{order.frame.brand} {order.frame.model}</div>
              <div style={{ fontSize: '8pt', color: '#000', fontWeight: 500 }}>{order.frame.color}{order.frame.size ? ` — ${order.frame.size}` : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Prescription for client */}
      {order.prescription && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2.5mm', border: '2px solid #000' }}>
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
            {order.prescription.hasVLData !== false && (
              <>
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VL OD</td><td style={tdStyle()}>{fmtRx(order.prescription.vlRightEyeSphere)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vlRightEyeCylinder)}</td><td style={tdStyle()}>{fmtAxis(order.prescription.vlRightEyeAxis)}</td><td style={tdStyle()}>-</td></tr>
                <tr><td style={tdStyle({ textAlign: 'left', fontWeight: 800 })}>VL OS</td><td style={tdStyle()}>{fmtRx(order.prescription.vlLeftEyeSphere)}</td><td style={tdStyle()}>{fmtRx(order.prescription.vlLeftEyeCylinder)}</td><td style={tdStyle()}>{fmtAxis(order.prescription.vlLeftEyeAxis)}</td><td style={tdStyle()}>-</td></tr>
              </>
            )}
            {order.prescription.hasVPData !== false && (
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
      )}

      {/* Lens Types */}
      {hasAnyLensType && (
        <div style={{ marginBottom: '2.5mm' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
            <thead>
              <tr>
                <th style={thStyle({ textAlign: 'left', width: '18%' })}>Verres</th>
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
        </div>
      )}

      <div style={{ flex: 1 }} />
      {renderPayment(false)}
    </div>
  )

  return (
    <div style={{ width: '100%', maxWidth: '148mm', minHeight: '210mm', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '108mm', overflow: 'hidden' }}>
        {renderAtelier()}
      </div>

      {/* Cut line — print-safe: dashed border */}
      <div style={{ borderTop: '2.5px dashed #000', margin: '0 4mm', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: '-6pt', left: '50%', transform: 'translateX(-50%)', padding: '0 3mm', fontSize: '7.5pt', color: '#000', fontWeight: 700, backgroundColor: 'white' }}>✂ ── DÉCOUPER ICI ──</span>
      </div>

      <div style={{ height: '100mm', overflow: 'hidden' }}>
        {renderClient()}
      </div>
    </div>
  )
}
