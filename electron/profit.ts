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

// Find the cost for a given prescription power. Returns null when no group
// matches (or there are no groups / no prescription) so the caller can fall
// back to the lens's flat baseCost.
export function matchRangeCost(
  ranges: PriceRange[] | null | undefined,
  sph: number | null | undefined,
  cyl: number | null | undefined,
): number | null {
  if (!Array.isArray(ranges) || ranges.length === 0) return null
  // No prescription power at all → cannot pick a group; use baseCost instead.
  if (sph == null && cyl == null) return null
  const s = Math.abs(Number(sph ?? 0))
  const c = Math.abs(Number(cyl ?? 0))
  const EPS = 1e-6
  const matches = ranges.filter(r => s <= bound(r.sphMax) + EPS && c <= bound(r.cylMax) + EPS)
  if (matches.length === 0) return null
  // Tightest group wins: smallest sphere bound, then smallest cylinder bound.
  matches.sort((a, b) => (bound(a.sphMax) - bound(b.sphMax)) || (bound(a.cylMax) - bound(b.cylMax)))
  return Number(matches[0].cost) || 0
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
