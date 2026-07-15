// ─── Net-profit / cost-of-goods logic ───────────────────────────────────────
// Shared by the online Prisma handlers (main.ts) and the offline SQLite cache
// (localCache.ts) so the two paths can never disagree about money.
//
// Cost model:
//  • New orders store a snapshot `orderCost` (frame + lenses + contact lenses)
//    computed by the order form at creation → used verbatim.
//  • Older orders have no snapshot → we ESTIMATE their lens cost from the stored
//    per-eye lens types + the linked prescription's sphere/cylinder. Frame and
//    contact-lens cost cannot be recovered for those, so the estimate is
//    lens-only (the largest component, and the best history allows).

export interface PriceRange {
  sphMax: number | null // |sphere| upper bound for this group; null = no bound
  cylMax: number | null // |cylinder| upper bound for this group; null = no bound
  cost: number
}

// null bound means "no upper limit" for that axis.
const bound = (v: number | null | undefined): number => (v == null ? Infinity : Math.abs(Number(v)))

// priceRanges may arrive as a parsed array (Prisma jsonb) or a JSON string
// (SQLite TEXT). Normalise to an array; anything unparseable → [].
export function parseRanges(raw: any): PriceRange[] {
  if (!raw) return []
  let val = raw
  if (typeof raw === 'string') {
    try { val = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(val)) return []
  return val
    .map((r: any) => ({
      sphMax: r?.sphMax == null || r.sphMax === '' ? null : Number(r.sphMax),
      cylMax: r?.cylMax == null || r.cylMax === '' ? null : Number(r.cylMax),
      cost: Number(r?.cost) || 0,
    }))
    .filter((r: PriceRange) => Number.isFinite(r.cost))
}

// Find the PriceRange group for a given prescription power. Returns null when
// there are no groups or no prescription power (→ caller falls back to baseCost).
// CYL is the primary axis: groups with a cylMax bound are only used when the
// prescription has a cylinder; groups with cylMax = null (empty) are only used
// for prescriptions with no cylinder. When no group fully matches, the closest
// group is chosen (largest sphMax among those whose cylMax fits).
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

  // Groups split by whether they have a cylinder bound.
  const cylBounded = ranges.filter(r => r.cylMax != null) // groups with a CYL limit
  const sphOnly = ranges.filter(r => r.cylMax == null)     // groups with cylMax = ∞ (sph-only)

  if (hasCyl) {
    // 1. Full match: cylMax set, both SPH and CYL fit → tightest (smallest cylMax, then sphMax).
    const full = cylBounded.filter(r => s <= bound(r.sphMax) + EPS && c <= bound(r.cylMax) + EPS)
    if (full.length > 0) return [...full].sort((a, b) => (bound(a.cylMax) - bound(b.cylMax)) || (bound(a.sphMax) - bound(b.sphMax)))[0]

    // 2. No full match: groups where CYL fits → pick the LARGEST sphMax (closest to the prescription).
    const cylFits = cylBounded.filter(r => c <= bound(r.cylMax) + EPS)
    if (cylFits.length > 0) return [...cylFits].sort((a, b) => bound(b.sphMax) - bound(a.sphMax))[0]

    // 3. No cyl-bounded group fits the cylinder → pick the closest cyl-bounded
    //    group (largest cylMax = closest to the prescription's CYL, then largest sphMax).
    //    Never fall back to sph-only groups when the prescription has a cylinder.
    if (cylBounded.length > 0) return [...cylBounded].sort((a, b) => (bound(b.cylMax) - bound(a.cylMax)) || (bound(b.sphMax) - bound(a.sphMax)))[0]
  } else {
    // No cylinder in prescription → prefer sph-only groups (cylMax = null).
    // 1. Full match: SPH fits → tightest (smallest sphMax).
    const full = sphOnly.filter(r => s <= bound(r.sphMax) + EPS)
    if (full.length > 0) return [...full].sort((a, b) => bound(a.sphMax) - bound(b.sphMax))[0]

    // 2. No full match → LARGEST sphMax (closest).
    if (sphOnly.length > 0) return [...sphOnly].sort((a, b) => bound(b.sphMax) - bound(a.sphMax))[0]

    // 3. No sph-only groups → fall back to cyl-bounded groups (cyl ≈ 0 fits any).
    if (cylBounded.length > 0) return [...cylBounded].sort((a, b) => bound(b.sphMax) - bound(a.sphMax))[0]
  }

  // 4. Final fallback: loosest group overall.
  return [...ranges].sort((a, b) => (bound(b.sphMax) - bound(a.sphMax)) || (bound(b.cylMax) - bound(a.cylMax)))[0]
}

// Find the cost for a given prescription power. Returns null when no group
// matches (or there are no groups / no prescription) so the caller can fall
// back to the lens's flat baseCost.
export function matchRangeCost(
  ranges: PriceRange[] | null | undefined,
  sph: number | null | undefined,
  cyl: number | null | undefined,
): number | null {
  const r = matchRange(ranges, sph, cyl)
  return r ? (Number(r.cost) || 0) : null
}

// Cost of one lens slot: range lookup for its eye's power, else the flat baseCost.
function slotCost(lensType: any, sph: any, cyl: any, qty: any): number {
  if (!lensType) return 0
  const rc = matchRangeCost(parseRanges(lensType.priceRanges), sph, cyl)
  const unit = rc != null ? rc : (Number(lensType.baseCost) || 0)
  return unit * (Number(qty) || 1)
}

// Estimate cost of goods for an order that has no stored snapshot. Expects the
// order with `.prescription` and the four `.{vl,vp}{Right,Left}EyeLensType`
// relations attached (both the Prisma include shape and the localCache join
// shape provide these).
export function estimateOrderCogs(order: any): number {
  if (!order) return 0
  const rx = order.prescription || {}
  let cost =
    slotCost(order.vlRightEyeLensType, rx.vlRightEyeSphere, rx.vlRightEyeCylinder, order.vlRightEyeLensQuantity) +
    slotCost(order.vlLeftEyeLensType, rx.vlLeftEyeSphere, rx.vlLeftEyeCylinder, order.vlLeftEyeLensQuantity) +
    slotCost(order.vpRightEyeLensType, rx.vpRightEyeSphere, rx.vpRightEyeCylinder, order.vpRightEyeLensQuantity) +
    slotCost(order.vpLeftEyeLensType, rx.vpLeftEyeSphere, rx.vpLeftEyeCylinder, order.vpLeftEyeLensQuantity)
  // Very old orders may only carry the legacy single lensType (no per-eye split).
  const noPerEye = !order.vlRightEyeLensType && !order.vlLeftEyeLensType && !order.vpRightEyeLensType && !order.vpLeftEyeLensType
  if (noPerEye && order.lensType) {
    cost += slotCost(order.lensType, rx.vlRightEyeSphere ?? rx.vpRightEyeSphere, rx.vlRightEyeCylinder ?? rx.vpRightEyeCylinder, 1)
  }
  return cost
}

// The cost of goods actually used for profit: the stored snapshot when present,
// otherwise the lens-only estimate.
export function effectiveOrderCogs(order: any): number {
  if (!order) return 0
  const snap = order.orderCost
  if (snap != null && Number.isFinite(Number(snap))) return Number(snap)
  return estimateOrderCogs(order)
}

export function orderNetProfit(order: any): number {
  return (Number(order?.totalPrice) || 0) - effectiveOrderCogs(order)
}
