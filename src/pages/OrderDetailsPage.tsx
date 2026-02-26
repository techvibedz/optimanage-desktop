import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { useSettings } from '@/lib/settings-context'
import { toast } from 'sonner'
import {
  ArrowLeft, User, CalendarDays, CreditCard, Package, Eye, Clock,
  CheckCircle, AlertCircle, Plus, Trash2, RefreshCw, Printer, Edit3,
  FileText, Loader2
} from 'lucide-react'
import OrderSlip from '@/components/print/OrderSlip'

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { settings } = useSettings()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)

  // Edit status
  const [editingStatus, setEditingStatus] = useState(false)
  const [newStatus, setNewStatus] = useState('')

  // Edit order
  const [isEditing, setIsEditing] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editFields, setEditFields] = useState<any>({})
  const [lensTypes, setLensTypes] = useState<any[]>([])

  // Print
  const [showPrintSlip, setShowPrintSlip] = useState(false)

  const fetchOrder = async (showRefreshLoader = false) => {
    if (!id) return
    try {
      if (showRefreshLoader) setIsRefreshing(true)
      else setLoading(true)
      const res = await window.electronAPI.getOrder(id)
      if (res.data) { setOrder(res.data); setNewStatus(res.data.status) }
      else if (res.error) setError(res.error)
    } catch (err: any) {
      setError(err.message || 'Failed to load order')
    } finally {
      if (showRefreshLoader) setIsRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => { fetchOrder() }, [id])

  const startEditing = async () => {
    const rx = order?.prescription
    setEditFields({
      totalPrice: order?.totalPrice || 0,
      framePrice: order?.framePrice || 0,
      vlRightEyeLensPrice: order?.vlRightEyeLensPrice || 0,
      vlLeftEyeLensPrice: order?.vlLeftEyeLensPrice || 0,
      vpRightEyeLensPrice: order?.vpRightEyeLensPrice || 0,
      vpLeftEyeLensPrice: order?.vpLeftEyeLensPrice || 0,
      expectedCompletionDate: order?.expectedCompletionDate ? new Date(order.expectedCompletionDate).toISOString().split('T')[0] : '',
      customerNotes: order?.customerNotes || '',
      technicalNotes: order?.technicalNotes || '',
      // Lens type IDs
      vlRightEyeLensTypeId: order?.vlRightEyeLensType?.id || '',
      vlLeftEyeLensTypeId: order?.vlLeftEyeLensType?.id || '',
      vpRightEyeLensTypeId: order?.vpRightEyeLensType?.id || '',
      vpLeftEyeLensTypeId: order?.vpLeftEyeLensType?.id || '',
      // Prescription
      vlRightEyeSphere: rx?.vlRightEyeSphere ?? '',
      vlRightEyeCylinder: rx?.vlRightEyeCylinder ?? '',
      vlRightEyeAxis: rx?.vlRightEyeAxis ?? '',
      vlLeftEyeSphere: rx?.vlLeftEyeSphere ?? '',
      vlLeftEyeCylinder: rx?.vlLeftEyeCylinder ?? '',
      vlLeftEyeAxis: rx?.vlLeftEyeAxis ?? '',
      vpRightEyeSphere: rx?.vpRightEyeSphere ?? '',
      vpRightEyeCylinder: rx?.vpRightEyeCylinder ?? '',
      vpRightEyeAxis: rx?.vpRightEyeAxis ?? '',
      vpRightEyeAdd: rx?.vpRightEyeAdd ?? '',
      vpLeftEyeSphere: rx?.vpLeftEyeSphere ?? '',
      vpLeftEyeCylinder: rx?.vpLeftEyeCylinder ?? '',
      vpLeftEyeAxis: rx?.vpLeftEyeAxis ?? '',
      vpLeftEyeAdd: rx?.vpLeftEyeAdd ?? '',
      pupillaryDistance: rx?.pupillaryDistance ?? '',
    })
    // Fetch lens types for dropdown
    try {
      const res = await window.electronAPI.getLensTypes({ userId: user?.id || '', limit: 200 })
      if (res.data) setLensTypes(Array.isArray(res.data) ? res.data : (res.data.lensTypes || []))
    } catch (e) { console.error('Failed to load lens types', e) }
    setIsEditing(true)
  }

  // Auto-recalculate totalPrice from component prices
  const updateEditField = (field: string, value: any) => {
    setEditFields((prev: any) => {
      const next = { ...prev, [field]: value }
      // If a price field changed, recalculate total
      const priceFields = ['framePrice', 'vlRightEyeLensPrice', 'vlLeftEyeLensPrice', 'vpRightEyeLensPrice', 'vpLeftEyeLensPrice']
      if (priceFields.includes(field)) {
        next.totalPrice = priceFields.reduce((sum, f) => sum + (Number(next[f]) || 0), 0) + (Number(order?.addonsPrice) || 0)
      }
      return next
    })
  }

  // When lens type changes, auto-fill the price from the lens type
  const handleLensTypeChange = (field: string, priceField: string, lensTypeId: string) => {
    const lt = lensTypes.find((l: any) => l.id === lensTypeId)
    setEditFields((prev: any) => {
      const next = { ...prev, [field]: lensTypeId, [priceField]: lt?.sellingPrice || prev[priceField] }
      // Recalculate total
      const priceFields = ['framePrice', 'vlRightEyeLensPrice', 'vlLeftEyeLensPrice', 'vpRightEyeLensPrice', 'vpLeftEyeLensPrice']
      next.totalPrice = priceFields.reduce((sum, f) => sum + (Number(next[f]) || 0), 0) + (Number(order?.addonsPrice) || 0)
      return next
    })
  }

  const handleSaveEdit = async () => {
    setIsSavingEdit(true)
    try {
      const updates: any = {}
      if (editFields.totalPrice !== order.totalPrice) updates.totalPrice = Number(editFields.totalPrice)
      if (editFields.framePrice !== order.framePrice) updates.framePrice = Number(editFields.framePrice)
      if (editFields.vlRightEyeLensPrice !== order.vlRightEyeLensPrice) updates.vlRightEyeLensPrice = Number(editFields.vlRightEyeLensPrice)
      if (editFields.vlLeftEyeLensPrice !== order.vlLeftEyeLensPrice) updates.vlLeftEyeLensPrice = Number(editFields.vlLeftEyeLensPrice)
      if (editFields.vpRightEyeLensPrice !== order.vpRightEyeLensPrice) updates.vpRightEyeLensPrice = Number(editFields.vpRightEyeLensPrice)
      if (editFields.vpLeftEyeLensPrice !== order.vpLeftEyeLensPrice) updates.vpLeftEyeLensPrice = Number(editFields.vpLeftEyeLensPrice)
      if (editFields.expectedCompletionDate) updates.expectedCompletionDate = new Date(editFields.expectedCompletionDate).toISOString()
      if (editFields.customerNotes !== order.customerNotes) updates.customerNotes = editFields.customerNotes
      if (editFields.technicalNotes !== order.technicalNotes) updates.technicalNotes = editFields.technicalNotes
      // Lens type changes (connect relations)
      if (editFields.vlRightEyeLensTypeId && editFields.vlRightEyeLensTypeId !== (order.vlRightEyeLensType?.id || '')) {
        updates.vlRightEyeLensType = { connect: { id: editFields.vlRightEyeLensTypeId } }
      }
      if (editFields.vlLeftEyeLensTypeId && editFields.vlLeftEyeLensTypeId !== (order.vlLeftEyeLensType?.id || '')) {
        updates.vlLeftEyeLensType = { connect: { id: editFields.vlLeftEyeLensTypeId } }
      }
      if (editFields.vpRightEyeLensTypeId && editFields.vpRightEyeLensTypeId !== (order.vpRightEyeLensType?.id || '')) {
        updates.vpRightEyeLensType = { connect: { id: editFields.vpRightEyeLensTypeId } }
      }
      if (editFields.vpLeftEyeLensTypeId && editFields.vpLeftEyeLensTypeId !== (order.vpLeftEyeLensType?.id || '')) {
        updates.vpLeftEyeLensType = { connect: { id: editFields.vpLeftEyeLensTypeId } }
      }
      // Also update balanceDue if totalPrice changed
      if (updates.totalPrice !== undefined) {
        const newTotal = Number(updates.totalPrice)
        updates.balanceDue = Math.max(0, newTotal - totalPaid)
      }

      // Build prescription updates
      const rxUpdates: any = {}
      const rx = order.prescription
      const rxFields = [
        'vlRightEyeSphere','vlRightEyeCylinder','vlRightEyeAxis',
        'vlLeftEyeSphere','vlLeftEyeCylinder','vlLeftEyeAxis',
        'vpRightEyeSphere','vpRightEyeCylinder','vpRightEyeAxis','vpRightEyeAdd',
        'vpLeftEyeSphere','vpLeftEyeCylinder','vpLeftEyeAxis','vpLeftEyeAdd',
        'pupillaryDistance',
      ]
      for (const f of rxFields) {
        const newVal = editFields[f] === '' || editFields[f] == null ? null : Number(editFields[f])
        const oldVal = rx?.[f] ?? null
        if (newVal !== oldVal) rxUpdates[f] = newVal
      }
      // Recompute hasVLData / hasVPData flags
      if (Object.keys(rxUpdates).length > 0) {
        const getVal = (field: string) => rxUpdates[field] !== undefined ? rxUpdates[field] : (rx?.[field] ?? null)
        rxUpdates.hasVLData = getVal('vlRightEyeSphere') != null || getVal('vlLeftEyeSphere') != null
        rxUpdates.hasVPData = getVal('vpRightEyeSphere') != null || getVal('vpLeftEyeSphere') != null
      }

      const hasOrderUpdates = Object.keys(updates).length > 0
      const hasRxUpdates = Object.keys(rxUpdates).length > 0

      if (!hasOrderUpdates && !hasRxUpdates) {
        setIsEditing(false)
        return
      }

      if (hasOrderUpdates) {
        const result = await window.electronAPI.updateOrder(order.id, updates)
        if (result.error) { toast.error(result.error); return }
      }
      if (hasRxUpdates && rx?.id) {
        const rxResult = await window.electronAPI.updatePrescription(rx.id, rxUpdates)
        if (rxResult.error) { toast.error(rxResult.error); return }
      }
      if (!rx && hasRxUpdates) {
        toast.error('No prescription linked to this order')
        return
      }
      toast.success(t('common.success'))

      setIsEditing(false)
      fetchOrder(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update order')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const totalPaid = useMemo(() => {
    if (!order?.payments || !Array.isArray(order.payments)) return order?.depositAmount || 0
    return order.payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
  }, [order?.payments, order?.depositAmount])

  const remainingBalance = (order?.totalPrice || 0) - totalPaid
  const isFullyPaid = remainingBalance <= 0.01

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'ready': return 'bg-green-100 text-green-800 border-green-300'
      case 'delivered': case 'completed': return 'bg-gray-100 text-gray-800 border-gray-300'
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return <Clock className="h-4 w-4" />
      case 'in_progress': return <AlertCircle className="h-4 w-4" />
      case 'ready': case 'delivered': case 'completed': return <CheckCircle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const formatPrescriptionValue = (value: number | null | undefined) => {
    if (value === null || value === undefined) return null
    if (value > 0) return `+${value}`
    return value.toString()
  }

  const handleAddPayment = async () => {
    if (!paymentAmount || !paymentMethod || Number(paymentAmount) <= 0) {
      toast.error('Please enter a valid amount and payment method')
      return
    }
    if (Number(paymentAmount) > remainingBalance + 0.01) {
      toast.error(`Amount cannot exceed remaining balance (${remainingBalance.toLocaleString()} DA)`)
      return
    }

    setIsProcessingPayment(true)
    try {
      const result = await window.electronAPI.createPayment({
        orderId: order.id,
        userId: user!.id,
        amount: Number(paymentAmount),
        paymentMethod,
        paymentDate: new Date(),
      })
      if (result.error) { toast.error(result.error); return }
      toast.success('Payment added successfully')
      setPaymentAmount('')
      setPaymentMethod('')
      fetchOrder(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to add payment')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Delete this payment?')) return
    setDeletingPaymentId(paymentId)
    try {
      const result = await window.electronAPI.deletePayment(paymentId)
      if (result.error) { toast.error(result.error); return }
      toast.success('Payment deleted')
      fetchOrder(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete payment')
    } finally {
      setDeletingPaymentId(null)
    }
  }

  const handleUpdateStatus = async () => {
    if (!newStatus || newStatus === order.status) { setEditingStatus(false); return }
    try {
      const result = await window.electronAPI.updateOrder(order.id, { status: newStatus })
      if (result.error) { toast.error(result.error); return }
      toast.success('Status updated')
      setEditingStatus(false)
      fetchOrder(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status')
    }
  }

  const handlePrint = () => {
    setShowPrintSlip(true)
    setTimeout(() => window.print(), 300)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="loading-spinner-lg mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">{t('orders.loadingOrderDetails') || 'Loading order details...'}</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">{error || 'Order not found'}</h3>
          <button onClick={() => navigate('/orders')} className="text-sm text-primary hover:underline">Back to orders</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-slip-content, .print-slip-content * { visibility: visible !important; }
          .print-slip-content { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          @page { size: A5 portrait; margin: 0; }
        }
      `}</style>
      {/* Print overlay */}
      {showPrintSlip && (
        <div className="fixed inset-0 z-[9999] bg-white print:bg-white">
          <div className="no-print flex items-center justify-between p-4 border-b">
            <span className="text-sm font-medium">Print Preview</span>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Print</button>
              <button onClick={() => setShowPrintSlip(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Close</button>
            </div>
          </div>
          <div className="print-slip-content p-4 print:p-0">
            <OrderSlip order={order} />
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/orders')} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">{t('orders.orderDetails') || 'Order Details'}</h1>
              <p className="text-sm text-muted-foreground">#{order.orderNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => navigate(`/orders/${order.id}/facture`)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Printer className="h-4 w-4" /> Facture
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 border border-border hover:bg-muted rounded-lg text-sm font-medium transition-colors">
              <Printer className="h-4 w-4" /> {t('orders.printOrderSlip')}
            </button>
            {!isEditing ? (
              <button onClick={startEditing}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
                <Edit3 className="h-4 w-4" /> {t('orders.editOrder')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={handleSaveEdit} disabled={isSavingEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} {t('common.saveChanges')}
                </button>
                <button onClick={() => setIsEditing(false)}
                  className="flex items-center gap-2 px-4 py-2 border border-border hover:bg-muted rounded-lg text-sm font-medium transition-colors">
                  {t('common.cancel')}
                </button>
              </div>
            )}
            <button onClick={() => fetchOrder(true)} disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-2 border border-border hover:bg-muted rounded-lg text-sm transition-colors">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            {/* Status Badge */}
            {editingStatus ? (
              <div className="flex items-center gap-2">
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-lg text-sm bg-background">
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="ready">Ready</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button onClick={handleUpdateStatus} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium">Save</button>
                <button onClick={() => { setEditingStatus(false); setNewStatus(order.status) }} className="px-3 py-1.5 border border-border rounded-lg text-xs">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setEditingStatus(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border ${getStatusColor(order.status)} cursor-pointer hover:opacity-80`}>
                {getStatusIcon(order.status)}
                {order.status?.replace('_', ' ')}
                <Edit3 className="h-3 w-3 ml-1 opacity-50" />
              </button>
            )}
          </div>
        </div>

        {/* Add Payment Section (if not fully paid) */}
        {!isFullyPaid && (
          <div className="bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Plus className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-semibold text-blue-800 dark:text-blue-300">{t('orders.addPayment') || 'Add Payment'}</h3>
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">
              {t('orders.balanceDue') || 'Balance Due'}: <span className="font-semibold">{remainingBalance.toLocaleString()} DA</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{t('orders.paymentAmount') || 'Amount'}</label>
                <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="0.00" max={remainingBalance} step="0.01"
                  className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('orders.paymentMethod') || 'Method'}</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-400/30">
                  <option value="">{t('orders.selectPaymentMethod') || 'Select method...'}</option>
                  <option value="cash">{t('orders.cash') || 'Cash'}</option>
                  <option value="card">{t('orders.card') || 'Card'}</option>
                  <option value="bank_transfer">{t('orders.bankTransfer') || 'Bank Transfer'}</option>
                  <option value="check">{t('orders.check') || 'Check'}</option>
                </select>
              </div>
            </div>
            <button onClick={handleAddPayment}
              disabled={!paymentAmount || !paymentMethod || Number(paymentAmount) <= 0 || isProcessingPayment}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
              {isProcessingPayment ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
              ) : (
                <><Plus className="h-4 w-4" /> {t('orders.addPayment') || 'Add Payment'}</>
              )}
            </button>
          </div>
        )}

        {/* Top Cards: Customer, Timeline, Pricing */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Customer Info */}
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" /> {t('orders.customerInfo') || 'Customer'}
            </h3>
            <p className="font-semibold text-foreground">{order.customer?.firstName} {order.customer?.lastName}</p>
            {order.customer?.email && <p className="text-sm text-muted-foreground mt-1">{order.customer.email}</p>}
            {order.customer?.phone && <p className="text-sm text-muted-foreground">{order.customer.phone}</p>}
          </div>

          {/* Timeline */}
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4" /> {t('orders.orderTimeline') || 'Timeline'}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('orders.orderCreated') || 'Created'}</span>
                <span>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t('orders.expectedCompletion')}</span>
                {isEditing ? (
                  <input type="date" value={editFields.expectedCompletionDate || ''}
                    onChange={e => setEditFields({...editFields, expectedCompletionDate: e.target.value})}
                    className="px-2 py-1 border border-border rounded text-sm bg-background w-36" />
                ) : (
                  <span>{order.expectedCompletionDate ? new Date(order.expectedCompletionDate).toLocaleDateString() : '-'}</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('orders.lastUpdated') || 'Updated'}</span>
                <span>{order.updatedAt ? new Date(order.updatedAt).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" /> {t('orders.pricingSummary') || 'Pricing'}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between font-semibold items-center">
                <span>{t('orders.totalPrice')}</span>
                {isEditing ? (
                  <input type="number" value={editFields.totalPrice || 0}
                    onChange={e => setEditFields({...editFields, totalPrice: Number(e.target.value)})}
                    className="px-2 py-1 border border-border rounded text-sm bg-background w-28 text-right" />
                ) : (
                  <span>{(order.totalPrice || 0).toLocaleString()} DA</span>
                )}
              </div>
              <hr className="border-border/50" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('orders.totalPaid') || 'Paid'}</span>
                <span className="text-green-600 font-medium">{totalPaid.toLocaleString()} DA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('orders.balanceDue') || 'Balance'}</span>
                <span className={`font-medium ${remainingBalance > 0.01 ? 'text-red-500' : 'text-green-600'}`}>
                  {Math.max(0, remainingBalance).toLocaleString()} DA
                </span>
              </div>
              <div className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-semibold mt-1 ${isFullyPaid
                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'}`}>
                {isFullyPaid ? <><CheckCircle className="h-3.5 w-3.5" /> {t('orders.fullyPaid') || 'Fully Paid'}</> : <><AlertCircle className="h-3.5 w-3.5" /> {t('orders.paymentPending') || 'Payment Pending'}</>}
              </div>
            </div>
          </div>
        </div>

        {/* Payment History */}
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
            <CreditCard className="h-4 w-4" /> {t('payments.paymentHistory') || 'Payment History'}
            {order.payments?.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-muted">{order.payments.length}</span>
            )}
          </h3>
          {order.payments && order.payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">{t('common.date') || 'Date'}</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">{t('common.amount') || 'Amount'}</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">{t('common.method') || 'Method'}</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">{t('common.receipt') || 'Receipt'}</th>
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">{t('common.actions') || 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.payments.map((payment: any, index: number) => (
                    <tr key={payment.id} className={`border-b border-border/20 ${index % 2 === 0 ? 'bg-muted/20' : ''}`}>
                      <td className="py-2.5 px-3">{payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : '-'}</td>
                      <td className="py-2.5 px-3 font-medium text-green-600">{payment.amount?.toLocaleString()} DA</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md text-xs border border-border capitalize">{payment.paymentMethod || '-'}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground text-xs">{payment.receiptNumber || '-'}</td>
                      <td className="py-2.5 px-3">
                        <button onClick={() => handleDeletePayment(payment.id)} disabled={deletingPaymentId === payment.id}
                          className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 disabled:opacity-50">
                          {deletingPaymentId === payment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCard className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No payments recorded</p>
            </div>
          )}
        </div>

        {/* Bottom: Prescription + Product Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Prescription */}
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
              <Eye className="h-4 w-4" /> {t('common.prescriptionDetails') || 'Prescription'}
            </h3>
            {order.prescription ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">{t('common.doctor') || 'Doctor'}</span>
                    <p className="font-medium">{order.prescription.doctorName || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">{t('common.examinationDate') || 'Date'}</span>
                    <p>{order.prescription.examinationDate ? new Date(order.prescription.examinationDate).toLocaleDateString() : '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">PD</span>
                    {isEditing ? (
                      <input type="number" step="0.5" value={editFields.pupillaryDistance ?? ''}
                        onChange={e => setEditFields({...editFields, pupillaryDistance: e.target.value})}
                        placeholder="-" className="w-20 px-2 py-1 border border-border rounded text-sm bg-background" />
                    ) : (
                      <p>{order.prescription.pupillaryDistance ? `${order.prescription.pupillaryDistance} mm` : '-'}</p>
                    )}
                  </div>
                </div>

                {/* VL Data */}
                {(order.prescription.hasVLData || isEditing) && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">{t('orders.distanceVisionVL') || 'Distance Vision (VL)'}</h4>
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-4 gap-1 text-xs text-center text-muted-foreground font-medium">
                          <span></span><span>SPH</span><span>CYL</span><span>AXE</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1 items-center">
                          <span className="text-xs font-semibold">OD</span>
                          <input type="number" step="0.25" value={editFields.vlRightEyeSphere ?? ''} onChange={e => setEditFields({...editFields, vlRightEyeSphere: e.target.value})} placeholder="SPH" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="0.25" value={editFields.vlRightEyeCylinder ?? ''} onChange={e => setEditFields({...editFields, vlRightEyeCylinder: e.target.value})} placeholder="CYL" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="1" value={editFields.vlRightEyeAxis ?? ''} onChange={e => setEditFields({...editFields, vlRightEyeAxis: e.target.value})} placeholder="AXE" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                        </div>
                        <div className="grid grid-cols-4 gap-1 items-center">
                          <span className="text-xs font-semibold">OG</span>
                          <input type="number" step="0.25" value={editFields.vlLeftEyeSphere ?? ''} onChange={e => setEditFields({...editFields, vlLeftEyeSphere: e.target.value})} placeholder="SPH" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="0.25" value={editFields.vlLeftEyeCylinder ?? ''} onChange={e => setEditFields({...editFields, vlLeftEyeCylinder: e.target.value})} placeholder="CYL" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="1" value={editFields.vlLeftEyeAxis ?? ''} onChange={e => setEditFields({...editFields, vlLeftEyeAxis: e.target.value})} placeholder="AXE" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium mb-1">{t('common.rightEye') || 'Right Eye (OD)'}</p>
                          <div className="space-y-0.5">
                            {order.prescription.vlRightEyeSphere != null && <p>SPH: {formatPrescriptionValue(order.prescription.vlRightEyeSphere)}</p>}
                            {order.prescription.vlRightEyeCylinder != null && <p>CYL: {formatPrescriptionValue(order.prescription.vlRightEyeCylinder)}</p>}
                            {order.prescription.vlRightEyeAxis != null && <p>AXIS: {order.prescription.vlRightEyeAxis}°</p>}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium mb-1">{t('common.leftEye') || 'Left Eye (OS)'}</p>
                          <div className="space-y-0.5">
                            {order.prescription.vlLeftEyeSphere != null && <p>SPH: {formatPrescriptionValue(order.prescription.vlLeftEyeSphere)}</p>}
                            {order.prescription.vlLeftEyeCylinder != null && <p>CYL: {formatPrescriptionValue(order.prescription.vlLeftEyeCylinder)}</p>}
                            {order.prescription.vlLeftEyeAxis != null && <p>AXIS: {order.prescription.vlLeftEyeAxis}°</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* VP Data */}
                {(order.prescription.hasVPData || isEditing) && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">{t('orders.nearVisionVP') || 'Near Vision (VP)'}</h4>
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-5 gap-1 text-xs text-center text-muted-foreground font-medium">
                          <span></span><span>SPH</span><span>CYL</span><span>AXE</span><span>ADD</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1 items-center">
                          <span className="text-xs font-semibold">OD</span>
                          <input type="number" step="0.25" value={editFields.vpRightEyeSphere ?? ''} onChange={e => setEditFields({...editFields, vpRightEyeSphere: e.target.value})} placeholder="SPH" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="0.25" value={editFields.vpRightEyeCylinder ?? ''} onChange={e => setEditFields({...editFields, vpRightEyeCylinder: e.target.value})} placeholder="CYL" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="1" value={editFields.vpRightEyeAxis ?? ''} onChange={e => setEditFields({...editFields, vpRightEyeAxis: e.target.value})} placeholder="AXE" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="0.25" value={editFields.vpRightEyeAdd ?? ''} onChange={e => setEditFields({...editFields, vpRightEyeAdd: e.target.value})} placeholder="ADD" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                        </div>
                        <div className="grid grid-cols-5 gap-1 items-center">
                          <span className="text-xs font-semibold">OG</span>
                          <input type="number" step="0.25" value={editFields.vpLeftEyeSphere ?? ''} onChange={e => setEditFields({...editFields, vpLeftEyeSphere: e.target.value})} placeholder="SPH" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="0.25" value={editFields.vpLeftEyeCylinder ?? ''} onChange={e => setEditFields({...editFields, vpLeftEyeCylinder: e.target.value})} placeholder="CYL" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="1" value={editFields.vpLeftEyeAxis ?? ''} onChange={e => setEditFields({...editFields, vpLeftEyeAxis: e.target.value})} placeholder="AXE" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                          <input type="number" step="0.25" value={editFields.vpLeftEyeAdd ?? ''} onChange={e => setEditFields({...editFields, vpLeftEyeAdd: e.target.value})} placeholder="ADD" className="w-full px-1.5 py-1 border border-border rounded text-sm bg-background text-center" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium mb-1">{t('common.rightEye') || 'Right Eye (OD)'}</p>
                          <div className="space-y-0.5">
                            {order.prescription.vpRightEyeSphere != null && <p>SPH: {formatPrescriptionValue(order.prescription.vpRightEyeSphere)}</p>}
                            {order.prescription.vpRightEyeCylinder != null && <p>CYL: {formatPrescriptionValue(order.prescription.vpRightEyeCylinder)}</p>}
                            {order.prescription.vpRightEyeAxis != null && <p>AXIS: {order.prescription.vpRightEyeAxis}°</p>}
                            {order.prescription.vpRightEyeAdd != null && <p>ADD: {formatPrescriptionValue(order.prescription.vpRightEyeAdd)}</p>}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium mb-1">{t('common.leftEye') || 'Left Eye (OS)'}</p>
                          <div className="space-y-0.5">
                            {order.prescription.vpLeftEyeSphere != null && <p>SPH: {formatPrescriptionValue(order.prescription.vpLeftEyeSphere)}</p>}
                            {order.prescription.vpLeftEyeCylinder != null && <p>CYL: {formatPrescriptionValue(order.prescription.vpLeftEyeCylinder)}</p>}
                            {order.prescription.vpLeftEyeAxis != null && <p>AXIS: {order.prescription.vpLeftEyeAxis}°</p>}
                            {order.prescription.vpLeftEyeAdd != null && <p>ADD: {formatPrescriptionValue(order.prescription.vpLeftEyeAdd)}</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No prescription data</p>
            )}
          </div>

          {/* Product Details */}
          <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
              <Package className="h-4 w-4" /> {t('common.productDetails') || 'Products'}
            </h3>
            <div className="space-y-4">
              {/* Frame */}
              <div>
                <h4 className="text-sm font-semibold mb-2">{t('common.frame') || 'Frame'}</h4>
                {order.frame ? (
                  <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 p-3 rounded-lg">
                    <div><span className="text-xs text-muted-foreground">Brand</span><p className="font-medium">{order.frame.brand}</p></div>
                    <div><span className="text-xs text-muted-foreground">Model</span><p className="font-medium">{order.frame.model || '-'}</p></div>
                    <div><span className="text-xs text-muted-foreground">Color</span><p>{order.frame.color || '-'}</p></div>
                    <div><span className="text-xs text-muted-foreground">Price</span>
                      {isEditing ? (
                        <input type="number" value={editFields.framePrice || 0}
                          onChange={e => updateEditField('framePrice', Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-border rounded text-sm bg-background" />
                      ) : (
                        <p className="font-medium text-green-600">{(order.framePrice || order.frame.sellingPrice || 0).toLocaleString()} DA</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No frame selected</p>
                )}
              </div>

              {/* Lenses */}
              <div>
                <h4 className="text-sm font-semibold mb-2">{t('common.lenses') || 'Lenses'}</h4>
                <div className="space-y-2">
                  {/* VL Lenses */}
                  {(order.vlRightEyeLensPrice > 0 || order.vlLeftEyeLensPrice > 0 || isEditing) && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm">
                      <p className="font-semibold text-blue-800 dark:text-blue-300 mb-2">{t('orders.distanceVisionVL') || 'VL'}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs text-muted-foreground">OD</span>
                          {isEditing ? (
                            <div className="space-y-1">
                              <select value={editFields.vlRightEyeLensTypeId || ''} onChange={e => handleLensTypeChange('vlRightEyeLensTypeId', 'vlRightEyeLensPrice', e.target.value)}
                                className="w-full px-2 py-1 border border-border rounded text-xs bg-background">
                                <option value="">{t('common.selectLensType') || 'Select lens type...'}</option>
                                {lensTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.sellingPrice?.toLocaleString()} DA)</option>)}
                              </select>
                              <input type="number" value={editFields.vlRightEyeLensPrice || 0}
                                onChange={e => updateEditField('vlRightEyeLensPrice', Number(e.target.value))}
                                className="w-full px-2 py-1 border border-border rounded text-sm bg-background" placeholder="Price" />
                            </div>
                          ) : (
                            <>
                              {order.vlRightEyeLensType && <p className="text-xs">{order.vlRightEyeLensType.name}</p>}
                              <p className="font-medium text-green-600">{(order.vlRightEyeLensPrice || 0).toLocaleString()} DA</p>
                            </>
                          )}
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">OG</span>
                          {isEditing ? (
                            <div className="space-y-1">
                              <select value={editFields.vlLeftEyeLensTypeId || ''} onChange={e => handleLensTypeChange('vlLeftEyeLensTypeId', 'vlLeftEyeLensPrice', e.target.value)}
                                className="w-full px-2 py-1 border border-border rounded text-xs bg-background">
                                <option value="">{t('common.selectLensType') || 'Select lens type...'}</option>
                                {lensTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.sellingPrice?.toLocaleString()} DA)</option>)}
                              </select>
                              <input type="number" value={editFields.vlLeftEyeLensPrice || 0}
                                onChange={e => updateEditField('vlLeftEyeLensPrice', Number(e.target.value))}
                                className="w-full px-2 py-1 border border-border rounded text-sm bg-background" placeholder="Price" />
                            </div>
                          ) : (
                            <>
                              {order.vlLeftEyeLensType && <p className="text-xs">{order.vlLeftEyeLensType.name}</p>}
                              <p className="font-medium text-green-600">{(order.vlLeftEyeLensPrice || 0).toLocaleString()} DA</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VP Lenses */}
                  {(order.vpRightEyeLensPrice > 0 || order.vpLeftEyeLensPrice > 0 || isEditing) && (
                    <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-sm">
                      <p className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('orders.nearVisionVP') || 'VP'}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs text-muted-foreground">OD</span>
                          {isEditing ? (
                            <div className="space-y-1">
                              <select value={editFields.vpRightEyeLensTypeId || ''} onChange={e => handleLensTypeChange('vpRightEyeLensTypeId', 'vpRightEyeLensPrice', e.target.value)}
                                className="w-full px-2 py-1 border border-border rounded text-xs bg-background">
                                <option value="">{t('common.selectLensType') || 'Select lens type...'}</option>
                                {lensTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.sellingPrice?.toLocaleString()} DA)</option>)}
                              </select>
                              <input type="number" value={editFields.vpRightEyeLensPrice || 0}
                                onChange={e => updateEditField('vpRightEyeLensPrice', Number(e.target.value))}
                                className="w-full px-2 py-1 border border-border rounded text-sm bg-background" placeholder="Price" />
                            </div>
                          ) : (
                            <>
                              {order.vpRightEyeLensType && <p className="text-xs">{order.vpRightEyeLensType.name}</p>}
                              <p className="font-medium text-green-600">{(order.vpRightEyeLensPrice || 0).toLocaleString()} DA</p>
                            </>
                          )}
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">OG</span>
                          {isEditing ? (
                            <div className="space-y-1">
                              <select value={editFields.vpLeftEyeLensTypeId || ''} onChange={e => handleLensTypeChange('vpLeftEyeLensTypeId', 'vpLeftEyeLensPrice', e.target.value)}
                                className="w-full px-2 py-1 border border-border rounded text-xs bg-background">
                                <option value="">{t('common.selectLensType') || 'Select lens type...'}</option>
                                {lensTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.sellingPrice?.toLocaleString()} DA)</option>)}
                              </select>
                              <input type="number" value={editFields.vpLeftEyeLensPrice || 0}
                                onChange={e => updateEditField('vpLeftEyeLensPrice', Number(e.target.value))}
                                className="w-full px-2 py-1 border border-border rounded text-sm bg-background" placeholder="Price" />
                            </div>
                          ) : (
                            <>
                              {order.vpLeftEyeLensType && <p className="text-xs">{order.vpLeftEyeLensType.name}</p>}
                              <p className="font-medium text-green-600">{(order.vpLeftEyeLensPrice || 0).toLocaleString()} DA</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fallback old lens type */}
                  {!order.vlRightEyeLensPrice && !order.vlLeftEyeLensPrice && !order.vpRightEyeLensPrice && !order.vpLeftEyeLensPrice && order.lensType && (
                    <div className="bg-muted/30 p-3 rounded-lg text-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div><span className="text-xs text-muted-foreground">Type</span><p className="font-medium">{order.lensType.name}</p></div>
                        <div><span className="text-xs text-muted-foreground">Price</span><p className="font-medium text-green-600">{(order.lensType.sellingPrice || 0).toLocaleString()} DA</p></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {(order.technicalNotes || isEditing) && (
                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">{t('common.technicalNotes')}</h4>
                  {isEditing ? (
                    <textarea value={editFields.technicalNotes || ''}
                      onChange={e => setEditFields({...editFields, technicalNotes: e.target.value})}
                      className="w-full px-2 py-1 border border-border rounded text-sm bg-background min-h-[60px]" />
                  ) : (
                    <p className="text-sm text-amber-700 dark:text-amber-200">{order.technicalNotes}</p>
                  )}
                </div>
              )}
              {(order.customerNotes || isEditing) && (
                <div className="bg-slate-50 dark:bg-slate-900/20 p-3 rounded-lg">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-1">{t('common.customerNotes')}</h4>
                  {isEditing ? (
                    <textarea value={editFields.customerNotes || ''}
                      onChange={e => setEditFields({...editFields, customerNotes: e.target.value})}
                      className="w-full px-2 py-1 border border-border rounded text-sm bg-background min-h-[60px]" />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200">{order.customerNotes}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
