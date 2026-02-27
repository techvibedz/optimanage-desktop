import React, { useState, useEffect } from 'react'
import { useSettings } from '@/lib/settings-context'

interface OrderItem {
  name: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  lensType?: string
  contactLensId?: string
}

interface AlgerianFactureProps {
  order: {
    id: string
    orderNumber: string
    customer: {
      name?: string
      firstName?: string
      lastName?: string
      phone?: string
      email?: string
      address?: string
    }
    frame?: {
      brand: string
      model: string
      color: string
      size?: string
      sellingPrice: number
    }
    lensType?: { id: string; name: string; category?: string; material?: string; index?: number }
    vlLeftEyeLensType?: { id: string; name: string; category?: string; material?: string; index?: number }
    vlRightEyeLensType?: { id: string; name: string; category?: string; material?: string; index?: number }
    vpLeftEyeLensType?: { id: string; name: string; category?: string; material?: string; index?: number }
    vpRightEyeLensType?: { id: string; name: string; category?: string; material?: string; index?: number }
    vlLeftEyeLensQuantity?: number
    vlRightEyeLensQuantity?: number
    vpLeftEyeLensQuantity?: number
    vpRightEyeLensQuantity?: number
    vlRightEyeLensPrice?: number
    vlLeftEyeLensPrice?: number
    vpRightEyeLensPrice?: number
    vpLeftEyeLensPrice?: number
    framePrice?: number
    lensTypePrice?: number
    lensPrice?: number
    totalPrice: number
    depositAmount: number
    balanceDue: number
    expectedCompletionDate: string
    createdAt: string
    notes?: string
    technicalNotes?: string
    addons?: Array<{ id: string; name: string; price?: number; sellingPrice?: number }>
    payments?: Array<{ id: string; amount: number; paymentMethod: string; paymentDate: string; receiptNumber: string }>
  }
  onClose?: () => void
}

