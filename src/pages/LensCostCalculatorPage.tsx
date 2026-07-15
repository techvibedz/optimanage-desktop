import { useState, useMemo, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTranslation } from '@/lib/use-translation'
import { useConnectivityRefresh } from '@/lib/use-connectivity-refresh'
import { Calculator, Loader2 } from 'lucide-react'
import { matchRange, parseRanges } from '@/lib/profit'

const PRICE_MULTIPLIER = 3

export default function LensCostCalculatorPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [lensTypes, setLensTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedLensId, setSelectedLensId] = useState('')
  const [rightSph, setRightSph] = useState('')
  const [rightCyl, setRightCyl] = useState('')
  const [leftSph, setLeftSph] = useState('')
  const [leftCyl, setLeftCyl] = useState('')

  const fetchLensTypes = async () => {
    if (!user?.id) return
    try {
      const res = await window.electronAPI.getLensTypes({ userId: user.id })
      if (res.data) setLensTypes(res.data)
    } catch {
      // offline fallback is transparent in the IPC handler
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLensTypes() }, [user?.id])
  useConnectivityRefresh(useCallback(() => { fetchLensTypes() }, [user?.id]))

  const selectedLens = lensTypes.find(l => l.id === selectedLensId)

  const computeEye = (sph: string, cyl: string) => {
    if (!selectedLens) return null
    const sphNum = sph === '' ? null : parseFloat(sph)
    const cylNum = cyl === '' ? null : parseFloat(cyl)
    const ranges = parseRanges(selectedLens.priceRanges)
    const matched = matchRange(ranges, sphNum, cylNum)
    if (matched) {
      return {
        cost: Number(matched.cost) || 0,
        price: (Number(matched.cost) || 0) * PRICE_MULTIPLIER,
        groupLabel: `SPH ${matched.sphMax == null ? '∞' : `≤ ${matched.sphMax}`}, CYL ${matched.cylMax == null ? '∞' : `≤ ${matched.cylMax}`}`,
        matched: true,
      }
    }
    if (ranges.length === 0) {
      const bc = Number(selectedLens.baseCost) || 0
      return { cost: bc, price: bc * PRICE_MULTIPLIER, groupLabel: t('orders.baseCost') || 'Base cost', matched: false }
    }
    return null
  }

  const rightResult = useMemo(() => computeEye(rightSph, rightCyl), [selectedLens, rightSph, rightCyl, t])
  const leftResult = useMemo(() => computeEye(leftSph, leftCyl), [selectedLens, leftSph, leftCyl, t])

  const totalPrice = useMemo(() => {
    const r = rightResult?.price || 0
    const l = leftResult?.price || 0
    return (r || l) ? r + l : 0
  }, [rightResult, leftResult])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const currency = t('orders.currency') || 'DA'

  return (
    <div>
      <div className="page-header">
        <h1 className="flex items-center gap-2">
          <Calculator className="h-6 w-6" />
          {t('calculator.title') || 'Lens Cost Calculator'}
        </h1>
        <p>{t('calculator.subtitle') || 'Calculate the cost of a lens based on prescription and lens type'}</p>
      </div>

      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-border/50 p-6 max-w-3xl mx-auto">
        <div className="space-y-5">
          {/* Lens type selection */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('calculator.lensType') || 'Lens Type'}</label>
            <select
              value={selectedLensId}
              onChange={e => setSelectedLensId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1"
            >
              <option value="">{t('orders.selectLensType') || 'Select lens type...'}</option>
              {lensTypes.map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>

          {/* Right Eye + Left Eye */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Right Eye (OD) */}
            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/30 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">{t('orders.rightEye') || 'OD'} (Right Eye)</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('calculator.sphere') || 'Sphere (SPH)'}</label>
                  <input
                    type="number"
                    step="any"
                    value={rightSph}
                    onChange={e => setRightSph(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('calculator.cylinder') || 'Cylinder (CYL)'}</label>
                  <input
                    type="number"
                    step="any"
                    value={rightCyl}
                    onChange={e => setRightCyl(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1"
                  />
                </div>
                {rightResult && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 space-y-1.5 border border-border/50">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">{t('calculator.matchedGroup') || 'Matched group'}</span>
                      <span className="font-medium">{rightResult.groupLabel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{t('calculator.customerPrice') || 'Customer price'}</span>
                      <span className="text-lg font-bold text-green-600">{rightResult.price.toLocaleString()} {currency}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Left Eye (OG) */}
            <div className="bg-teal-50/50 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/30 rounded-lg p-4">
              <p className="text-sm font-semibold text-teal-800 dark:text-teal-300 mb-3">{t('orders.leftEye') || 'OG'} (Left Eye)</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('calculator.sphere') || 'Sphere (SPH)'}</label>
                  <input
                    type="number"
                    step="any"
                    value={leftSph}
                    onChange={e => setLeftSph(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('calculator.cylinder') || 'Cylinder (CYL)'}</label>
                  <input
                    type="number"
                    step="any"
                    value={leftCyl}
                    onChange={e => setLeftCyl(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mt-1"
                  />
                </div>
                {leftResult && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 space-y-1.5 border border-border/50">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">{t('calculator.matchedGroup') || 'Matched group'}</span>
                      <span className="font-medium">{leftResult.groupLabel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{t('calculator.customerPrice') || 'Customer price'}</span>
                      <span className="text-lg font-bold text-green-600">{leftResult.price.toLocaleString()} {currency}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Total */}
          {totalPrice > 0 && (
            <div className="flex justify-between items-center bg-primary/5 dark:bg-primary/10 rounded-lg p-4 border border-border/30">
              <span className="text-sm font-semibold">{t('calculator.totalPrice') || 'Total (both eyes)'}</span>
              <span className="text-xl font-bold text-green-600">{totalPrice.toLocaleString()} {currency}</span>
            </div>
          )}

          {/* Available cost groups preview */}
          {selectedLens && (() => {
            const ranges = parseRanges(selectedLens.priceRanges)
            if (ranges.length === 0) return null
            return (
              <div className="border-t border-border/30 pt-4">
                <h3 className="text-sm font-semibold mb-2">{t('calculator.availableGroups') || 'Available cost groups'}</h3>
                <div className="space-y-1">
                  {ranges.map((r, i) => (
                    <div key={i} className="flex justify-between items-center text-xs bg-muted/20 rounded px-3 py-1.5">
                      <span>
                        SPH {r.sphMax == null ? '∞' : `≤ ${r.sphMax}`}
                        {' · '}
                        CYL {r.cylMax == null ? '∞' : `≤ ${r.cylMax}`}
                      </span>
                      <span className="font-medium text-green-600">
                        {(Number(r.cost) || 0).toLocaleString()} {currency}
                        <span className="ml-1 opacity-60">→ {((Number(r.cost) || 0) * PRICE_MULTIPLIER).toLocaleString()}</span>
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-xs bg-muted/20 rounded px-3 py-1.5">
                    <span className="text-muted-foreground">{t('orders.baseCost') || 'Base cost'}</span>
                    <span className="font-medium">
                      {(Number(selectedLens.baseCost) || 0).toLocaleString()} {currency}
                      <span className="ml-1 opacity-60">→ {((Number(selectedLens.baseCost) || 0) * PRICE_MULTIPLIER).toLocaleString()}</span>
                    </span>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
