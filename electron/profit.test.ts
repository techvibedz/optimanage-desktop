import { describe, it, expect } from 'vitest'
import { matchRangeCost, estimateOrderCogs, effectiveOrderCogs, orderNetProfit, parseRanges } from './profit'

// Two 2D groups: (sph<=2 & cyl<=2)=800, (sph<=4 & cyl<=2)=1400, plus an
// unbounded-cyl catch-all for high astigmatism.
const RANGES = [
  { sphMax: 2, cylMax: 2, cost: 800 },
  { sphMax: 4, cylMax: 2, cost: 1400 },
  { sphMax: 8, cylMax: null, cost: 2200 },
]

describe('matchRangeCost', () => {
  it('matches by magnitude (sign-agnostic) and picks the tightest group', () => {
    expect(matchRangeCost(RANGES, -1.5, -1.0)).toBe(800)   // sph 1.5, cyl 1 → tightest
    expect(matchRangeCost(RANGES, 3.0, 1.0)).toBe(1400)    // sph 3 exceeds first group's 2
    expect(matchRangeCost(RANGES, 1.0, 3.0)).toBe(2200)    // cyl 3 exceeds the ≤2 groups
  })
  it('returns null (→ baseCost) when nothing matches or no rx', () => {
    expect(matchRangeCost(RANGES, 12, 6)).toBeNull()       // beyond all groups
    expect(matchRangeCost(RANGES, null, null)).toBeNull()  // no prescription power
    expect(matchRangeCost([], 1, 1)).toBeNull()
  })
  it('parses ranges from a JSON string (offline SQLite shape)', () => {
    expect(parseRanges(JSON.stringify(RANGES))).toHaveLength(3)
    expect(matchRangeCost(parseRanges(JSON.stringify(RANGES)), 1, 1)).toBe(800)
  })
})

describe('estimateOrderCogs (old orders, lens-only)', () => {
  it('sums per-eye range costs × quantity, falling back to baseCost', () => {
    const order = {
      totalPrice: 12000,
      prescription: {
        vlRightEyeSphere: -1.0, vlRightEyeCylinder: -0.5,
        vlLeftEyeSphere: -3.0, vlLeftEyeCylinder: -1.0,
      },
      vlRightEyeLensType: { baseCost: 999, priceRanges: RANGES }, // → 800 (range beats baseCost)
      vlRightEyeLensQuantity: 1,
      vlLeftEyeLensType: { baseCost: 500, priceRanges: RANGES },  // sph 3 → 1400
      vlLeftEyeLensQuantity: 2,
      vpRightEyeLensType: { baseCost: 600, priceRanges: null },   // no ranges → baseCost 600
      vpRightEyeLensQuantity: 1,
    }
    // 800 + 1400*2 + 600 = 4200
    expect(estimateOrderCogs(order)).toBe(4200)
  })
})

describe('effectiveOrderCogs / orderNetProfit', () => {
  it('uses the stored snapshot when present, ignoring the estimate', () => {
    const order = { totalPrice: 10000, orderCost: 3500, vlRightEyeLensType: { baseCost: 9999, priceRanges: RANGES }, prescription: { vlRightEyeSphere: 1 } }
    expect(effectiveOrderCogs(order)).toBe(3500)
    expect(orderNetProfit(order)).toBe(6500)
  })
  it('estimates when snapshot is null', () => {
    const order = { totalPrice: 5000, orderCost: null, vlRightEyeLensType: { baseCost: 1200, priceRanges: null }, vlRightEyeLensQuantity: 1, prescription: {} }
    expect(effectiveOrderCogs(order)).toBe(1200) // baseCost fallback
    expect(orderNetProfit(order)).toBe(3800)
  })
})
