import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { toast } from 'sonner'
import {
  Plus, Trash2, X, Printer, Search,
  ChevronDown, Check, FileText, ScanLine, Loader2, Camera, Video
} from 'lucide-react'
import OrderSlip from '@/components/print/OrderSlip'

// ─── Types ───────────────────────────────────────────────────────────────────
type Customer = { id: string; firstName: string; lastName: string; email?: string; phone?: string }
type Frame = { id: string; brand: string; model: string; color: string; size: string; sellingPrice: number; stock: number }
type LensType = { id: string; name: string; category: string; material: string; index: number; sellingPrice: number; stock: number }
type Prescription = {
  id: string; customerId: string; doctorName: string; examinationDate: string
  hasVLData?: boolean; hasVPData?: boolean
  pupillaryDistance?: number
  vlRightEyeSphere?: number; vlRightEyeCylinder?: number; vlRightEyeAxis?: number
  vlLeftEyeSphere?: number; vlLeftEyeCylinder?: number; vlLeftEyeAxis?: number
  vpRightEyeSphere?: number; vpRightEyeCylinder?: number; vpRightEyeAxis?: number; vpRightEyeAdd?: number
  vpLeftEyeSphere?: number; vpLeftEyeCylinder?: number; vpLeftEyeAxis?: number; vpLeftEyeAdd?: number
}
type SelectedFrame = { id: string; price: number; brand?: string; model?: string }
type AdditionalService = { name: string; price: number }
type ContactLens = { id: string; brand: string; model?: string; price: number }

// ─── Utility: format prescription value ──────────────────────────────────────
const fmtVal = (v: number | null | undefined, isAxis = false): string => {
  if (v == null) return 'N/A'
  const n = Number(v)
  if (isNaN(n)) return 'N/A'
  if (isAxis) return n.toFixed(0) + '°'
  const s = n.toFixed(2)
  return n > 0 ? `+${s}` : s
}

// ─── Helper: brief prescription summary for dropdown ─────────────────────────
const rxSummary = (p: Prescription): string => {
  const parts: string[] = []
  if (p.hasVLData) {
    const r = p.vlRightEyeSphere != null ? `OD: ${fmtVal(p.vlRightEyeSphere)}` : ''
    const l = p.vlLeftEyeSphere != null ? `OS: ${fmtVal(p.vlLeftEyeSphere)}` : ''
    parts.push(`VL ${[r, l].filter(Boolean).join(' / ')}`)
  }
  if (p.hasVPData) {
    const r = p.vpRightEyeSphere != null ? `OD: ${fmtVal(p.vpRightEyeSphere)}` : ''
    const l = p.vpLeftEyeSphere != null ? `OS: ${fmtVal(p.vpLeftEyeSphere)}` : ''
    parts.push(`VP ${[r, l].filter(Boolean).join(' / ')}`)
  }
  return parts.join(' · ') || 'N/A'
}

