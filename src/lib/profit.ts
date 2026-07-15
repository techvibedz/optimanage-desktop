// Frontend mirror of electron/profit.ts cost logic. Used by the order form to
// compute the `orderCost` snapshot at creation. Kept in sync with the electron
// copy — see electron/profit.ts (that copy is authoritative for stored/legacy
// orders; this one only feeds the live snapshot).

export interface PriceRange {
  sphMax: number | null
  cylMax: number | null
  cost: number
}

const bound = (v: number | null | undefined): number => (v == null ? Infinity : Math.abs(Number(v)))

export function parseRanges(raw: any): PriceRange[] {
  if (!raw) return []
  let val = raw
  if (typeof raw === 'string') { try { val = JSON.parse(raw) } catch { return [] } }
  if (!Array.isArray(val)) return []
  return val
    .map((r: any) => ({
      sphMax: r?.sphMax == null || r.sphMax === '' ? null : Number(r.sphMax),
      cylMax: r?.cylMax == null || r.cylMax === '' ? null : Number(r.cylMax),
      cost: Number(r?.cost) || 0,
    }))
    .filter((r: PriceRange) => Number.isFinite(r.cost))
}

export function matchRange(
  ranges: PriceRange[] | null | undefined,
  sph: number | null | undefined,
  cyl: number | null | undefined,
): PriceRange | null {
  if (!Array.isArray(ranges) || ranges.length === 0) return null
  if (sph == null && cyl == null) return null
  const s = Math.abs(Number(sph ?? 0))
  const c = Math.abs(Number(cyl ?? 0))
  const EPS = 1e-6
  const hasCyl = c > EPS

  const cylBounded = ranges.filter(r => r.cylMax != null)
  const sphOnly = ranges.filter(r => r.cylMax == null)

  if (hasCyl) {
    const full = cylBounded.filter(r => s <= bound(r.sphMax) + EPS && c <= bound(r.cylMax) + EPS)
    if (full.length > 0) return [...full].sort((a, b) => (bound(a.cylMax) - bound(b.cylMax)) || (bound(a.sphMax) - bound(b.sphMax)))[0]

    const cylFits = cylBounded.filter(r => c <= bound(r.cylMax) + EPS)
    if (cylFits.length > 0) return [...cylFits].sort((a, b) => bound(b.sphMax) - bound(a.sphMax))[0]

    if (cylBounded.length > 0) return [...cylBounded].sort((a, b) => (bound(b.cylMax) - bound(a.cylMax)) || (bound(b.sphMax) - bound(a.sphMax)))[0]
  } else {
    const full = sphOnly.filter(r => s <= bound(r.sphMax) + EPS)
    if (full.length > 0) return [...full].sort((a, b) => bound(a.sphMax) - bound(b.sphMax))[0]

    if (sphOnly.length > 0) return [...sphOnly].sort((a, b) => bound(b.sphMax) - bound(a.sphMax))[0]

    if (cylBounded.length > 0) return [...cylBounded].sort((a, b) => bound(b.sphMax) - bound(a.sphMax))[0]
  }

  return [...ranges].sort((a, b) => (bound(b.sphMax) - bound(a.sphMax)) || (bound(b.cylMax) - bound(a.cylMax)))[0]
}

export function matchRangeCost(
  ranges: PriceRange[] | null | undefined,
  sph: number | null | undefined,
  cyl: number | null | undefined,
): number | null {
  const r = matchRange(ranges, sph, cyl)
  return r ? (Number(r.cost) || 0) : null
}

// Cost of one lens for a given eye power: range lookup, else the flat baseCost.
export function lensUnitCost(lensType: any, sph: any, cyl: any): number {
  if (!lensType) return 0
  const rc = matchRangeCost(parseRanges(lensType.priceRanges), sph, cyl)
  return rc != null ? rc : (Number(lensType.baseCost) || 0)
}
