import { describe, it, expect } from 'vitest'
import { matchRangeCost, estimateOrderCogs, effectiveOrderCogs, orderNetProfit, parseRanges } from './profit'

// Two 2D groups: (sph<=2 & cyl<=2)=800, (sph<=4 & cyl<=2)=1400, plus an
// unbounded-cyl catch-all for prescriptions with no cylinder.
const RANGES = [
  { sphMax: 2, cylMax: 2, cost: 800 },
  { sphMax: 4, cylMax: 2, cost: 1400 },
  { sphMax: 8, cylMax: null, cost: 2200 },
]

describe('matchRangeCost', () => {
  it('matches by magnitude (sign-agnostic) and picks the tightest group', () => {
    expect(matchRangeCost(RANGES, -1.5, -1.0)).toBe(800)   // sph 1.5, cyl 1 → tightest
    expect(matchRangeCost(RANGES, 3.0, 1.0)).toBe(1400)    // sph 3 exceeds first group's 2
    expect(matchRangeCost(RANGES, 1.0, 3.0)).toBe(1400)    // cyl 3 exceeds ≤2 groups → closest cyl-bounded (cylMax 2, sphMax 4)
  })
  it('falls back to the closest cyl-bounded group when no cyl fits; null only when no groups or no rx', () => {
    expect(matchRangeCost(RANGES, 12, 6)).toBe(1400)      // beyond all cyl-bounded → closest (cylMax 2, sphMax 4)
    expect(matchRangeCost(RANGES, null, null)).toBeNull()  // no prescription power
    expect(matchRangeCost([], 1, 1)).toBeNull()           // no groups → baseCost
  })
  it('sph-only groups (cylMax=null) are used only when prescription has no cylinder', () => {
    expect(matchRangeCost(RANGES, 5, 0)).toBe(2200)       // no cyl → sphMax 8 (cyl ∞) group
    expect(matchRangeCost(RANGES, 5, null)).toBe(2200)    // no cyl → same
  })
  it('prioritises CYL when no full match: picks the group whose cylMax fits, not the one with largest sphMax', () => {
    // SPH 12 exceeds both groups, but CYL 3 fits cylMax 4 → that group wins
    // over the group with cylMax ∞ (no cyl bound) and larger sphMax.
    const ranges = [
      { sphMax: 10, cylMax: null, cost: 1000 },
      { sphMax: 8, cylMax: 4, cost: 2000 },
    ]
    expect(matchRangeCost(ranges, 12, 3)).toBe(2000)       // cyl 3 fits ≤4, not the ∞ group
    expect(matchRangeCost(ranges, 12, 5)).toBe(2000)       // cyl 5 exceeds 4 → closest cyl-bounded (cylMax 4)
  })
  it('picks the closest sphMax among cyl-fitting groups (not the smallest)', () => {
    // SPH 13, CYL 4: groups sphMax 2/cyl 4 and sphMax 8/cyl 4 both fit cyl,
    // but sphMax 8 is closer to 13 → should pick 8, not 2.
    const ranges = [
      { sphMax: 2, cylMax: 4, cost: 100 },
      { sphMax: 8, cylMax: 4, cost: 200 },
      { sphMax: 10, cylMax: null, cost: 300 },
    ]
    expect(matchRangeCost(ranges, 13, 4)).toBe(200)        // closest sphMax among cyl-fitting
    expect(matchRangeCost(ranges, 5, 4)).toBe(200)         // full match: sph 5 ≤ 8, cyl 4 ≤ 4
    expect(matchRangeCost(ranges, 1, 4)).toBe(100)         // full match: sph 1 ≤ 2 (tightest)
  })
  it('uses sph-only groups (cylMax=null) only for prescriptions with no cylinder', () => {
    const ranges = [
      { sphMax: 2, cylMax: 4, cost: 100 },
      { sphMax: 8, cylMax: 4, cost: 200 },
      { sphMax: 10, cylMax: null, cost: 300 },
    ]
    // No cylinder → sph-only group (cylMax null) is preferred
    expect(matchRangeCost(ranges, 5, 0)).toBe(300)         // no cyl → sphMax 10 (cyl ∞) group
    expect(matchRangeCost(ranges, 5, null)).toBe(300)      // no cyl → same
    // With cylinder → cyl-bounded group is preferred over sph-only
    expect(matchRangeCost(ranges, 5, 2)).toBe(200)         // cyl 2 ≤ 4, sph 5 > 2 → sphMax 8 full match
    expect(matchRangeCost(ranges, 1, 2)).toBe(100)         // cyl 2 ≤ 4, sph 1 ≤ 2 → sphMax 2 (tightest)
  })
  it('never picks a sph-only group when prescription has a cylinder, even if no cyl-bounded group fits', () => {
    // SPH 10, CYL 8: no cyl-bounded group fits (4 < 8, 6 < 8), but must NOT
    // fall to the sphMax 10 / cyl ∞ group. Instead pick the closest cyl-bounded
    // group → cylMax 6 (closest to 8), then sphMax 4.
    const ranges = [
      { sphMax: 10, cylMax: null, cost: 1000 },
      { sphMax: 8, cylMax: 4, cost: 2000 },
      { sphMax: 4, cylMax: 6, cost: 3000 },
    ]
    expect(matchRangeCost(ranges, 10, 8)).toBe(3000)       // cyl 6 is closest to 8 → group sphMax 4/cyl 6
    expect(matchRangeCost(ranges, 10, 5)).toBe(3000)       // cyl 5 ≤ 6 fits → sphMax 4 group (only cyl-fitting)
    expect(matchRangeCost(ranges, 10, 3)).toBe(2000)       // cyl 3 ≤ 4 fits → sphMax 8 (largest sphMax among cyl-fitting)
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