export default function AlgerianFacture({ order, onClose }: AlgerianFactureProps) {
  const { settings } = useSettings()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 0 }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR')
  }

  const getCustomerName = () => {
    if (order.customer?.name) return order.customer.name
    if (order.customer?.firstName && order.customer?.lastName) return `${order.customer.firstName} ${order.customer.lastName}`
    return 'N/A'
  }

  // State for editable prices
  const [framePrice, setFramePrice] = useState<number | undefined>(order.frame?.sellingPrice || 0)
  const [lensPrices, setLensPrices] = useState<Record<string, number | undefined>>({})
  const [additionalFrames, setAdditionalFrames] = useState<Array<{ id: string; brand: string; model: string; color: string; size?: string; price: number | undefined }>>([])

  // State for contact lenses
  const [contactLenses, setContactLenses] = useState<Array<{ id: string; brand: string; type: string; power: string; eye: 'OD' | 'OG' | 'Both'; price: number | undefined }>>([])

  // State for lens visibility (to allow deletion)
  const [hiddenLenses, setHiddenLenses] = useState<Set<string>>(new Set())

  // Initialize lens prices
  useEffect(() => {
    const initialLensPrices: Record<string, number | undefined> = {}
    const addonsTotal = order.addons?.reduce((sum: number, addon) => sum + (addon.price || 0), 0) || 0

    let lensCount = 0
    if (order.vlRightEyeLensType) lensCount++
    if (order.vlLeftEyeLensType) lensCount++
    if (order.vpRightEyeLensType) lensCount++
    if (order.vpLeftEyeLensType) lensCount++
    if (order.lensType && !order.vlRightEyeLensType && !order.vlLeftEyeLensType && !order.vpRightEyeLensType && !order.vpLeftEyeLensType) {
      lensCount += getLensQuantity()
    }

    const addonPerLens = lensCount > 0 ? addonsTotal / lensCount : 0

    if (order.vlRightEyeLensType) initialLensPrices['vlRight'] = (order.vlRightEyeLensPrice || 0) + addonPerLens
    if (order.vlLeftEyeLensType) initialLensPrices['vlLeft'] = (order.vlLeftEyeLensPrice || 0) + addonPerLens
    if (order.vpRightEyeLensType) initialLensPrices['vpRight'] = (order.vpRightEyeLensPrice || 0) + addonPerLens
    if (order.vpLeftEyeLensType) initialLensPrices['vpLeft'] = (order.vpLeftEyeLensPrice || 0) + addonPerLens

    if (order.lensType && !order.vlRightEyeLensType && !order.vlLeftEyeLensType && !order.vpRightEyeLensType && !order.vpLeftEyeLensType) {
      initialLensPrices['general'] = (order.lensTypePrice || order.lensPrice || 0) + addonPerLens
    }

    setLensPrices(initialLensPrices)
  }, [order])

  const getLensQuantity = (): number => {
    let count = 0
    if (order.vlRightEyeLensType) count++
    if (order.vlLeftEyeLensType) count++
    if (order.vpRightEyeLensType) count++
    if (order.vpLeftEyeLensType) count++
    if (count === 0 && order.lensType) return 2
    return count || 0
  }

  const getCalculatedTotalPrice = () => {
    const frameTotal = (framePrice || 0) + additionalFrames.reduce((sum: number, f) => sum + (f.price || 0), 0)
    const lensTotal = Object.values(lensPrices).reduce((sum: number, p) => sum + (p || 0), 0)
    const contactLensTotal = contactLenses.reduce((sum: number, l) => sum + (l.price || 0), 0)
    return frameTotal + lensTotal + contactLensTotal
  }

  const handleFramePriceChange = (value: string) => { setFramePrice(value === '' ? undefined : parseFloat(value)) }
  const handleLensPriceChange = (lensType: string, value: string) => { setLensPrices(prev => ({ ...prev, [lensType]: value === '' ? undefined : parseFloat(value) })) }
  const handleAdditionalFramePriceChange = (index: number, value: string) => { setAdditionalFrames(prev => prev.map((f, i) => i === index ? { ...f, price: parseFloat(value) || 0 } : f)) }
  const handleAdditionalFrameDescriptionChange = (frameId: string, field: 'brand' | 'model' | 'color' | 'size', value: string) => { setAdditionalFrames(prev => prev.map(f => f.id === frameId ? { ...f, [field]: value } : f)) }

  const handleAddFrame = () => { setAdditionalFrames(prev => [...prev, { id: `frame-${Date.now()}`, brand: 'Marque', model: 'Modèle', color: 'Couleur', price: undefined }]) }
  const handleRemoveAdditionalFrame = (frameId: string) => { setAdditionalFrames(prev => prev.filter(f => f.id !== frameId)) }

  const handleAddContactLens = () => { setContactLenses(prev => [...prev, { id: `cl-${Date.now()}`, brand: 'Marque', type: 'Type', power: 'Puissance', eye: 'OD', price: undefined }]) }
  const handleRemoveContactLens = (lensId: string) => { setContactLenses(prev => prev.filter(l => l.id !== lensId)) }
  const handleContactLensChange = (lensId: string, field: string, value: string | number) => { setContactLenses(prev => prev.map(l => l.id === lensId ? { ...l, [field]: value } : l)) }

  const handleDeleteLens = (lensType: string) => { setHiddenLenses(prev => new Set([...prev, lensType])); setLensPrices(prev => { const n = { ...prev }; delete n[lensType]; return n }) }
  const isLensHidden = (lensType: string) => hiddenLenses.has(lensType)

  const calculatedTotalPrice = getCalculatedTotalPrice()
  const totalPaid = order.payments?.reduce((sum: number, p) => sum + p.amount, 0) || 0

  const orderItems: OrderItem[] = [
    ...(order.frame ? [{ name: 'Monture', description: `${order.frame.brand} ${order.frame.model} - ${order.frame.color}${order.frame.size ? ` - ${order.frame.size}` : ''}`, quantity: 1, unitPrice: framePrice || 0, totalPrice: framePrice || 0 }] : []),
    ...additionalFrames.map(f => ({ name: 'Monture supplémentaire', description: `${f.brand} ${f.model} - ${f.color}${f.size ? ` - ${f.size}` : ''}`, quantity: 1, unitPrice: f.price || 0, totalPrice: f.price || 0 })),
    ...(order.vlRightEyeLensType && !isLensHidden('vlRight') ? [{ name: 'Verre OD VL', description: `${order.vlRightEyeLensType.name}${order.addons && order.addons.length > 0 ? ' + Services additionnels' : ''}`, quantity: 1, unitPrice: lensPrices['vlRight'] || 0, totalPrice: lensPrices['vlRight'] || 0, lensType: 'vlRight' }] : []),
    ...(order.vlLeftEyeLensType && !isLensHidden('vlLeft') ? [{ name: 'Verre OG VL', description: `${order.vlLeftEyeLensType.name}${order.addons && order.addons.length > 0 ? ' + Services additionnels' : ''}`, quantity: 1, unitPrice: lensPrices['vlLeft'] || 0, totalPrice: lensPrices['vlLeft'] || 0, lensType: 'vlLeft' }] : []),
    ...(order.vpRightEyeLensType && !isLensHidden('vpRight') ? [{ name: 'Verre OD VP', description: `${order.vpRightEyeLensType.name}${order.addons && order.addons.length > 0 ? ' + Services additionnels' : ''}`, quantity: 1, unitPrice: lensPrices['vpRight'] || 0, totalPrice: lensPrices['vpRight'] || 0, lensType: 'vpRight' }] : []),
    ...(order.vpLeftEyeLensType && !isLensHidden('vpLeft') ? [{ name: 'Verre OG VP', description: `${order.vpLeftEyeLensType.name}${order.addons && order.addons.length > 0 ? ' + Services additionnels' : ''}`, quantity: 1, unitPrice: lensPrices['vpLeft'] || 0, totalPrice: lensPrices['vpLeft'] || 0, lensType: 'vpLeft' }] : []),
    ...(order.lensType && !order.vlRightEyeLensType && !order.vlLeftEyeLensType && !order.vpRightEyeLensType && !order.vpLeftEyeLensType && !isLensHidden('general') ? [{ name: 'Verres', description: `${order.lensType.name}${order.addons && order.addons.length > 0 ? ' + Services additionnels' : ''}`, quantity: getLensQuantity(), unitPrice: (lensPrices['general'] || 0) / getLensQuantity(), totalPrice: lensPrices['general'] || 0, lensType: 'general' }] : []),
    ...contactLenses.map(l => ({ name: 'Lentille de Contact', description: `${l.brand} ${l.type} - ${l.power} (${l.eye})`, quantity: 1, unitPrice: l.price || 0, totalPrice: l.price || 0, contactLensId: l.id })),
  ]

  return (
    <>
      <div className="professional-invoice">
        <style>{`
          .professional-invoice {
            width: 138mm;
            min-height: 202mm;
            margin: 0 auto;
            padding: 6mm;
            background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
            font-family: 'Georgia', 'Times New Roman', serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #2c3e50;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            border-radius: 12px;
            border: 1px solid #e8f4f8;
          }
          .invoice-header {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 10mm;
            margin-bottom: 6mm;
            padding-bottom: 4mm;
            border-bottom: 3px double #3498db;
            background: linear-gradient(90deg, #ecf0f1 0%, #ffffff 100%);
            border-radius: 8px;
            padding: 4mm;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          }
          .company-info {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: #ecf0f1;
            padding: 5mm 6mm;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
            border-left: 4px solid #3498db;
          }
          .company-name { font-size: 16pt; font-weight: 700; margin-bottom: 3mm; line-height: 1.2; letter-spacing: 0.5px; text-shadow: 1px 1px 2px rgba(0,0,0,0.3); }
          .company-details { font-size: 9pt; line-height: 1.5; opacity: 0.95; font-family: 'Arial', sans-serif; }
          .invoice-meta {
            text-align: left;
            min-width: 85mm;
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            padding: 4mm 5mm;
            border-radius: 8px;
            border: 2px solid #3498db;
            box-shadow: 0 2px 4px rgba(52, 152, 219, 0.1);
          }
          .invoice-title { font-size: 20pt; font-weight: 700; color: #2c3e50; margin-bottom: 4mm; line-height: 1; letter-spacing: 1px; text-transform: uppercase; text-align: center; border-bottom: 2px solid #3498db; padding-bottom: 2mm; }
          .meta-item { display: flex; justify-content: space-between; margin-bottom: 1mm; font-size: 8pt; line-height: 1.4; }
          .meta-label { font-weight: 600; color: #475569; margin-right: 3mm; }
          .meta-value { font-weight: 500; color: #1e293b; }
          .section { margin-bottom: 5mm; background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); border-radius: 8px; padding: 3mm; border: 1px solid #e8f4f8; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          .section-title { font-size: 12pt; font-weight: 700; color: #2c3e50; margin-bottom: 3mm; padding-bottom: 2mm; border-bottom: 2px solid #3498db; display: flex; align-items: center; text-transform: uppercase; letter-spacing: 0.5px; }
          .section-title::before { content: ''; width: 4mm; height: 3px; background: #e74c3c; margin-right: 3mm; border-radius: 2px; }
          .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
          .client-info { background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); padding: 3mm 4mm; border-radius: 6px; border: 1px solid #e8f4f8; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          .info-item { margin-bottom: 2mm; line-height: 1.5; border-left: 3px solid #3498db; padding-left: 3mm; }
          .info-label { font-weight: 700; color: #34495e; font-size: 9pt; margin-bottom: 1mm; text-transform: uppercase; letter-spacing: 0.3px; }
          .info-value { color: #2c3e50; font-weight: 600; font-size: 10pt; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; background: white; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .items-table th { background: linear-gradient(135deg, #10b981, #059669); color: white; font-weight: 600; padding: 2mm 3mm; text-align: left; font-size: 8pt; letter-spacing: 0.02em; }
          .items-table td { padding: 1.5mm 3mm; border-bottom: 1px solid #e2e8f0; font-size: 8pt; line-height: 1.4; }
          .items-table tr:last-child td { border-bottom: none; }
          .items-table td:last-child { text-align: right; font-weight: 600; color: #1e293b; }
          .price-input { width: 80px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 0.85em; text-align: right; }
          .price-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 1px #3b82f6; }
          .add-frame-btn { background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.85em; cursor: pointer; margin-top: 4px; }
          .add-frame-btn:hover { background: #2563eb; }
          .add-contact-lens-btn { background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.85em; cursor: pointer; margin-top: 4px; }
          .add-contact-lens-btn:hover { background: #059669; }
          .remove-frame-btn, .remove-contact-lens-btn { background: #ef4444; color: white; border: none; padding: 2px 6px; border-radius: 3px; font-size: 0.75em; cursor: pointer; margin-left: 4px; }
          .remove-frame-btn:hover, .remove-contact-lens-btn:hover { background: #dc2626; }
          .remove-lens-btn { background: #f59e0b; color: white; border: none; padding: 2px 6px; border-radius: 3px; font-size: 0.75em; cursor: pointer; margin-left: 4px; }
          .remove-lens-btn:hover { background: #d97706; }
          .summary-grid { display: grid; grid-template-columns: 1fr 1.8fr; gap: 4mm; margin-bottom: 4mm; }
          .payment-history { background: #ffffff; border: 1px solid #e5e5e5; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
          .payment-table { width: 100%; border-collapse: separate; border-spacing: 0; background: transparent; }
          .payment-table th { background: #f8fafc; color: #1a1a1a; font-weight: 600; padding: 2mm 3mm; text-align: left; font-size: 8pt; border-bottom: 2px solid #e5e5e5; }
          .payment-table td { padding: 1.5mm 3mm; border-bottom: 1px solid #f0f0f0; font-size: 8pt; line-height: 1.4; background: transparent; }
          .payment-table td:last-child { text-align: right; font-weight: 600; color: #059669; }
          .payment-table tr:last-child td { border-bottom: none; background: #f0f9ff; font-weight: 700; color: #0369a1; }
          .totals-card { background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); padding: 4mm 5mm; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e8f4f8; }
          .totals-title { font-size: 12pt; font-weight: 700; margin-bottom: 3mm; text-align: left; color: #2c3e50; padding-bottom: 2mm; border-bottom: 2px solid #3498db; display: flex; align-items: center; text-transform: uppercase; letter-spacing: 0.5px; }
          .totals-title::before { content: ''; width: 4mm; height: 3px; background: #e74c3c; margin-right: 3mm; border-radius: 2px; }
          .totals-row { display: flex; justify-content: space-between; margin-bottom: 2mm; font-size: 10pt; line-height: 1.5; padding: 2mm 0; border-bottom: 1px solid #e8f4f8; color: #2c3e50; border-left: 3px solid #3498db; padding-left: 3mm; }
          .totals-row.final { font-size: 11pt; font-weight: 700; border-top: 2px solid #3498db; border-bottom: none; padding-top: 3mm; margin-top: 3mm; color: #2c3e50; background: linear-gradient(135deg, #e8f4f8 0%, #d1ecf1 100%); border-radius: 4px; padding: 3mm 4mm; margin-left: -2mm; margin-right: -2mm; border-left: 4px solid #e74c3c; }
          .signature-area { margin-top: 20px; border-top: 2px solid #3498db; padding-top: 16px; font-weight: 700; color: #2c3e50; text-align: center; font-size: 12px; letter-spacing: 0.5px; background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); border-radius: 8px; padding: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e8f4f8; }
          @media print {
            @page { size: A5 portrait; margin: 0; }
            html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; }
            .print-controls { display: none !important; }
            .professional-invoice { width: 148mm !important; min-height: 210mm !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; font-size: 9pt !important; line-height: 1.3 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; display: flex !important; flex-direction: column !important; justify-content: space-between !important; }
            .price-input, input[type="text"], input[type="number"], textarea, select, button, .add-frame-btn, .remove-frame-btn, .add-contact-lens-btn, .remove-contact-lens-btn, .remove-lens-btn, [placeholder], [title*="Supprimer"], [title*="Ajouter"] { display: none !important; }
            .price-input + span.final-value { display: inline !important; color: #2c3e50 !important; font-weight: 700 !important; }
            .frame-description, .contact-lens-description { display: block !important; color: #34495e !important; font-size: 9pt !important; }
            div[style*="display: flex"][style*="flexDirection: column"] > input, div[style*="display: flex"][style*="flexDirection: column"] > select { display: none !important; }
            .company-info .company-name, .company-info .company-details { color: #ecf0f1 !important; }
            .items-table th { background: linear-gradient(135deg, #3498db 0%, #2980b9 100%) !important; color: white !important; }
            .items-table td, .items-table td:last-child, .client-info .info-value, .company-details { color: #2c3e50 !important; font-weight: 600 !important; }
            .invoice-header { display: flex !important; flex-direction: row !important; gap: 10mm !important; margin-bottom: 2mm !important; padding: 4mm !important; }
            .company-info { flex: 1.8 !important; padding: 2mm 3mm !important; background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; }
            .invoice-meta { flex: 1 !important; }
            .company-name { font-size: 14pt !important; margin-bottom: 1mm !important; }
            .company-details { font-size: 8pt !important; line-height: 1.2 !important; }
            .invoice-title { font-size: 16pt !important; margin-bottom: 2mm !important; text-align: left !important; }
            .meta-item { margin-bottom: 0.5mm !important; font-size: 8pt !important; }
            .section { margin-bottom: 2mm !important; }
            .section-title { font-size: 10pt !important; margin-bottom: 1mm !important; padding-bottom: 0.5mm !important; }
            .client-info { padding: 1.5mm 2mm !important; }
            .info-item { margin-bottom: 0.5mm !important; }
            .info-label { font-size: 8pt !important; margin-bottom: 0.2mm !important; }
            .items-table { font-size: 8pt !important; margin-bottom: 2mm !important; }
            .items-table th, .items-table td { padding: 1mm 1.5mm !important; }
            .summary-grid { gap: 2mm !important; grid-template-columns: 1fr 1fr !important; }
            .totals-card { padding: 3mm 4mm !important; box-shadow: none !important; border-radius: 4px !important; margin-bottom: 3mm !important; }
            .totals-title { font-size: 9pt !important; margin-bottom: 2mm !important; padding-bottom: 1mm !important; }
            .totals-row { font-size: 8pt !important; margin-bottom: 1mm !important; padding: 1mm 0 !important; }
            .totals-row.final { font-size: 9pt !important; padding: 2mm 3mm !important; }
            .signature-area { margin-top: 6mm !important; padding: 8mm 16px 6mm !important; border-top: 2px solid #3498db !important; font-size: 9pt !important; min-height: 20mm !important; box-shadow: none !important; }
            .professional-invoice { min-height: 202mm !important; max-height: 202mm !important; overflow: hidden !important; }
          }
        `}</style>

        {/* Header Section */}
        <div className="invoice-header">
          <div className="invoice-meta" style={{ flex: '1' }}>
            <div className="invoice-title">FACTURE</div>
            <div className="meta-item"><span className="meta-label">N°:</span><span className="meta-value">{order.orderNumber || 'N/A'}</span></div>
            <div className="meta-item"><span className="meta-label">Date:</span><span className="meta-value">{formatDate(order.createdAt)}</span></div>
            <div className="meta-item"><span className="meta-label">Livraison:</span><span className="meta-value">{formatDate(order.expectedCompletionDate)}</span></div>
            <div className="meta-item"><span className="meta-label">ID:</span><span className="meta-value">#{order.id?.slice(-6) || 'N/A'}</span></div>
          </div>
          <div className="company-info" style={{ flex: '1.8' }}>
            <div className="company-name">{settings?.opticianName || 'OPTICIEN OPTOMÉTRISTE'}</div>
            <div className="company-details">
              {settings?.opticianAddress || 'Adresse non définie'}<br />
              {settings?.opticianPhone && settings.opticianPhone}
            </div>
          </div>
        </div>

        {/* Client Information */}
        <div className="section">
          <div className="section-title">Informations Client</div>
          <div className="client-grid">
            <div className="client-info">
              <div className="info-item"><div className="info-label">Nom complet</div><div className="info-value">{getCustomerName()}</div></div>
              <div className="info-item"><div className="info-label">Téléphone</div><div className="info-value">{order.customer?.phone && order.customer.phone !== 'Not provided' ? order.customer.phone : 'N/A'}</div></div>
            </div>
            <div className="client-info">
              <div className="info-item"><div className="info-label">Email</div><div className="info-value">{order.customer?.email && order.customer.email !== 'Not provided' ? order.customer.email : 'N/A'}</div></div>
              <div className="info-item"><div className="info-label">Adresse</div><div className="info-value">{order.customer?.address && order.customer.address !== 'Not provided' ? order.customer.address : 'N/A'}</div></div>
            </div>
          </div>
        </div>

        {/* Order Details */}
        <div className="section">
          <div className="section-title">Détails de la Commande</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '2mm' }}>
            <button onClick={handleAddFrame} className="add-frame-btn">+ Ajouter Monture</button>
            <button onClick={handleAddContactLens} className="add-contact-lens-btn">+ Ajouter Lentille de Contact</button>
          </div>
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Article</th>
                <th style={{ width: '35%' }}>Description</th>
                <th style={{ width: '10%' }}>Qté</th>
                <th style={{ width: '15%' }}>Prix Unitaire</th>
                <th style={{ width: '15%' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {orderItems.map((item, index) => (
                <tr key={index}>
                  <td><strong>{item.name}</strong></td>
                  <td style={{ color: '#64748b' }}>
                    {item.name === 'Monture supplémentaire' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div className="frame-description">{item.description}</div>
                        {(() => { const f = additionalFrames.find(fr => `${fr.brand} ${fr.model} - ${fr.color}${fr.size ? ` - ${fr.size}` : ''}` === item.description); return f ? (
                          <>
                            <input type="text" value={f.brand} onChange={e => handleAdditionalFrameDescriptionChange(f.id, 'brand', e.target.value)} placeholder="Marque" style={{ width: '100%', padding: '2px 4px', fontSize: '8pt', border: '1px solid #e2e8f0', borderRadius: '2px' }} />
                            <input type="text" value={f.model} onChange={e => handleAdditionalFrameDescriptionChange(f.id, 'model', e.target.value)} placeholder="Modèle" style={{ width: '100%', padding: '2px 4px', fontSize: '8pt', border: '1px solid #e2e8f0', borderRadius: '2px' }} />
                            <input type="text" value={f.color} onChange={e => handleAdditionalFrameDescriptionChange(f.id, 'color', e.target.value)} placeholder="Couleur" style={{ width: '100%', padding: '2px 4px', fontSize: '8pt', border: '1px solid #e2e8f0', borderRadius: '2px' }} />
                            <input type="text" value={f.size || ''} onChange={e => handleAdditionalFrameDescriptionChange(f.id, 'size', e.target.value)} placeholder="Taille" style={{ width: '100%', padding: '2px 4px', fontSize: '8pt', border: '1px solid #e2e8f0', borderRadius: '2px' }} />
                          </>
                        ) : null })()}
                      </div>
                    ) : item.contactLensId ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div className="contact-lens-description">{item.description}</div>
                        {(() => { const cl = contactLenses.find(c => c.id === item.contactLensId); return cl ? (
                          <>
                            <input type="text" value={cl.brand} onChange={e => handleContactLensChange(cl.id, 'brand', e.target.value)} placeholder="Marque" style={{ width: '100%', padding: '2px 4px', fontSize: '8pt', border: '1px solid #e2e8f0', borderRadius: '2px' }} />
                            <input type="text" value={cl.type} onChange={e => handleContactLensChange(cl.id, 'type', e.target.value)} placeholder="Type" style={{ width: '100%', padding: '2px 4px', fontSize: '8pt', border: '1px solid #e2e8f0', borderRadius: '2px' }} />
                            <input type="text" value={cl.power} onChange={e => handleContactLensChange(cl.id, 'power', e.target.value)} placeholder="Puissance" style={{ width: '100%', padding: '2px 4px', fontSize: '8pt', border: '1px solid #e2e8f0', borderRadius: '2px' }} />
                            <select value={cl.eye} onChange={e => handleContactLensChange(cl.id, 'eye', e.target.value)} style={{ width: '100%', padding: '2px 4px', fontSize: '8pt', border: '1px solid #e2e8f0', borderRadius: '2px' }}>
                              <option value="OD">OD (Œil Droit)</option>
                              <option value="OG">OG (Œil Gauche)</option>
                              <option value="Les deux">Les deux</option>
                            </select>
                          </>
                        ) : null })()}
                      </div>
                    ) : (
                      item.description
                    )}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 500 }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>
                    {(item.name === 'Monture' || item.name === 'Monture supplémentaire' || item.name.includes('Verre') || item.name === 'Verres' || item.contactLensId) ? (
                      <>
                        <input
                          type="number"
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onChange={e => {
                            const v = e.target.value
                            if (item.name === 'Monture') handleFramePriceChange(v)
                            else if (item.name === 'Monture supplémentaire') { const f = additionalFrames.find(fr => `${fr.brand} ${fr.model} - ${fr.color}${fr.size ? ` - ${fr.size}` : ''}` === item.description); if (f) handleAdditionalFramePriceChange(additionalFrames.findIndex(fr => fr.id === f.id), v) }
                            else if (item.name.includes('Verre OD VL')) handleLensPriceChange('vlRight', v)
                            else if (item.name.includes('Verre OG VL')) handleLensPriceChange('vlLeft', v)
                            else if (item.name.includes('Verre OD VP')) handleLensPriceChange('vpRight', v)
                            else if (item.name.includes('Verre OG VP')) handleLensPriceChange('vpLeft', v)
                            else if (item.name === 'Verres') handleLensPriceChange('general', v)
                            else if (item.contactLensId) { const cl = contactLenses.find(c => c.id === item.contactLensId); if (cl) handleContactLensChange(cl.id, 'price', parseFloat(v) || 0) }
                          }}
                          className="price-input"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          style={{ width: '80px', padding: '4px 6px' }}
                        />
                        <span className="final-value" style={{ display: 'none' }}>{formatCurrency(item.unitPrice)}</span>
                      </>
                    ) : (
                      formatCurrency(item.unitPrice)
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatCurrency(item.totalPrice)}
                    {item.name === 'Monture supplémentaire' && (
                      <button onClick={() => { const f = additionalFrames.find(fr => `${fr.brand} ${fr.model} - ${fr.color}${fr.size ? ` - ${fr.size}` : ''}` === item.description); if (f) handleRemoveAdditionalFrame(f.id) }} className="remove-frame-btn" title="Supprimer cette monture">✕</button>
                    )}
                    {(item.lensType && (item.name.includes('Verre') || item.name === 'Verres')) && (
                      <button onClick={() => { if (item.lensType) handleDeleteLens(item.lensType) }} className="remove-lens-btn" title="Supprimer ce type de verre">✕</button>
                    )}
                    {item.contactLensId && (
                      <button onClick={() => item.contactLensId && handleRemoveContactLens(item.contactLensId)} className="remove-contact-lens-btn" title="Supprimer cette lentille de contact">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Section */}
        <div style={{ marginBottom: '4mm' }}>
          <div className="totals-card">
            <div className="totals-title">Récapitulatif</div>
            <div className="totals-row final">
              <span>Total TTC</span>
              <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{formatCurrency(calculatedTotalPrice)}</span>
            </div>
          </div>
        </div>

        {/* Notes Section */}
        {order.notes && (
          <div style={{ marginBottom: '3mm' }}>
            <div className="section-title" style={{ fontSize: '10pt' }}>Notes</div>
            <div style={{ fontSize: '9pt', color: '#2c3e50', lineHeight: 1.6 }}>{order.notes}</div>
          </div>
        )}

        {/* Signature Area */}
        <div className="signature-area">
          <strong>Cachet et signature de l'OPTICIEN</strong>
        </div>
      </div>
    </>
  )
}
