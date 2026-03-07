import { useSettings } from '@/lib/settings-context'
import { useTranslation } from '@/lib/use-translation'
import { useRef, useLayoutEffect, useState } from 'react'

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

  const fmt = (n: number) => new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' DA'
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  const fmtReady = (d: string) => {
    const dt = new Date(d)
    const day = dt.toLocaleDateString(locale, { weekday: 'long' })
    return `${day.charAt(0).toUpperCase() + day.slice(1)} ${dt.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  const rx = (v?: number) => v == null ? '-' : (v > 0 ? '+' : '') + v.toFixed(2)
  const ax = (v?: number) => v == null ? '-' : v.toFixed(0) + '\u00B0'
  const name = `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || 'N/A'

  const paid = order.depositAmount || 0
  const reste = Math.max(0, order.totalPrice - paid)
  const status = reste <= 0 ? 'PAYE' : paid > 0 ? 'PARTIEL' : 'IMPAYE'

  const hasLens = order.vlRightEyeLensType || order.vlLeftEyeLensType || order.vpRightEyeLensType || order.vpLeftEyeLensType || order.lensType
  const hasVL = order.prescription && order.prescription.hasVLData !== false
  const hasVP = order.prescription && order.prescription.hasVPData !== false
  const hasBoth = hasVL && hasVP
  const hasRx = !!order.prescription
  const hasNotes = !!(order.technicalNotes || order.notes)

  // 3-tier sizing: compact (VL+VP) → normal (has prescription) → relaxed (no prescription)
  const compact = hasBoth
  const normal = !compact && hasRx
  const relaxed = !compact && !normal

  // Font/padding helpers based on tier
  const fs = (c: string, n: string, r: string) => compact ? c : normal ? n : r

  // ── Shared styles ──
  const F: React.CSSProperties = { fontFamily: "'Segoe UI', Arial, sans-serif", color: '#000', boxSizing: 'border-box' }
  const cellPad = fs('0.5mm 1mm', '0.8mm 1.5mm', '1.2mm 2mm')
  const cell: React.CSSProperties = { border: '1px solid #000', padding: cellPad, textAlign: 'center', fontSize: fs('7.5pt', '8.5pt', '10pt'), fontWeight: 700, lineHeight: '1.2' }
  const hCell: React.CSSProperties = { ...cell, fontWeight: 800, fontSize: fs('6.5pt', '7.5pt', '8.5pt'), borderBottom: '2px solid #000' }

  // ── Header row content ──
  const HeaderContent = ({ label }: { label: string }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <td style={{ verticalAlign: 'middle', width: settings.logoUrl ? '12mm' : '0' }}>
            {settings.logoUrl && <img src={settings.logoUrl} alt="" style={{ width: fs('9mm', '10mm', '11mm'), height: fs('9mm', '10mm', '11mm'), objectFit: 'contain' }} />}
          </td>
          <td style={{ verticalAlign: 'middle', paddingLeft: '2mm' }}>
            <div style={{ fontSize: fs('9.5pt', '10pt', '11pt'), fontWeight: 800, lineHeight: '1.2' }}>{settings.opticianName || 'OptiManage'}</div>
            {settings.opticianAddress && <div style={{ fontSize: fs('5.5pt', '6.5pt', '7pt'), color: '#444', lineHeight: '1.1', maxWidth: '50mm', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{settings.opticianAddress}</div>}
            {settings.opticianPhone && <div style={{ fontSize: fs('6pt', '6.5pt', '7.5pt'), color: '#444' }}>{settings.opticianPhone}</div>}
          </td>
          <td style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: fs('6.5pt', '7pt', '8pt'), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.5mm' }}>{label}</div>
            <div style={{ fontSize: fs('12pt', '13pt', '15pt'), fontWeight: 900, lineHeight: '1' }}>{order.orderNumber}</div>
            <div style={{ fontSize: fs('6pt', '6.5pt', '7.5pt'), color: '#555', marginTop: '0.5mm' }}>{fmtDate(order.createdAt)}</div>
          </td>
        </tr>
      </tbody>
    </table>
  )

  // ── Info row content (client + frame) ──
  const InfoContent = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
      <tbody>
        <tr>
          <td style={{ padding: fs('0.8mm 1.5mm', '1mm 2mm', '1.5mm 2.5mm'), verticalAlign: 'top', width: '50%', borderRight: '1px solid #000' }}>
            <div style={{ fontSize: fs('5.5pt', '6pt', '7pt'), fontWeight: 700, textTransform: 'uppercase', color: '#666', letterSpacing: '0.3px' }}>Client</div>
            <div style={{ fontSize: fs('8pt', '9pt', '10pt'), fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '60mm' }}>{name}</div>
            {order.customer?.phone && <div style={{ fontSize: fs('6.5pt', '7pt', '8pt'), color: '#333' }}>{order.customer.phone}</div>}
          </td>
          <td style={{ padding: fs('0.8mm 1.5mm', '1mm 2mm', '1.5mm 2.5mm'), verticalAlign: 'top', width: '50%' }}>
            {order.frame ? (
              <>
                <div style={{ fontSize: fs('5.5pt', '6pt', '7pt'), fontWeight: 700, textTransform: 'uppercase', color: '#666', letterSpacing: '0.3px' }}>Monture</div>
                <div style={{ fontSize: fs('7.5pt', '8.5pt', '9.5pt'), fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '60mm' }}>{order.frame.brand} {order.frame.model}</div>
                <div style={{ fontSize: fs('6pt', '6.5pt', '7.5pt'), color: '#555' }}>{order.frame.color}{order.frame.size ? ` - ${order.frame.size}` : ''}</div>
              </>
            ) : (
              <div style={{ fontSize: fs('6.5pt', '7pt', '8pt'), color: '#999' }}>Pas de monture</div>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  )

  // ── Prescription table content ──
  const PrescriptionContent = () => {
    if (!order.prescription) return null
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
        <thead>
          <tr>
            <th style={{ ...hCell, width: '15%', textAlign: 'left' }}></th>
            <th style={hCell}>Sph</th>
            <th style={hCell}>Cyl</th>
            <th style={hCell}>Axe</th>
            <th style={hCell}>Add</th>
          </tr>
        </thead>
        <tbody>
          {hasVL && (
            <>
              <tr>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>VL OD</td>
                <td style={cell}>{rx(order.prescription.vlRightEyeSphere)}</td>
                <td style={cell}>{rx(order.prescription.vlRightEyeCylinder)}</td>
                <td style={cell}>{ax(order.prescription.vlRightEyeAxis)}</td>
                <td style={cell}>-</td>
              </tr>
              <tr>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>VL OS</td>
                <td style={cell}>{rx(order.prescription.vlLeftEyeSphere)}</td>
                <td style={cell}>{rx(order.prescription.vlLeftEyeCylinder)}</td>
                <td style={cell}>{ax(order.prescription.vlLeftEyeAxis)}</td>
                <td style={cell}>-</td>
              </tr>
            </>
          )}
          {hasVP && (
            <>
              <tr>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>VP OD</td>
                <td style={cell}>{rx(order.prescription.vpRightEyeSphere)}</td>
                <td style={cell}>{rx(order.prescription.vpRightEyeCylinder)}</td>
                <td style={cell}>{ax(order.prescription.vpRightEyeAxis)}</td>
                <td style={cell}>{rx(order.prescription.vpRightEyeAdd)}</td>
              </tr>
              <tr>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>VP OS</td>
                <td style={cell}>{rx(order.prescription.vpLeftEyeSphere)}</td>
                <td style={cell}>{rx(order.prescription.vpLeftEyeCylinder)}</td>
                <td style={cell}>{ax(order.prescription.vpLeftEyeAxis)}</td>
                <td style={cell}>{rx(order.prescription.vpLeftEyeAdd)}</td>
              </tr>
            </>
          )}
          {order.prescription.pupillaryDistance && (
            <tr>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>EP</td>
              <td colSpan={4} style={{ ...cell, fontWeight: 600 }}>{order.prescription.pupillaryDistance} mm</td>
            </tr>
          )}
        </tbody>
      </table>
    )
  }

  // ── Lens types table content ──
  const LensContent = () => {
    if (!hasLens) return null
    const lensFs = fs('7.5pt', '8.5pt', '9.5pt')
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
        <thead>
          <tr>
            <th style={{ ...hCell, width: '15%', textAlign: 'left' }}>Verres</th>
            <th style={hCell}>OD</th>
            <th style={hCell}>OS</th>
          </tr>
        </thead>
        <tbody>
          {(order.vlRightEyeLensType || order.vlLeftEyeLensType) && (
            <tr>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>VL</td>
              <td style={{ ...cell, fontSize: lensFs, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '45mm' }}>{order.vlRightEyeLensType?.name || '-'}</td>
              <td style={{ ...cell, fontSize: lensFs, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '45mm' }}>{order.vlLeftEyeLensType?.name || '-'}</td>
            </tr>
          )}
          {(order.vpRightEyeLensType || order.vpLeftEyeLensType) && (
            <tr>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>VP</td>
              <td style={{ ...cell, fontSize: lensFs, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '45mm' }}>{order.vpRightEyeLensType?.name || '-'}</td>
              <td style={{ ...cell, fontSize: lensFs, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '45mm' }}>{order.vpLeftEyeLensType?.name || '-'}</td>
            </tr>
          )}
          {!order.vlRightEyeLensType && !order.vlLeftEyeLensType && !order.vpRightEyeLensType && !order.vpLeftEyeLensType && order.lensType && (
            <tr><td colSpan={3} style={{ ...cell, fontWeight: 600 }}>{order.lensType.name}</td></tr>
          )}
        </tbody>
      </table>
    )
  }

  // ── Payment summary ──
  const PaymentBlock = ({ large }: { large: boolean }) => {
    const s1 = large ? '10pt' : fs('7.5pt', '8.5pt', '9.5pt')
    const s2 = large ? '11pt' : fs('8pt', '9pt', '10pt')
    const s3 = large ? '12pt' : fs('9pt', '10pt', '11pt')
    const cellP = fs('0.8mm 1.5mm', '1mm 2mm', '1.5mm 3mm')
    const resteP = fs('1mm 1.5mm', '1.5mm 2mm', '2mm 3mm')
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
        <tbody>
          <tr>
            <td style={{ padding: cellP, fontSize: s1, fontWeight: 600, borderBottom: '1px solid #000', borderRight: '1px solid #000', width: '30%' }}>Total</td>
            <td style={{ padding: cellP, fontSize: s2, fontWeight: 700, textAlign: 'right', borderBottom: '1px solid #000' }}>{fmt(order.totalPrice)}</td>
          </tr>
          <tr>
            <td style={{ padding: cellP, fontSize: s1, fontWeight: 600, borderBottom: '2px solid #000', borderRight: '1px solid #000' }}>Avance</td>
            <td style={{ padding: cellP, fontSize: s2, fontWeight: 700, textAlign: 'right', borderBottom: '2px solid #000' }}>{fmt(paid)}</td>
          </tr>
          <tr>
            <td style={{ padding: resteP, fontSize: s3, fontWeight: 900, borderRight: '1px solid #000' }}>RESTE</td>
            <td style={{ padding: resteP, fontSize: s3, fontWeight: 900, textAlign: 'right' }}>{fmt(reste)}</td>
          </tr>
        </tbody>
      </table>
    )
  }

  // ── Footer content ──
  const FooterContent = ({ large }: { large: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '3mm' }}>
      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: fs('0.8mm', '1mm', '1.5mm') }}>
        {order.expectedCompletionDate && (
          <div style={{ fontSize: large ? '9pt' : fs('7pt', '7.5pt', '8.5pt'), fontWeight: 700, border: '1.5px solid #000', padding: fs('0.5mm 1.5mm', '0.8mm 2mm', '1.2mm 3mm'), whiteSpace: 'nowrap' }}>
            Prete: {fmtReady(order.expectedCompletionDate)}
          </div>
        )}
        <div style={{ fontSize: large ? '10pt' : fs('7.5pt', '8pt', '9pt'), fontWeight: 900, border: '2px solid #000', padding: fs('0.5mm 3mm', '0.8mm 4mm', '1.2mm 5mm'), textAlign: 'center', letterSpacing: '0.5px' }}>
          {status}
        </div>
      </div>
      <div style={{ flex: '1 1 auto', maxWidth: '55%' }}>
        <PaymentBlock large={large} />
      </div>
    </div>
  )

  // ═══════ HALF-PAGE: measures content then scales up to fill container ═══════
  const gap = fs('0.5mm', '1mm', '1.5mm')
  const px = fs('2.5mm', '3mm', '4mm')

  const HalfPage = ({ label, showPrescription, showReadyDate, largeFooter }: {
    label: string; showPrescription: boolean; showReadyDate: boolean; largeFooter: boolean
  }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)

    useLayoutEffect(() => {
      const measure = () => {
        if (containerRef.current && contentRef.current) {
          const cH = containerRef.current.offsetHeight
          const tH = contentRef.current.offsetHeight
          if (tH > 0 && cH > tH) {
            setScale(Math.min(cH / tH, 1.6))
          } else {
            setScale(1)
          }
        }
      }
      measure()
      const t = setTimeout(measure, 150)
      return () => clearTimeout(t)
    }, [order, label])

    return (
      <div ref={containerRef} style={{ ...F, height: '100%', overflow: 'hidden' }}>
        <div ref={contentRef} style={{
          padding: `${fs('1.5mm', '2mm', '2.5mm')} ${px}`,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          width: `${100 / scale}%`,
        }}>
          <HeaderContent label={label} />
          <div style={{ borderBottom: '2px solid #000', margin: `${gap} 0` }} />
          <InfoContent />

          {showPrescription && order.prescription && (
            <div style={{ marginTop: gap }}><PrescriptionContent /></div>
          )}

          {hasLens && (
            <div style={{ marginTop: gap }}><LensContent /></div>
          )}

          {showPrescription && hasNotes && order.technicalNotes && (
            <div style={{ marginTop: gap, fontSize: fs('6.5pt', '7pt', '7.5pt'), border: '1px solid #000', padding: '0.5mm 2mm', overflow: 'hidden', maxHeight: fs('5mm', '6mm', '8mm'), lineHeight: '1.2' }}>
              <strong>Notes:</strong> {order.technicalNotes}
            </div>
          )}

          {showReadyDate && order.expectedCompletionDate && (
            <div style={{ marginTop: gap, textAlign: 'center', border: '2px solid #000', padding: fs('0.8mm 1.5mm', '1.5mm 2mm', '2mm 3mm'), fontSize: fs('7.5pt', '8.5pt', '9.5pt'), fontWeight: 800 }}>
              Date de retrait: {fmtReady(order.expectedCompletionDate)}
            </div>
          )}

          <div style={{ marginTop: gap }}>
            <FooterContent large={largeFooter} />
          </div>
        </div>
      </div>
    )
  }

  // ═══════ Full A5 Layout ═══════
  // Atelier always gets more space (flex 3 ≈ 60%) since it has prescription + notes
  // Client gets less space (flex 2 ≈ 40%) — header, lenses, ready date, footer only
  return (
    <div style={{ width: '148mm', height: '210mm', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top half — BON ATELIER (bigger) */}
      <div style={{ flex: '3 1 0%', minHeight: 0, overflow: 'hidden' }}>
        <HalfPage label="BON ATELIER" showPrescription={true} showReadyDate={false} largeFooter={false} />
      </div>

      {/* Separator — fixed thin line */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', margin: '0 3mm', padding: '0.5mm 0' }}>
        <div style={{ flex: 1, borderTop: '1.5px dashed #000' }} />
        <div style={{ padding: '0 2mm', fontSize: '6pt', fontWeight: 600, color: '#555', whiteSpace: 'nowrap' }}>DECOUPER ICI</div>
        <div style={{ flex: 1, borderTop: '1.5px dashed #000' }} />
      </div>

      {/* Bottom half — BON CLIENT (smaller) */}
      <div style={{ flex: '2 1 0%', minHeight: 0, overflow: 'hidden' }}>
        <HalfPage label="BON CLIENT" showPrescription={false} showReadyDate={true} largeFooter={false} />
      </div>
    </div>
  )
}