// ─── Helper: Customer Search ─────────────────────────────────────────────────
function CustomerSearch({ customers, value, onChange, t }: {
  customers: Customer[]; value: string; onChange: (id: string) => void; t: (k: string) => string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = customers.find(c => c.id === value)
  const filtered = customers.filter(c => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background cursor-pointer flex items-center justify-between"
        onClick={() => setOpen(!open)}>
        <span className={selected ? '' : 'text-muted-foreground'}>
          {selected ? `${selected.firstName} ${selected.lastName}${selected.phone ? ` — ${selected.phone}` : ''}` : t('orders.selectCustomer')}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }} className="p-0.5 hover:bg-muted rounded">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-border rounded-lg shadow-lg max-h-72 overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder={t('orders.searchCustomers')} className="flex-1 bg-transparent text-sm outline-none" />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">{t('orders.noCustomersFound')}</div>
            ) : filtered.map(c => (
              <div key={c.id}
                className={`px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 flex items-center justify-between ${c.id === value ? 'bg-primary/10 text-primary' : ''}`}
                onClick={() => { onChange(c.id); setOpen(false); setQuery('') }}>
                <div>
                  <div className="font-medium">{c.firstName} {c.lastName}</div>
                  {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                </div>
                {c.id === value && <Check className="h-4 w-4" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helper: Prescription Select (rich dropdown with details) ────────────────
function PrescriptionSelect({ prescriptions, value, onChange, t }: {
  prescriptions: Prescription[]; value: string; onChange: (id: string) => void; t: (k: string) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = prescriptions.find(p => p.id === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background cursor-pointer flex items-center justify-between"
        onClick={() => setOpen(!open)}>
        <span className={selected ? '' : 'text-muted-foreground'}>
          {selected ? `Dr. ${selected.doctorName} — ${new Date(selected.examinationDate).toLocaleDateString()}` : t('orders.noPrescription')}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }} className="p-0.5 hover:bg-muted rounded">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-border rounded-lg shadow-lg max-h-80 overflow-hidden">
          <div className={`px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 border-b border-border ${!value ? 'bg-primary/10' : ''}`}
            onClick={() => { onChange(''); setOpen(false) }}>
            <div className="text-muted-foreground italic">{t('orders.noPrescription')}</div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {prescriptions.map(p => (
              <div key={p.id}
                className={`px-3 py-3 text-sm cursor-pointer hover:bg-muted/50 border-b border-border last:border-0 ${p.id === value ? 'bg-primary/10' : ''}`}
                onClick={() => { onChange(p.id); setOpen(false) }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    Dr. {p.doctorName}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(p.examinationDate).toLocaleDateString()}</span>
                    {p.id === value && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {p.hasVLData && (
                    <div className="flex gap-3 flex-wrap">
                      <span className="font-medium text-blue-600 dark:text-blue-400 w-6">VL</span>
                      <span>OD: {fmtVal(p.vlRightEyeSphere)} / {fmtVal(p.vlRightEyeCylinder)} / {fmtVal(p.vlRightEyeAxis, true)}</span>
                      <span>OS: {fmtVal(p.vlLeftEyeSphere)} / {fmtVal(p.vlLeftEyeCylinder)} / {fmtVal(p.vlLeftEyeAxis, true)}</span>
                    </div>
                  )}
                  {p.hasVPData && (
                    <div className="flex gap-3 flex-wrap">
                      <span className="font-medium text-purple-600 dark:text-purple-400 w-6">VP</span>
                      <span>OD: {fmtVal(p.vpRightEyeSphere)} / {fmtVal(p.vpRightEyeCylinder)} / Add: {fmtVal(p.vpRightEyeAdd)}</span>
                      <span>OS: {fmtVal(p.vpLeftEyeSphere)} / {fmtVal(p.vpLeftEyeCylinder)} / Add: {fmtVal(p.vpLeftEyeAdd)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helper: Lens Type Select ────────────────────────────────────────────────
function LensTypeSelect({ lensTypes, value, onSelect, label, t }: {
  lensTypes: LensType[]; value: string; onSelect: (id: string, price: number) => void; label: string; t: (k: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = lensTypes.find(l => l.id === value)
  const filtered = lensTypes.filter(l => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return l.name.toLowerCase().includes(q) || l.category?.toLowerCase().includes(q) || l.material?.toLowerCase().includes(q)
  })

  return (
    <div className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <div className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background cursor-pointer flex items-center justify-between"
        onClick={() => setOpen(!open)}>
        <span className={selected ? 'truncate' : 'text-muted-foreground truncate'}>
          {selected ? `${selected.name} - ${selected.sellingPrice} ${t('orders.currency')}` : t('orders.selectLensType')}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {value && (
            <button type="button" onClick={e => { e.stopPropagation(); onSelect('', 0) }} className="p-0.5 hover:bg-muted rounded">
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-border rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-border">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t('orders.searchLens')}
              className="w-full px-2 py-1 bg-muted/50 rounded text-sm outline-none" />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(l => (
              <div key={l.id}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 ${l.id === value ? 'bg-primary/10' : ''}`}
                onClick={() => { onSelect(l.id, l.sellingPrice); setOpen(false); setQuery('') }}>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">{l.category} · {l.material} · {l.sellingPrice} {t('orders.currency')} · Stock: {l.stock}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helper: Frame Select ────────────────────────────────────────────────────
function FrameSelectDropdown({ frames, onSelect, exclude, t }: {
  frames: Frame[]; onSelect: (f: SelectedFrame) => void; exclude: string[]; t: (k: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const available = frames.filter(f => !exclude.includes(f.id) && f.stock > 0)
  const filtered = available.filter(f => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return `${f.brand} ${f.model}`.toLowerCase().includes(q) || f.color?.toLowerCase().includes(q)
  })

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2.5 text-sm border border-dashed border-border rounded-lg hover:bg-muted/50 w-full justify-center">
        <Plus className="h-4 w-4" /> {t('orders.addFrame')}
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-border rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-border">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t('orders.searchFrames')}
              className="w-full px-2 py-1 bg-muted/50 rounded text-sm outline-none" />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">{t('orders.noFramesAvailable')}</div>
            ) : filtered.map(f => (
              <div key={f.id} className="px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                onClick={() => { onSelect({ id: f.id, price: f.sellingPrice, brand: f.brand, model: f.model }); setOpen(false); setQuery('') }}>
                <div className="font-medium">{f.brand} {f.model}</div>
                <div className="text-xs text-muted-foreground">{f.color} · {f.size} · {f.sellingPrice} {t('orders.currency')} · Stock: {f.stock}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Prescription Table Component ────────────────────────────────────────────
function PrescriptionTable({ rx, t }: { rx: Prescription; t: (k: string) => string }) {
  const hasVL = rx.hasVLData
  const hasVP = rx.hasVPData

  return (
    <div className="space-y-4">
      {/* VL — Distance Vision */}
      {hasVL && (
        <div>
          <h4 className="text-sm font-semibold mb-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-md inline-block">
            {t('orders.distanceVision')}
          </h4>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24"></th>
                  <th className="px-3 py-2 text-center font-medium">{t('orders.sphere')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('orders.cylinder')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('orders.axis')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-3 py-2.5 font-medium text-muted-foreground">{t('orders.rightEye')}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vlRightEyeSphere)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vlRightEyeCylinder)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vlRightEyeAxis, true)}</td>
                </tr>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-3 py-2.5 font-medium text-muted-foreground">{t('orders.leftEye')}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vlLeftEyeSphere)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vlLeftEyeCylinder)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vlLeftEyeAxis, true)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VP — Near Vision */}
      {hasVP && (
        <div>
          <h4 className="text-sm font-semibold mb-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-md inline-block">
            {t('orders.nearVision')}
          </h4>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24"></th>
                  <th className="px-3 py-2 text-center font-medium">{t('orders.sphere')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('orders.cylinder')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('orders.axis')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('orders.addition')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-3 py-2.5 font-medium text-muted-foreground">{t('orders.rightEye')}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vpRightEyeSphere)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vpRightEyeCylinder)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vpRightEyeAxis, true)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-purple-600 dark:text-purple-400">{fmtVal(rx.vpRightEyeAdd)}</td>
                </tr>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-3 py-2.5 font-medium text-muted-foreground">{t('orders.leftEye')}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vpLeftEyeSphere)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vpLeftEyeCylinder)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{fmtVal(rx.vpLeftEyeAxis, true)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-purple-600 dark:text-purple-400">{fmtVal(rx.vpLeftEyeAdd)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PD */}
      {rx.pupillaryDistance != null && (
        <div className="flex items-center gap-2 text-sm pt-1">
          <span className="text-muted-foreground font-medium">{t('orders.pupillaryDistance')}:</span>
          <span className="font-semibold">{rx.pupillaryDistance} mm</span>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function CreateOrderPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()

  // Data
  const [customers, setCustomers] = useState<Customer[]>([])
  const [frames, setFrames] = useState<Frame[]>([])
  const [lensTypes, setLensTypes] = useState<LensType[]>([])
  const [contactLenses, setContactLenses] = useState<ContactLens[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])

  // Form state
  const [customerId, setCustomerId] = useState('')
  const [prescriptionId, setPrescriptionId] = useState('')
  const [selectedFrames, setSelectedFrames] = useState<SelectedFrame[]>([])

  // VL (distance) lens per eye
  const [vlRightLensId, setVlRightLensId] = useState('')
  const [vlRightLensPrice, setVlRightLensPrice] = useState(0)
  const [vlRightQty, setVlRightQty] = useState(1)
  const [vlLeftLensId, setVlLeftLensId] = useState('')
  const [vlLeftLensPrice, setVlLeftLensPrice] = useState(0)
  const [vlLeftQty, setVlLeftQty] = useState(1)

  // VP (near) lens per eye
  const [vpRightLensId, setVpRightLensId] = useState('')
  const [vpRightLensPrice, setVpRightLensPrice] = useState(0)
  const [vpRightQty, setVpRightQty] = useState(1)
  const [vpLeftLensId, setVpLeftLensId] = useState('')
  const [vpLeftLensPrice, setVpLeftLensPrice] = useState(0)
  const [vpLeftQty, setVpLeftQty] = useState(1)

  // Contact lenses
  const [selectedContactLenses, setSelectedContactLenses] = useState<{ id: string; brand: string; model?: string; price: number; qty: number }[]>([])

  // Additional services
  const [services, setServices] = useState<AdditionalService[]>([])
  const [newServiceName, setNewServiceName] = useState('')
  const [newServicePrice, setNewServicePrice] = useState('')

  // Pricing
  const [depositAmount, setDepositAmount] = useState(0)
  const [notes, setNotes] = useState('')
  const [readyDate, setReadyDate] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [createdOrder, setCreatedOrder] = useState<any>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [isScanning, setIsScanning] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const [showCameraModal, setShowCameraModal] = useState(false)
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null)
  const [autoScanStatus, setAutoScanStatus] = useState<'idle' | 'scanning' | 'analyzing' | 'found'>('idle')
  const autoScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoScanActiveRef = useRef(false)

  // Order number
  const [orderNumber, setOrderNumber] = useState('')

  // Inline new customer form
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [newCustFirstName, setNewCustFirstName] = useState('')
  const [newCustLastName, setNewCustLastName] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [newCustCreating, setNewCustCreating] = useState(false)

  // Inline new prescription form
  const [showNewRxForm, setShowNewRxForm] = useState(false)
  const [newRxCreating, setNewRxCreating] = useState(false)
  const [newRxDoctor, setNewRxDoctor] = useState('')
  const [newRxDate, setNewRxDate] = useState(new Date().toISOString().split('T')[0])
  const [newRxPD, setNewRxPD] = useState('')
  const [newRxHasVL, setNewRxHasVL] = useState(true)
  const [newRxHasVP, setNewRxHasVP] = useState(false)
  const [newRxVLRightSph, setNewRxVLRightSph] = useState('0.00')
  const [newRxVLRightCyl, setNewRxVLRightCyl] = useState('0.00')
  const [newRxVLRightAxis, setNewRxVLRightAxis] = useState('')
  const [newRxVLLeftSph, setNewRxVLLeftSph] = useState('0.00')
  const [newRxVLLeftCyl, setNewRxVLLeftCyl] = useState('0.00')
  const [newRxVLLeftAxis, setNewRxVLLeftAxis] = useState('')
  const [newRxVPRightSph, setNewRxVPRightSph] = useState('0.00')
  const [newRxVPRightCyl, setNewRxVPRightCyl] = useState('0.00')
  const [newRxVPRightAxis, setNewRxVPRightAxis] = useState('')
  const [newRxVPRightAdd, setNewRxVPRightAdd] = useState('')
  const [newRxVPLeftSph, setNewRxVPLeftSph] = useState('0.00')
  const [newRxVPLeftCyl, setNewRxVPLeftCyl] = useState('0.00')
  const [newRxVPLeftAxis, setNewRxVPLeftAxis] = useState('')
  const [newRxVPLeftAdd, setNewRxVPLeftAdd] = useState('')

  // Helper: adjust value by step (+/- 0.25 for sph/cyl, +/- 1 for axis)
  const rxAdjust = (value: string, increase: boolean, isAxis = false): string => {
    let num = parseFloat(value) || 0
    if (isAxis) {
      num = increase ? num + 1 : num - 1
      if (num < 0) num = 0; if (num > 180) num = 180
      return Math.round(num).toString()
    }
    num = increase ? num + 0.25 : num - 0.25
    return num.toFixed(2)
  }

  // Auto-calculate VP from VL + ADD
  const calcVpFromAdd = (eye: 'right' | 'left', addValue: string) => {
    if (!addValue || !newRxHasVL) return
    const add = parseFloat(addValue)
    if (isNaN(add)) return
    if (eye === 'right') {
      const vlSph = parseFloat(newRxVLRightSph)
      if (!isNaN(vlSph)) { setNewRxVPRightSph((vlSph + add).toFixed(2)); setNewRxVPRightCyl(newRxVLRightCyl); setNewRxVPRightAxis(newRxVLRightAxis) }
    } else {
      const vlSph = parseFloat(newRxVLLeftSph)
      if (!isNaN(vlSph)) { setNewRxVPLeftSph((vlSph + add).toFixed(2)); setNewRxVPLeftCyl(newRxVLLeftCyl); setNewRxVPLeftAxis(newRxVLLeftAxis) }
    }
  }

  // ─── Load data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    Promise.all([
      window.electronAPI.getCustomers({ userId: user.id, limit: 500 }),
      window.electronAPI.getFrames({ userId: user.id }),
      window.electronAPI.getLensTypes({ userId: user.id }),
      window.electronAPI.getContactLenses({ userId: user.id }),
    ]).then(([custRes, frameRes, lensRes, clRes]) => {
      if (custRes.data) setCustomers(custRes.data)
      if (frameRes.data) setFrames(frameRes.data)
      if (lensRes.data) setLensTypes(lensRes.data)
      if (clRes.data) setContactLenses(clRes.data)
    })

    // Fetch latest order number and compute next sequential one
    window.electronAPI.getLatestOrderNumber(user.id).then(res => {
      const latest = res.data // e.g. "ORD-042" or null
      if (latest && typeof latest === 'string') {
        const match = latest.match(/ORD-(\d+)/)
        if (match) {
          const next = parseInt(match[1], 10) + 1
          setOrderNumber(`ORD-${String(next).padStart(3, '0')}`)
        } else {
          setOrderNumber('ORD-001')
        }
      } else {
        setOrderNumber('ORD-001')
      }
    })

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setReadyDate(tomorrow.toISOString().split('T')[0])
  }, [user?.id])

  // Load prescriptions when customer changes — do NOT auto-select
  useEffect(() => {
    if (!customerId || !user?.id) { setPrescriptions([]); setPrescriptionId(''); return }
    window.electronAPI.getPrescriptions({ customerId, limit: 50 }).then(res => {
      const list = res.data?.prescriptions || res.data || []
      setPrescriptions(Array.isArray(list) ? list : [])
      setPrescriptionId('')
    })
  }, [customerId, user?.id])

  // ─── Price calculations ─────────────────────────────────────────────────
  const framesTotal = useMemo(() => selectedFrames.reduce((s, f) => s + f.price, 0), [selectedFrames])

  const lensTotal = useMemo(() =>
    (vlRightLensPrice * vlRightQty) + (vlLeftLensPrice * vlLeftQty) +
    (vpRightLensPrice * vpRightQty) + (vpLeftLensPrice * vpLeftQty),
    [vlRightLensPrice, vlRightQty, vlLeftLensPrice, vlLeftQty, vpRightLensPrice, vpRightQty, vpLeftLensPrice, vpLeftQty]
  )

  const contactLensTotal = useMemo(() => selectedContactLenses.reduce((s, cl) => s + cl.price * cl.qty, 0), [selectedContactLenses])
  const servicesTotal = useMemo(() => services.reduce((s, svc) => s + svc.price, 0), [services])
  const totalPrice = framesTotal + lensTotal + contactLensTotal + servicesTotal
  const balanceDue = Math.max(0, totalPrice - depositAmount)

  // ─── Handlers ───────────────────────────────────────────────────────────
  const addService = () => {
    const price = parseFloat(newServicePrice)
    if (!newServiceName.trim() || isNaN(price)) return
    setServices(prev => [...prev, { name: newServiceName.trim(), price }])
    setNewServiceName('')
    setNewServicePrice('')
  }

  const handleCreateCustomer = async () => {
    if (!newCustFirstName.trim()) { toast.error('Le prénom est requis'); return }
    // Duplicate check
    const fn = newCustFirstName.trim().toLowerCase()
    const ln = (newCustLastName.trim() || '').toLowerCase()
    const duplicate = customers.find(c =>
      c.firstName?.toLowerCase() === fn && (c.lastName || '').toLowerCase() === ln
    )
    if (duplicate) {
      toast.error(`Le client "${newCustFirstName.trim()} ${newCustLastName.trim()}" existe déjà.`)
      return
    }
    setNewCustCreating(true)
    try {
      const res = await window.electronAPI.createCustomer({
        firstName: newCustFirstName.trim(),
        lastName: newCustLastName.trim() || '',
        phone: newCustPhone.trim() || undefined,
        userId: user!.id,
      })
      if (res.error) { toast.error(res.error); return }
      if (res.data) {
        setCustomers(prev => [res.data, ...prev])
        setCustomerId(res.data.id)
        setNewCustFirstName(''); setNewCustLastName(''); setNewCustPhone('')
        setShowNewCustomerForm(false)
        toast.success(t('customers.customerCreated') || 'Customer created')
      }
    } catch (err: any) { toast.error(err.message || 'Failed') }
    finally { setNewCustCreating(false) }
  }

  const handleCreatePrescription = async () => {
    if (!customerId) return
    setNewRxCreating(true)
    try {
      const pf = (v: string) => v.trim() ? parseFloat(v) : undefined
      const now = new Date()
      const expiry = new Date(now); expiry.setFullYear(expiry.getFullYear() + 1)
      const rxData: any = {
        customerId,
        doctorName: 'Self-reported',
        doctorLicense: '',
        examinationDate: now.toISOString(),
        expirationDate: expiry.toISOString(),
        pupillaryDistance: 65,
        hasVLData: newRxHasVL,
        hasVPData: newRxHasVP,
      }
      if (newRxHasVL) {
        rxData.vlRightEyeSphere = pf(newRxVLRightSph); rxData.vlRightEyeCylinder = pf(newRxVLRightCyl); rxData.vlRightEyeAxis = pf(newRxVLRightAxis)
        rxData.vlLeftEyeSphere = pf(newRxVLLeftSph); rxData.vlLeftEyeCylinder = pf(newRxVLLeftCyl); rxData.vlLeftEyeAxis = pf(newRxVLLeftAxis)
      }
      if (newRxHasVP) {
        rxData.vpRightEyeSphere = pf(newRxVPRightSph); rxData.vpRightEyeCylinder = pf(newRxVPRightCyl); rxData.vpRightEyeAxis = pf(newRxVPRightAxis); rxData.vpRightEyeAdd = pf(newRxVPRightAdd)
        rxData.vpLeftEyeSphere = pf(newRxVPLeftSph); rxData.vpLeftEyeCylinder = pf(newRxVPLeftCyl); rxData.vpLeftEyeAxis = pf(newRxVPLeftAxis); rxData.vpLeftEyeAdd = pf(newRxVPLeftAdd)
      }
      const res = await window.electronAPI.createPrescription(rxData)
      if (res.error) { toast.error(res.error); return }
      if (res.data) {
        setPrescriptions(prev => [res.data, ...prev])
        setPrescriptionId(res.data.id)
        setShowNewRxForm(false)
        // Reset form
        setNewRxDoctor(''); setNewRxPD('')
        setNewRxVLRightSph('0.00'); setNewRxVLRightCyl('0.00'); setNewRxVLRightAxis('')
        setNewRxVLLeftSph('0.00'); setNewRxVLLeftCyl('0.00'); setNewRxVLLeftAxis('')
        setNewRxVPRightSph('0.00'); setNewRxVPRightCyl('0.00'); setNewRxVPRightAxis(''); setNewRxVPRightAdd('')
        setNewRxVPLeftSph('0.00'); setNewRxVPLeftCyl('0.00'); setNewRxVPLeftAxis(''); setNewRxVPLeftAdd('')
        toast.success(t('prescriptions.created') || 'Prescription created')
      }
    } catch (err: any) { toast.error(err.message || 'Failed') }
    finally { setNewRxCreating(false) }
  }

  // Shared: send base64 image to AI and fill prescription form
  const processAiScan = async (base64: string) => {
    setIsScanning(true)
    try {
      toast.info('Analyse de l\'ordonnance en cours...', { duration: 3000 })
      const res = await window.electronAPI.scanOrdonnance(base64)

      if (res.error) { toast.error(`Erreur AI: ${res.error}`); return }
      if (!res.data) { toast.error('Aucune donnée extraite de l\'image'); return }

      const d = res.data
      setShowNewRxForm(true)

      const hasVL = !!(d.vlRightEyeSphere || d.vlLeftEyeSphere || d.vlRightEyeCylinder || d.vlLeftEyeCylinder)
      const hasVP = !!(d.vpRightEyeSphere || d.vpLeftEyeSphere || d.vpRightEyeCylinder || d.vpLeftEyeCylinder || d.vpRightEyeAddition || d.vpLeftEyeAddition)

      setNewRxHasVL(hasVL)
      setNewRxHasVP(hasVP)

      if (hasVL) {
        setNewRxVLRightSph(d.vlRightEyeSphere || '0.00')
        setNewRxVLRightCyl(d.vlRightEyeCylinder || '0.00')
        setNewRxVLRightAxis(d.vlRightEyeAxis || '')
        setNewRxVLLeftSph(d.vlLeftEyeSphere || '0.00')
        setNewRxVLLeftCyl(d.vlLeftEyeCylinder || '0.00')
        setNewRxVLLeftAxis(d.vlLeftEyeAxis || '')
      }

      if (hasVP) {
        setNewRxVPRightSph(d.vpRightEyeSphere || '0.00')
        setNewRxVPRightCyl(d.vpRightEyeCylinder || '0.00')
        setNewRxVPRightAxis(d.vpRightEyeAxis || '')
        setNewRxVPRightAdd(d.vpRightEyeAddition || '')
        setNewRxVPLeftSph(d.vpLeftEyeSphere || '0.00')
        setNewRxVPLeftCyl(d.vpLeftEyeCylinder || '0.00')
        setNewRxVPLeftAxis(d.vpLeftEyeAxis || '')
        setNewRxVPLeftAdd(d.vpLeftEyeAddition || '')
      }

      if (d.pupillaryDistance) setNewRxPD(d.pupillaryDistance)

      toast.success('Ordonnance scannée avec succès !', {
        description: `${hasVL ? 'VL' : ''}${hasVL && hasVP ? ' + ' : ''}${hasVP ? 'VP' : ''} détectés. Vérifiez les valeurs avant de sauvegarder.`,
      })
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du scan')
    } finally {
      setIsScanning(false)
    }
  }

  const handleScanOrdonnance = async () => {
    scanInputRef.current?.click()
  }

  const handleScanFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const base64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
    await processAiScan(base64)
  }

  // ── Live Camera Scanner with Smart Auto-Detection ──────────────────────
  // Phase 1: Fast local check every 500ms — detect if a document/paper is visible
  // Phase 2: Only when document detected → send to AI for full prescription extraction

  const captureFrame = (): string | null => {
    const video = cameraVideoRef.current
    const canvas = cameraCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return null
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.90)
  }

  // Fast local document detection using edge density analysis
  // Returns true if the center of the frame has enough edges (text/lines on paper)
  const detectDocumentInFrame = (): boolean => {
    const video = cameraVideoRef.current
    const canvas = cameraCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return false
    // Use a small resolution for speed
    const w = 320
    const h = Math.round(w * (video.videoHeight / video.videoWidth))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(video, 0, 0, w, h)

    // Analyze the center 60% of the image (where the document should be)
    const cx = Math.round(w * 0.2), cy = Math.round(h * 0.2)
    const cw = Math.round(w * 0.6), ch = Math.round(h * 0.6)
    const imgData = ctx.getImageData(cx, cy, cw, ch)
    const pixels = imgData.data

    // Convert to grayscale and compute edge density (simple Sobel-like horizontal gradient)
    let edgeCount = 0
    const stride = cw * 4
    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const i = (y * cw + x) * 4
        const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
        const grayRight = pixels[i + 4] * 0.299 + pixels[i + 5] * 0.587 + pixels[i + 6] * 0.114
        const grayBelow = pixels[i + stride] * 0.299 + pixels[i + stride + 1] * 0.587 + pixels[i + stride + 2] * 0.114
        const gx = Math.abs(gray - grayRight)
        const gy = Math.abs(gray - grayBelow)
        if (gx + gy > 30) edgeCount++
      }
    }

    const totalPixels = (cw - 2) * (ch - 2)
    const edgeDensity = edgeCount / totalPixels

    // A blank wall/hand has ~2-5% edges. A document with text has ~12-30%+
    return edgeDensity > 0.08
  }

  const stopAutoScan = () => {
    autoScanActiveRef.current = false
    if (autoScanTimerRef.current) {
      clearTimeout(autoScanTimerRef.current)
      autoScanTimerRef.current = null
    }
  }

  const startAutoScan = () => {
    autoScanActiveRef.current = true
    setAutoScanStatus('scanning')
    runDetectionLoop()
  }

  // Fast detection loop — checks for document every 500ms, only calls AI when found
  const runDetectionLoop = () => {
    if (!autoScanActiveRef.current) return
    autoScanTimerRef.current = setTimeout(async () => {
      if (!autoScanActiveRef.current) return

      // Phase 1: Quick local check
      const hasDocument = detectDocumentInFrame()

      if (!hasDocument) {
        // Nothing visible — keep checking fast
        setAutoScanStatus('scanning')
        runDetectionLoop()
        return
      }

      // Phase 2: Document detected! Capture full-res, close camera immediately, then analyze
      const video = cameraVideoRef.current
      const canvas = cameraCanvasRef.current
      if (!video || !canvas) { runDetectionLoop(); return }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { runDetectionLoop(); return }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', 0.92)

      // Close camera right away — user can put the prescription down
      stopAutoScan()
      closeCameraModal()
      setIsScanning(true)
      toast.info('Image capturée — analyse en cours...', { duration: 5000 })

      try {
        const res = await window.electronAPI.scanOrdonnance(base64)

        if (res.data && !res.error) {
          const d = res.data
          const hasVL = !!(d.vlRightEyeSphere || d.vlLeftEyeSphere || d.vlRightEyeCylinder || d.vlLeftEyeCylinder)
          const hasVP = !!(d.vpRightEyeSphere || d.vpLeftEyeSphere || d.vpRightEyeCylinder || d.vpLeftEyeCylinder || d.vpRightEyeAddition || d.vpLeftEyeAddition)

          if (hasVL || hasVP) {
            setShowNewRxForm(true)
            setNewRxHasVL(hasVL)
            setNewRxHasVP(hasVP)
            if (hasVL) {
              setNewRxVLRightSph(d.vlRightEyeSphere || '0.00')
              setNewRxVLRightCyl(d.vlRightEyeCylinder || '0.00')
              setNewRxVLRightAxis(d.vlRightEyeAxis || '')
              setNewRxVLLeftSph(d.vlLeftEyeSphere || '0.00')
              setNewRxVLLeftCyl(d.vlLeftEyeCylinder || '0.00')
              setNewRxVLLeftAxis(d.vlLeftEyeAxis || '')
            }
            if (hasVP) {
              setNewRxVPRightSph(d.vpRightEyeSphere || '0.00')
              setNewRxVPRightCyl(d.vpRightEyeCylinder || '0.00')
              setNewRxVPRightAxis(d.vpRightEyeAxis || '')
              setNewRxVPRightAdd(d.vpRightEyeAddition || '')
              setNewRxVPLeftSph(d.vpLeftEyeSphere || '0.00')
              setNewRxVPLeftCyl(d.vpLeftEyeCylinder || '0.00')
              setNewRxVPLeftAxis(d.vpLeftEyeAxis || '')
              setNewRxVPLeftAdd(d.vpLeftEyeAddition || '')
            }
            if (d.pupillaryDistance) setNewRxPD(d.pupillaryDistance)
            toast.success('Ordonnance détectée automatiquement !', {
              description: `${hasVL ? 'VL' : ''}${hasVL && hasVP ? ' + ' : ''}${hasVP ? 'VP' : ''} détectés. Vérifiez les valeurs.`,
            })
            setIsScanning(false)
            return
          }
        }
        // AI didn't find prescription — let user know
        toast.warning('Document détecté mais pas d\'ordonnance. Réessayez.')
        setIsScanning(false)
      } catch {
        toast.error('Erreur lors de l\'analyse. Réessayez.')
        setIsScanning(false)
      }
    }, 500)
  }

  const openCameraModal = async () => {
    setShowCameraModal(true)
    setAutoScanStatus('idle')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      cameraStreamRef.current = stream
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
          cameraVideoRef.current.play()
        }
        startAutoScan()
      }, 500)
    } catch (err: any) {
      toast.error('Impossible d\'accéder à la caméra: ' + (err.message || 'Permission refusée'))
      setShowCameraModal(false)
    }
  }

  const closeCameraModal = () => {
    stopAutoScan()
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop())
      cameraStreamRef.current = null
    }
    setAutoScanStatus('idle')
    setShowCameraModal(false)
  }

  const captureAndScan = async () => {
    stopAutoScan()
    const video = cameraVideoRef.current
    const canvas = cameraCanvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const base64 = canvas.toDataURL('image/jpeg', 0.92)
    closeCameraModal()
    await processAiScan(base64)
  }

  const removeService = (index: number) => setServices(prev => prev.filter((_, i) => i !== index))
  const addFrame = (frame: SelectedFrame) => setSelectedFrames(prev => [...prev, frame])
  const removeFrame = (index: number) => setSelectedFrames(prev => prev.filter((_, i) => i !== index))

  const setReadyDays = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days)
    setReadyDate(d.toISOString().split('T')[0])
  }

  const handleSubmit = () => {
    if (!customerId) { toast.error(t('orders.selectCustomerError')); return }
    if (totalPrice <= 0) { toast.error(t('orders.totalPriceError')); return }
    setShowConfirmation(true)
  }

  const handleConfirmedSubmit = async (printAfter = false) => {
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      const lensTypeId = vlRightLensId || vlLeftLensId || vpRightLensId || vpLeftLensId || undefined

      const orderData: any = {
        orderNumber,
        customerId,
        userId: user!.id,
        prescriptionId: prescriptionId || undefined,
        frameId: selectedFrames.length > 0 ? selectedFrames[0].id : undefined,
        lensTypeId,
        vlRightEyeLensTypeId: vlRightLensId || undefined,
        vlLeftEyeLensTypeId: vlLeftLensId || undefined,
        vpRightEyeLensTypeId: vpRightLensId || undefined,
        vpLeftEyeLensTypeId: vpLeftLensId || undefined,
        vlRightEyeLensQuantity: vlRightQty,
        vlLeftEyeLensQuantity: vlLeftQty,
        vpRightEyeLensQuantity: vpRightQty,
        vpLeftEyeLensQuantity: vpLeftQty,
        framePrice: framesTotal,
        vlRightEyeLensPrice: vlRightLensPrice * vlRightQty,
        vlLeftEyeLensPrice: vlLeftLensPrice * vlLeftQty,
        vpRightEyeLensPrice: vpRightLensPrice * vpRightQty,
        vpLeftEyeLensPrice: vpLeftLensPrice * vpLeftQty,
        basePrice: framesTotal + lensTotal,
        addonsPrice: servicesTotal + contactLensTotal,
        totalPrice,
        depositAmount,
        balanceDue,
        status: 'in_progress',
        expectedCompletionDate: readyDate ? new Date(readyDate).toISOString() : new Date().toISOString(),
        createdAt: orderDate ? new Date(orderDate).toISOString() : new Date().toISOString(),
        customerNotes: notes,
        technicalNotes: [
          ...(selectedContactLenses.length > 0 ? [`Contact Lenses: ${selectedContactLenses.map(cl => `${cl.brand}${cl.model ? ' ' + cl.model : ''} x${cl.qty}: ${cl.price * cl.qty} DA`).join(', ')}`] : []),
          ...(services.length > 0 ? [`Additional Services: ${services.map(s => `${s.name}: ${s.price} DA`).join(', ')}`] : []),
        ].join(' | '),
      }

      const result = await window.electronAPI.createOrder(orderData)
      if (result.error) {
        toast.error(result.error)
        setIsSubmitting(false)
        setShowConfirmation(false)
        return
      }

      toast.success(t('orders.orderCreated'))
      setShowConfirmation(false)

      if (printAfter && result.data?.id) {
        // Fetch full order with relations, render hidden slip, print immediately
        const fullOrder = await window.electronAPI.getOrder(result.data.id)
        if (fullOrder.data) {
          setCreatedOrder(fullOrder.data)
          // Wait for React to render the hidden print-slip-content div
          await new Promise(r => setTimeout(r, 100))
          await window.electronAPI.printSlip()
        }
        navigate('/orders')
      } else {
        navigate('/orders')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create order')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePrint = () => {
    window.electronAPI.printSlip()
  }

  // ─── Selected prescription ──────────────────────────────────────────────
  const selectedPrescription = prescriptions.find(p => p.id === prescriptionId)

  // ─── Ready date shortcuts ──────────────────────────────────────────────
  const readyDateOptions = [
    { label: t('orders.tomorrow'), days: 1 },
    { label: t('orders.in2Days'), days: 2 },
    { label: t('orders.in3Days'), days: 3 },
    { label: t('orders.in4Days'), days: 4 },
    { label: t('orders.in1Week'), days: 7 },
    { label: t('orders.in10Days'), days: 10 },
    { label: t('orders.in15Days'), days: 15 },
    { label: t('orders.in20Days'), days: 20 },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────
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
    <div className="max-w-5xl mx-auto pb-12">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-3">
              {t('orders.createOrder')}
              {orderNumber && (
                <span className="text-base font-medium px-3 py-1 bg-primary/10 text-primary rounded-lg">{orderNumber}</span>
              )}
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                className="text-base font-medium px-3 py-1 border border-border rounded-lg bg-background" />
            </h1>
            <p className="text-muted-foreground text-sm">{t('orders.fillOrderDetails')}</p>
          </div>
          <button onClick={() => navigate('/orders')} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">
            {t('orders.backToOrders')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left Column: Main Form ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* 1. Customer Selection */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center font-bold">1</span>
              {t('common.customer')}
            </h3>
            <CustomerSearch customers={customers} value={customerId} onChange={setCustomerId} t={t} />

            {/* Inline Add New Customer */}
            {!showNewCustomerForm ? (
              <button type="button" onClick={() => setShowNewCustomerForm(true)}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-all shadow-sm">
                <Plus className="h-3.5 w-3.5" /> {t('customers.addCustomer') || 'Add New Customer'}
              </button>
            ) : (
              <div className="mt-3 p-3 border border-dashed border-primary/40 rounded-lg bg-primary/5 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-primary">{t('customers.addCustomer') || 'New Customer'}</span>
                  <button type="button" onClick={() => setShowNewCustomerForm(false)} className="p-0.5 hover:bg-muted rounded">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={newCustFirstName} onChange={e => setNewCustFirstName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateCustomer() }}
                    placeholder={t('customers.firstName') || 'First name'} className="px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                  <input value={newCustLastName} onChange={e => setNewCustLastName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateCustomer() }}
                    placeholder={t('customers.lastName') || 'Last name'} className="px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                </div>
                <input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateCustomer() }}
                  placeholder={t('customers.phone') || 'Phone'} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                <button type="button" onClick={handleCreateCustomer} disabled={newCustCreating || !newCustFirstName.trim()}
                  className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> {newCustCreating ? '...' : (t('common.create') || 'Create')}
                </button>
              </div>
            )}
          </div>

          {/* 2. Prescription Section — only when customer selected */}
          {customerId && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs flex items-center justify-center font-bold">2</span>
                  {t('orders.prescriptionInformation')}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openCameraModal}
                    disabled={isScanning}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 text-emerald-700 dark:text-emerald-300 hover:from-emerald-100 hover:to-teal-100 dark:hover:from-emerald-900/50 dark:hover:to-teal-900/50 transition-all duration-200 disabled:opacity-60 disabled:cursor-wait shadow-sm"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Scanner Live
                  </button>
                  <button
                    type="button"
                    onClick={handleScanOrdonnance}
                    disabled={isScanning}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-violet-300 dark:border-violet-700 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/30 dark:to-purple-900/30 text-violet-700 dark:text-violet-300 hover:from-violet-100 hover:to-purple-100 dark:hover:from-violet-900/50 dark:hover:to-purple-900/50 transition-all duration-200 disabled:opacity-60 disabled:cursor-wait shadow-sm"
                  >
                    {isScanning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ScanLine className="h-3.5 w-3.5" />
                    )}
                    {isScanning ? 'Analyse...' : 'Importer Image'}
                  </button>
                </div>
                <input
                  ref={scanInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleScanFileSelected}
                />
              </div>

              {prescriptions.length > 0 && (
                <PrescriptionSelect prescriptions={prescriptions} value={prescriptionId} onChange={setPrescriptionId} t={t} />
              )}
              {prescriptions.length === 0 && !showNewRxForm && (
                <p className="text-sm text-muted-foreground">{t('orders.noPrescriptions')}</p>
              )}

              {/* Show table only when user explicitly selects a prescription */}
              {selectedPrescription && (
                <div className="mt-4">
                  <PrescriptionTable rx={selectedPrescription} t={t} />
                </div>
              )}

              {/* Add New Prescription — Quick Prescription (like web app) */}
              {!showNewRxForm ? (
                <button type="button" onClick={() => setShowNewRxForm(true)}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all shadow-sm">
                  <Plus className="h-3.5 w-3.5" /> {t('prescriptions.addPrescription') || 'Add New Prescription'}
                </button>
              ) : (
                <div className="mt-3 p-4 border border-green-300 dark:border-green-700 rounded-xl bg-green-50/60 dark:bg-green-900/15 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">{t('prescriptions.addPrescription') || 'Quick Prescription'}</span>
                    <button type="button" onClick={() => setShowNewRxForm(false)} className="p-1 hover:bg-muted rounded-full">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>

                  {/* VL / VP toggle switches */}
                  <div className="flex items-center gap-6 border-y border-border/50 py-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <div className={`relative w-9 h-5 rounded-full transition-colors ${newRxHasVL ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        onClick={() => setNewRxHasVL(!newRxHasVL)}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${newRxHasVL ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-sm font-medium">{t('prescriptions.distanceVision') || 'Distance Vision (VL)'}</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <div className={`relative w-9 h-5 rounded-full transition-colors ${newRxHasVP ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        onClick={() => setNewRxHasVP(!newRxHasVP)}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${newRxHasVP ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-sm font-medium">{t('prescriptions.nearVision') || 'Near Vision (VP)'}</span>
                    </label>
                  </div>

                  {/* No type selected message */}
                  {!newRxHasVL && !newRxHasVP && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      {t('prescriptions.enableOneType') || 'Enable at least one prescription type (VL or VP)'}
                    </div>
                  )}

                  {/* ── VL Distance Vision ─────────────────────────── */}
                  {newRxHasVL && (
                    <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-3">
                      <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300">{t('prescriptions.distanceVision') || 'Distance Vision (VL)'}</h4>

                      {/* Right Eye (OD) */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-foreground">{t('prescriptions.rightEye') || 'Right Eye (OD)'}</div>
                        <div className="grid grid-cols-3 gap-2">
                          {/* SPH */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">SPH</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVLRightSph(rxAdjust(newRxVLRightSph, false))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVLRightSph} onChange={e => setNewRxVLRightSph(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" />
                              <button type="button" onClick={() => setNewRxVLRightSph(rxAdjust(newRxVLRightSph, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                          {/* CYL */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">CYL</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVLRightCyl(rxAdjust(newRxVLRightCyl, false))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVLRightCyl} onChange={e => setNewRxVLRightCyl(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" />
                              <button type="button" onClick={() => setNewRxVLRightCyl(rxAdjust(newRxVLRightCyl, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                          {/* AXIS */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">AXIS</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVLRightAxis(rxAdjust(newRxVLRightAxis, false, true))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVLRightAxis} onChange={e => setNewRxVLRightAxis(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" placeholder="0" />
                              <button type="button" onClick={() => setNewRxVLRightAxis(rxAdjust(newRxVLRightAxis, true, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Left Eye (OS) */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-foreground">{t('prescriptions.leftEye') || 'Left Eye (OS)'}</div>
                        <div className="grid grid-cols-3 gap-2">
                          {/* SPH */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">SPH</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVLLeftSph(rxAdjust(newRxVLLeftSph, false))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVLLeftSph} onChange={e => setNewRxVLLeftSph(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" />
                              <button type="button" onClick={() => setNewRxVLLeftSph(rxAdjust(newRxVLLeftSph, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                          {/* CYL */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">CYL</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVLLeftCyl(rxAdjust(newRxVLLeftCyl, false))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVLLeftCyl} onChange={e => setNewRxVLLeftCyl(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" />
                              <button type="button" onClick={() => setNewRxVLLeftCyl(rxAdjust(newRxVLLeftCyl, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                          {/* AXIS */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">AXIS</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVLLeftAxis(rxAdjust(newRxVLLeftAxis, false, true))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVLLeftAxis} onChange={e => setNewRxVLLeftAxis(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" placeholder="0" />
                              <button type="button" onClick={() => setNewRxVLLeftAxis(rxAdjust(newRxVLLeftAxis, true, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── VP Near Vision ─────────────────────────────── */}
                  {newRxHasVP && (
                    <div className="border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-3">
                      <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-300">{t('prescriptions.nearVision') || 'Near Vision (VP)'}</h4>

                      {/* ADD section — auto-calc VP from VL */}
                      {newRxHasVL && (
                        <div className="border border-green-200 dark:border-green-800 rounded-lg p-3 bg-green-50/50 dark:bg-green-900/20 space-y-2">
                          <div className="text-xs font-semibold text-green-700 dark:text-green-400">{t('orders.addition') || 'ADD Values'}</div>
                          <p className="text-[11px] text-muted-foreground">{t('prescriptions.addDescription') || 'VP is auto-calculated from VL + ADD'}</p>
                          <div className="grid grid-cols-2 gap-3">
                            {/* Right ADD */}
                            <div>
                              <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">{t('prescriptions.rightEye') || 'OD'} ADD</div>
                              <div className="flex">
                                <button type="button" onClick={() => { const v = rxAdjust(newRxVPRightAdd || '0.00', false); setNewRxVPRightAdd(v); calcVpFromAdd('right', v) }}
                                  className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                                <input value={newRxVPRightAdd} onChange={e => { setNewRxVPRightAdd(e.target.value); calcVpFromAdd('right', e.target.value) }}
                                  className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" placeholder="0.00" />
                                <button type="button" onClick={() => { const v = rxAdjust(newRxVPRightAdd || '0.00', true); setNewRxVPRightAdd(v); calcVpFromAdd('right', v) }}
                                  className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                              </div>
                            </div>
                            {/* Left ADD */}
                            <div>
                              <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">{t('prescriptions.leftEye') || 'OS'} ADD</div>
                              <div className="flex">
                                <button type="button" onClick={() => { const v = rxAdjust(newRxVPLeftAdd || '0.00', false); setNewRxVPLeftAdd(v); calcVpFromAdd('left', v) }}
                                  className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                                <input value={newRxVPLeftAdd} onChange={e => { setNewRxVPLeftAdd(e.target.value); calcVpFromAdd('left', e.target.value) }}
                                  className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" placeholder="0.00" />
                                <button type="button" onClick={() => { const v = rxAdjust(newRxVPLeftAdd || '0.00', true); setNewRxVPLeftAdd(v); calcVpFromAdd('left', v) }}
                                  className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Right Eye (OD) */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-foreground">{t('prescriptions.rightEye') || 'Right Eye (OD)'}</div>
                        <div className="grid grid-cols-3 gap-2">
                          {/* SPH */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">SPH</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVPRightSph(rxAdjust(newRxVPRightSph, false))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVPRightSph} onChange={e => setNewRxVPRightSph(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" />
                              <button type="button" onClick={() => setNewRxVPRightSph(rxAdjust(newRxVPRightSph, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                          {/* CYL */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">CYL</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVPRightCyl(rxAdjust(newRxVPRightCyl, false))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVPRightCyl} onChange={e => setNewRxVPRightCyl(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" />
                              <button type="button" onClick={() => setNewRxVPRightCyl(rxAdjust(newRxVPRightCyl, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                          {/* AXIS */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">AXIS</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVPRightAxis(rxAdjust(newRxVPRightAxis, false, true))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVPRightAxis} onChange={e => setNewRxVPRightAxis(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" placeholder="0" />
                              <button type="button" onClick={() => setNewRxVPRightAxis(rxAdjust(newRxVPRightAxis, true, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Left Eye (OS) */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-foreground">{t('prescriptions.leftEye') || 'Left Eye (OS)'}</div>
                        <div className="grid grid-cols-3 gap-2">
                          {/* SPH */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">SPH</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVPLeftSph(rxAdjust(newRxVPLeftSph, false))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVPLeftSph} onChange={e => setNewRxVPLeftSph(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" />
                              <button type="button" onClick={() => setNewRxVPLeftSph(rxAdjust(newRxVPLeftSph, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                          {/* CYL */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">CYL</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVPLeftCyl(rxAdjust(newRxVPLeftCyl, false))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVPLeftCyl} onChange={e => setNewRxVPLeftCyl(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" />
                              <button type="button" onClick={() => setNewRxVPLeftCyl(rxAdjust(newRxVPLeftCyl, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                          {/* AXIS */}
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-0.5 text-center">AXIS</div>
                            <div className="flex">
                              <button type="button" onClick={() => setNewRxVPLeftAxis(rxAdjust(newRxVPLeftAxis, false, true))}
                                className="px-2 py-1.5 border border-border rounded-l-lg bg-muted hover:bg-muted/80 text-sm font-medium">−</button>
                              <input value={newRxVPLeftAxis} onChange={e => setNewRxVPLeftAxis(e.target.value)}
                                className="flex-1 min-w-0 px-1 py-1.5 border-y border-border text-center text-sm bg-background" placeholder="0" />
                              <button type="button" onClick={() => setNewRxVPLeftAxis(rxAdjust(newRxVPLeftAxis, true, true))}
                                className="px-2 py-1.5 border border-border rounded-r-lg bg-muted hover:bg-muted/80 text-sm font-medium">+</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save button */}
                  <button type="button" onClick={handleCreatePrescription} disabled={newRxCreating || (!newRxHasVL && !newRxHasVP)}
                    className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    <Plus className="h-4 w-4" /> {newRxCreating ? '...' : (t('common.create') || 'Save Prescription')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. VL Distance Lenses — show if no prescription selected OR prescription has VL data */}
          {(!selectedPrescription || selectedPrescription.hasVLData) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center font-bold">3</span>
                {t('orders.vlDistanceLenses')}
              </h3>
              {/* Both Eyes selector */}
              <div className="mb-3 p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/30 rounded-lg">
                <LensTypeSelect lensTypes={lensTypes} value={vlRightLensId === vlLeftLensId ? vlRightLensId : ''} label={t('orders.bothEyes') || 'Both Eyes'} t={t}
                  onSelect={(id, price) => { setVlRightLensId(id); setVlRightLensPrice(price); setVlLeftLensId(id); setVlLeftLensPrice(price) }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <LensTypeSelect lensTypes={lensTypes} value={vlRightLensId} label={t('orders.rightEye')} t={t}
                    onSelect={(id, price) => { setVlRightLensId(id); setVlRightLensPrice(price) }} />
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs text-muted-foreground">{t('orders.qty')}:</label>
                    <input type="number" min={1} value={vlRightQty} onChange={e => setVlRightQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 border border-border rounded text-sm bg-background" />
                    {vlRightLensPrice > 0 && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {vlRightLensPrice.toLocaleString()} × {vlRightQty} = {(vlRightLensPrice * vlRightQty).toLocaleString()} {t('orders.currency')}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <LensTypeSelect lensTypes={lensTypes} value={vlLeftLensId} label={t('orders.leftEye')} t={t}
                    onSelect={(id, price) => { setVlLeftLensId(id); setVlLeftLensPrice(price) }} />
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs text-muted-foreground">{t('orders.qty')}:</label>
                    <input type="number" min={1} value={vlLeftQty} onChange={e => setVlLeftQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 border border-border rounded text-sm bg-background" />
                    {vlLeftLensPrice > 0 && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {vlLeftLensPrice.toLocaleString()} × {vlLeftQty} = {(vlLeftLensPrice * vlLeftQty).toLocaleString()} {t('orders.currency')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. VP Near Lenses — show if no prescription selected OR prescription has VP data */}
          {(!selectedPrescription || selectedPrescription.hasVPData) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs flex items-center justify-center font-bold">4</span>
                {t('orders.vpNearLenses')}
              </h3>
              {/* Both Eyes selector */}
              <div className="mb-3 p-3 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200/50 dark:border-purple-800/30 rounded-lg">
                <LensTypeSelect lensTypes={lensTypes} value={vpRightLensId === vpLeftLensId ? vpRightLensId : ''} label={t('orders.bothEyes') || 'Both Eyes'} t={t}
                  onSelect={(id, price) => { setVpRightLensId(id); setVpRightLensPrice(price); setVpLeftLensId(id); setVpLeftLensPrice(price) }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <LensTypeSelect lensTypes={lensTypes} value={vpRightLensId} label={t('orders.rightEye')} t={t}
                    onSelect={(id, price) => { setVpRightLensId(id); setVpRightLensPrice(price) }} />
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs text-muted-foreground">{t('orders.qty')}:</label>
                    <input type="number" min={1} value={vpRightQty} onChange={e => setVpRightQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 border border-border rounded text-sm bg-background" />
                    {vpRightLensPrice > 0 && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {vpRightLensPrice.toLocaleString()} × {vpRightQty} = {(vpRightLensPrice * vpRightQty).toLocaleString()} {t('orders.currency')}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <LensTypeSelect lensTypes={lensTypes} value={vpLeftLensId} label={t('orders.leftEye')} t={t}
                    onSelect={(id, price) => { setVpLeftLensId(id); setVpLeftLensPrice(price) }} />
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs text-muted-foreground">{t('orders.qty')}:</label>
                    <input type="number" min={1} value={vpLeftQty} onChange={e => setVpLeftQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 px-2 py-1 border border-border rounded text-sm bg-background" />
                    {vpLeftLensPrice > 0 && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {vpLeftLensPrice.toLocaleString()} × {vpLeftQty} = {(vpLeftLensPrice * vpLeftQty).toLocaleString()} {t('orders.currency')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. Contact Lenses */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 text-xs flex items-center justify-center font-bold">5</span>
              {t('orders.contactLenses')}
            </h3>
            {selectedContactLenses.length > 0 && (
              <div className="space-y-2 mb-3">
                {selectedContactLenses.map((cl, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                    <div>
                      <div className="font-medium text-sm">{cl.brand}{cl.model ? ` ${cl.model}` : ''}</div>
                      <div className="text-xs text-muted-foreground">{cl.price.toLocaleString()} {t('orders.currency')} × {cl.qty} = {(cl.price * cl.qty).toLocaleString()} {t('orders.currency')}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} value={cl.qty}
                        onChange={e => {
                          const qty = Math.max(1, parseInt(e.target.value) || 1)
                          setSelectedContactLenses(prev => prev.map((c, j) => j === i ? { ...c, qty } : c))
                        }}
                        className="w-16 px-2 py-1 border border-border rounded text-sm bg-background" />
                      <button type="button" onClick={() => setSelectedContactLenses(prev => prev.filter((_, j) => j !== i))} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                        <X className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {contactLenses.length > 0 ? (
              <select
                value=""
                onChange={e => {
                  const cl = contactLenses.find(c => c.id === e.target.value)
                  if (cl && !selectedContactLenses.find(s => s.id === cl.id)) {
                    setSelectedContactLenses(prev => [...prev, { id: cl.id, brand: cl.brand, model: cl.model, price: cl.price, qty: 1 }])
                  }
                }}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background">
                <option value="">{t('orders.selectContactLens')}</option>
                {contactLenses.filter(cl => !selectedContactLenses.find(s => s.id === cl.id)).map(cl => (
                  <option key={cl.id} value={cl.id}>{cl.brand}{cl.model ? ` ${cl.model}` : ''} — {cl.price.toLocaleString()} {t('orders.currency')}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">{t('orders.noContactLenses')}</p>
            )}
          </div>

          {/* 6. Frames — AFTER lenses */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs flex items-center justify-center font-bold">6</span>
              {t('orders.frames')}
            </h3>
            {selectedFrames.length > 0 && (
              <div className="space-y-2 mb-3">
                {selectedFrames.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                    <div>
                      <div className="font-medium text-sm">{f.brand} {f.model}</div>
                      <div className="text-xs text-muted-foreground">{f.price.toLocaleString()} {t('orders.currency')}</div>
                    </div>
                    <button type="button" onClick={() => removeFrame(i)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                      <X className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <FrameSelectDropdown frames={frames} onSelect={addFrame} exclude={selectedFrames.map(f => f.id)} t={t} />
          </div>

          {/* 7. Additional Services */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs flex items-center justify-center font-bold">7</span>
              {t('orders.additionalServices')}
            </h3>
            {services.length > 0 && (
              <div className="space-y-2 mb-3">
                {services.map((svc, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg border">
                    <span className="text-sm font-medium">{svc.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{svc.price.toLocaleString()} {t('orders.currency')}</span>
                      <button type="button" onClick={() => removeService(i)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder={t('orders.serviceName')}
                className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              <input value={newServicePrice} onChange={e => setNewServicePrice(e.target.value)} placeholder={t('common.price')} type="number"
                className="w-24 px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              <button type="button" onClick={addService}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 8. Notes & Dates */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs flex items-center justify-center font-bold">8</span>
              {t('orders.notesAndDates')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">{t('orders.readyDate')}</label>
                <input type="date" value={readyDate} onChange={e => setReadyDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background" />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {readyDateOptions.map(opt => {
                    const target = new Date(); target.setDate(target.getDate() + opt.days)
                    const targetStr = target.toISOString().split('T')[0]
                    const isActive = readyDate === targetStr
                    return (
                      <button key={opt.days} type="button" onClick={() => setReadyDays(opt.days)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${isActive ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 border-border hover:bg-muted'}`}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">{t('common.notes')}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder={t('orders.additionalNotes')}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background resize-none" />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right Column: Price Summary (Sticky) ───────────────────── */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-5">
              <h3 className="text-base font-semibold mb-4">{t('orders.orderSummary')}</h3>

              <div className="space-y-3 text-sm">
                {framesTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('orders.frames')} ({selectedFrames.length})</span>
                    <span className="font-medium">{framesTotal.toLocaleString()} {t('orders.currency')}</span>
                  </div>
                )}

                {(vlRightLensPrice * vlRightQty) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('orders.vlRight')}</span>
                    <span className="font-medium">{(vlRightLensPrice * vlRightQty).toLocaleString()} {t('orders.currency')}</span>
                  </div>
                )}
                {(vlLeftLensPrice * vlLeftQty) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('orders.vlLeft')}</span>
                    <span className="font-medium">{(vlLeftLensPrice * vlLeftQty).toLocaleString()} {t('orders.currency')}</span>
                  </div>
                )}
                {(vpRightLensPrice * vpRightQty) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('orders.vpRight')}</span>
                    <span className="font-medium">{(vpRightLensPrice * vpRightQty).toLocaleString()} {t('orders.currency')}</span>
                  </div>
                )}
                {(vpLeftLensPrice * vpLeftQty) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('orders.vpLeft')}</span>
                    <span className="font-medium">{(vpLeftLensPrice * vpLeftQty).toLocaleString()} {t('orders.currency')}</span>
                  </div>
                )}

                {servicesTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('orders.services')} ({services.length})</span>
                    <span className="font-medium">{servicesTotal.toLocaleString()} {t('orders.currency')}</span>
                  </div>
                )}

                <div className="border-t border-border pt-3">
                  <div className="flex justify-between text-base font-bold">
                    <span>{t('common.total')}</span>
                    <span className="text-primary">{totalPrice.toLocaleString()} {t('orders.currency')}</span>
                  </div>
                </div>
              </div>

              {/* Deposit */}
              <div className="mt-4">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">{t('orders.depositAmount')}</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={totalPrice} value={depositAmount || ''}
                    onChange={e => setDepositAmount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <span className="text-sm font-medium text-muted-foreground">{t('orders.currency')}</span>
                </div>
              </div>

              {/* Remaining Balance */}
              <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-green-800 dark:text-green-300 text-sm">{t('orders.remainingBalance')}</span>
                  <span className="font-bold text-xl text-green-700 dark:text-green-400">{balanceDue.toLocaleString()} {t('orders.currency')}</span>
                </div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">{t('orders.toBePaidUponPickup')}</div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-2">
                {/* Create & Print */}
                <button type="button" onClick={handleSubmit} disabled={isSubmitting || !customerId}
                  className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2">
                  <Printer className="h-4 w-4" />
                  {isSubmitting ? t('orders.creating') : t('orders.createAndPrint')}
                </button>
                {/* Create Only */}
                <button type="button" onClick={() => { if (!customerId) { toast.error(t('orders.selectCustomerError')); return }; if (totalPrice <= 0) { toast.error(t('orders.totalPriceError')); return }; handleConfirmedSubmit(false) }}
                  disabled={isSubmitting || !customerId}
                  className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmitting ? t('orders.creating') : t('orders.createOrder')}
                </button>
                {/* Cancel */}
                <button type="button" onClick={() => navigate('/orders')}
                  className="w-full py-2.5 px-4 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-md w-full border border-border">
            <h3 className="text-lg font-bold mb-2">{t('orders.confirmOrderCreation')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('orders.confirmOrderMessage')} <strong>{totalPrice.toLocaleString()} {t('orders.currency')}</strong>
              {depositAmount > 0 && <> {t('orders.withDeposit')} <strong>{depositAmount.toLocaleString()} {t('orders.currency')}</strong></>}?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirmation(false)} disabled={isSubmitting}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
              <button onClick={() => handleConfirmedSubmit(false)} disabled={isSubmitting}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                {isSubmitting ? t('orders.creating') : t('orders.createOrder')}
              </button>
              <button onClick={() => handleConfirmedSubmit(true)} disabled={isSubmitting}
                className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 flex items-center gap-1.5">
                <Printer className="h-3.5 w-3.5" />
                {isSubmitting ? t('orders.creating') : t('orders.createAndPrint')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Dialog Overlay — shows OrderSlip on the page and prints directly */}
      {showPrintDialog && createdOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-[600px] w-full border border-border max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="text-lg font-bold">{t('orders.printOrder')}</h3>
                <p className="text-xs text-muted-foreground">N° {createdOrder.orderNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint}
                  className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-green-700 hover:to-emerald-700 flex items-center gap-1.5">
                  <Printer className="h-4 w-4" />
                  {t('orders.printOrder')}
                </button>
                <button onClick={() => { setShowPrintDialog(false); navigate('/orders') }}
                  className="p-2 hover:bg-muted rounded-lg">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Slip Preview */}
            <div className="flex-1 overflow-y-auto p-5 bg-gray-50 dark:bg-gray-900">
              <div className="bg-white mx-auto shadow-md" style={{ maxWidth: '148mm' }} ref={printRef}>
                <OrderSlip order={createdOrder} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden print content — only visible when printing */}
      {createdOrder && (
        <div className="print-slip-content hidden print:block">
          <OrderSlip order={createdOrder} />
        </div>
      )}

      {/* ── Live Camera Scanner Modal ─────────────────────────────────────── */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <style>{`
            @keyframes scanLine {
              0% { top: 15%; }
              50% { top: 75%; }
              100% { top: 15%; }
            }
            .scan-line-anim {
              animation: scanLine 2.5s ease-in-out infinite;
            }
            @keyframes pulseGlow {
              0%, 100% { box-shadow: 0 0 8px rgba(16,185,129,0.3); }
              50% { box-shadow: 0 0 20px rgba(16,185,129,0.6); }
            }
            .scan-frame-active {
              animation: pulseGlow 2s ease-in-out infinite;
            }
            @keyframes foundFlash {
              0% { border-color: rgba(16,185,129,0.6); }
              50% { border-color: rgba(16,185,129,1); }
              100% { border-color: rgba(16,185,129,0.6); }
            }
            .scan-frame-found {
              animation: foundFlash 0.4s ease-in-out 3;
              border-style: solid !important;
              border-color: #10b981 !important;
            }
          `}</style>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Scanner Live — Ordonnance</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Auto-scan status badge */}
                {autoScanStatus === 'scanning' && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Recherche auto...
                  </span>
                )}
                {autoScanStatus === 'analyzing' && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analyse en cours...
                  </span>
                )}
                {autoScanStatus === 'found' && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                    <Check className="h-3 w-3" />
                    Ordonnance détectée !
                  </span>
                )}
                <button onClick={closeCameraModal} className="p-1.5 hover:bg-white/60 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Video Preview */}
            <div className="relative bg-black flex items-center justify-center" style={{ minHeight: '360px' }}>
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-h-[60vh] object-contain"
              />
              {/* Scanning overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`border-2 border-dashed rounded-lg relative ${
                    autoScanStatus === 'found'
                      ? 'scan-frame-found'
                      : autoScanStatus === 'analyzing'
                      ? 'border-amber-400/80 scan-frame-active'
                      : 'border-emerald-400/60 scan-frame-active'
                  }`}
                  style={{ width: '80%', height: '70%' }}
                >
                  {/* Animated scan line */}
                  {(autoScanStatus === 'scanning' || autoScanStatus === 'analyzing') && (
                    <div
                      className="scan-line-anim absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                      style={{ position: 'absolute' }}
                    />
                  )}
                  {/* Status label */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5">
                    {autoScanStatus === 'found' ? (
                      <><Check className="h-3 w-3 text-emerald-400" /> Ordonnance trouvée !</>
                    ) : autoScanStatus === 'analyzing' ? (
                      <><Loader2 className="h-3 w-3 animate-spin text-amber-400" /> Analyse de l'image...</>
                    ) : (
                      <>Placez l'ordonnance dans le cadre</>
                    )}
                  </div>
                  {/* Corner decorations */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400 rounded-tl" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400 rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400 rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400 rounded-br" />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-muted-foreground">
                Détection automatique active — ou capturez manuellement
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeCameraModal}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-border hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={captureAndScan}
                  disabled={isScanning || autoScanStatus === 'analyzing'}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 disabled:opacity-60"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Capture manuelle
                </button>
              </div>
            </div>
          </div>
          {/* Hidden canvas for capture */}
          <canvas ref={cameraCanvasRef} className="hidden" />
        </div>
      )}
    </div>
    </>
  )
}
