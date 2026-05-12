import { useMemo, useState, useCallback } from 'react'

interface Props {
  totalOrders: number
  totalPayments: number
  netRevenue: number
  showAmounts: boolean
}

interface Rect { x: number; y: number; w: number; h: number }
interface N { id: string; label: string; color: string; value: number; rect: Rect }
interface L { source: N; target: N; value: number; path: string; sLabel: string; tLabel: string }

const NODE_W = 18
const PALETTE = {
  orders:      { fill: '#3b82f6', grad: ['#2563eb', '#3b82f6'] },
  payments:    { fill: '#10b981', grad: ['#059669', '#10b981'] },
  profit:      { fill: '#059669', grad: ['#047857', '#059669'] },
  expenses:    { fill: '#ef4444', grad: ['#dc2626', '#ef4444'] },
  outstanding: { fill: '#f59e0b', grad: ['#d97706', '#f59e0b'] },
}

export default function RevenueSankey({ totalOrders, totalPayments, netRevenue, showAmounts }: Props) {
  const [tooltip, setTooltip] = useState<{ label: string; amount: number; x: number; y: number } | null>(null)

  const handleEnter = useCallback((label: string, amount: number, x: number, y: number) => {
    setTooltip({ label, amount, x, y })
  }, [])

  const { nodes, links, svgW, svgH } = useMemo(() => {
    const safeNet = Math.max(0, netRevenue)
    const expenses = totalPayments - safeNet
    const outstanding = Math.max(0, totalOrders - totalPayments)
    if (totalOrders <= 0 || totalPayments <= 0) return { nodes: [] as N[], links: [] as L[], svgW: 0, svgH: 0 }

    const padTop = 48
    const padBot = 32
    const nodeGap = 20
    const maxVal = Math.max(totalOrders, totalPayments)
    const availH = 200
    const scale = availH / maxVal

    const colX = [48, 260, 472]
    const hasOutstanding = outstanding > 0

    // Build raw node definitions
    const raw: { id: string; label: string; color: string; value: number; col: number }[] = [
      { id: 'orders',      label: 'Commandes',    color: PALETTE.orders.fill,      value: totalOrders,   col: 0 },
      { id: 'payments',    label: 'Encaissé',     color: PALETTE.payments.fill,    value: totalPayments, col: 1 },
    ]
    if (hasOutstanding) raw.push({ id: 'outstanding', label: 'En attente', color: PALETTE.outstanding.fill, value: outstanding, col: 1 })
    raw.push(
      { id: 'profit',      label: 'Bénéfice Net', color: PALETTE.profit.fill,      value: safeNet,   col: 2 },
      { id: 'expenses',    label: 'Charges',       color: PALETTE.expenses.fill,    value: expenses,  col: 2 },
    )

    // Position nodes
    const positioned: N[] = []
    for (let col = 0; col <= 2; col++) {
      const colNodes = raw.filter(n => n.col === col)
      let y = padTop
      for (const n of colNodes) {
        const nh = Math.max(6, n.value * scale)
        positioned.push({ id: n.id, label: n.label, color: n.color, value: n.value, rect: { x: colX[col], y, w: NODE_W, h: nh } })
        y += nh + nodeGap
      }
    }

    function get(id: string) { return positioned.find(n => n.id === id)! }

    // Build links with smooth curves
    const rawLinks = [
      { sid: 'orders', tid: 'payments', value: totalPayments },
      { sid: 'payments', tid: 'profit', value: safeNet },
      { sid: 'payments', tid: 'expenses', value: expenses },
    ]
    if (hasOutstanding) rawLinks.push({ sid: 'orders', tid: 'outstanding', value: outstanding })

    const builtLinks: L[] = rawLinks.map(rl => {
      const src = get(rl.sid)
      const tgt = get(rl.tid)
      const linkH = Math.max(3, rl.value * scale)
      const srcTotal = raw.filter(n => n.id === rl.sid)[0]?.value || 1
      const tgtTotal = raw.filter(n => n.id === rl.tid)[0]?.value || 1
      const srcOff = srcTotal > 0 ? (src.rect.h - linkH) * (rl.value / srcTotal) : 0
      const tgtOff = tgtTotal > 0 ? (tgt.rect.h - linkH) * (rl.value / tgtTotal) : 0

      const x1 = src.rect.x + NODE_W
      const x2 = tgt.rect.x
      const y1 = src.rect.y + srcOff
      const y2 = tgt.rect.y + tgtOff
      const y1b = y1 + linkH
      const y2b = y2 + linkH

      // Catmull-Rom style smooth path
      const dx = x2 - x1
      const cp = dx * 0.42
      const path = `M${x1},${y1} C${x1 + cp},${y1} ${x2 - cp},${y2} ${x2},${y2} L${x2},${y2b} C${x2 - cp},${y2b} ${x1 + cp},${y1b} ${x1},${y1b} Z`

      return { source: src, target: tgt, value: rl.value, path, sLabel: src.label, tLabel: tgt.label }
    })

    const totalH = padTop + (maxVal * scale) + padBot + 20
    return { nodes: positioned, links: builtLinks, svgW: 560, svgH: totalH }
  }, [totalOrders, totalPayments, netRevenue])

  if (!nodes.length) return null

  const fmt = (n: number) => showAmounts ? `${n.toLocaleString()} DA` : '••••'
  const fmtCompact = (n: number) => showAmounts ? (n >= 1000 ? `${(n / 1000).toFixed(0)}k DA` : `${n} DA`) : '••'

  return (
    <div className="relative w-full" style={{ maxWidth: 580 }}>
      <style>{`
        @keyframes sankeyFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sankeyFlow {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .sk-node { transition: filter 0.2s; }
        .sk-node:hover { filter: brightness(1.2) drop-shadow(0 0 6px rgba(0,0,0,0.3)); }
        .sk-link { transition: opacity 0.2s, filter 0.2s; }
        .sk-link:hover { opacity: 0.9; filter: brightness(1.1); }
      `}</style>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-auto select-none"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        <defs>
          {nodes.map(n => (
            <linearGradient key={`gn${n.id}`} id={`gn${n.id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={(PALETTE as any)[n.id]?.grad?.[0] || n.color} />
              <stop offset="100%" stopColor={(PALETTE as any)[n.id]?.grad?.[1] || n.color} />
            </linearGradient>
          ))}
          {links.map((l, i) => (
            <linearGradient key={`gl${i}`} id={`gl${i}`} gradientUnits="userSpaceOnUse"
              x1={l.source.rect.x + NODE_W} y1={0} x2={l.target.rect.x} y2={0}>
              <stop offset="0%" stopColor={l.source.color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={l.target.color} stopOpacity={0.5} />
            </linearGradient>
          ))}
          <filter id="nodeShadow" x="-40%" y="-10%" width="180%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity={0.12} />
          </filter>
        </defs>

        {/* Background grid lines */}
        <g opacity={0.04}>
          {[svgH / 4, svgH / 2, svgH * 3 / 4].map((yy, i) => (
            <line key={`grid${i}`} x1={40} y1={yy} x2={svgW - 40} y2={yy} stroke="currentColor" strokeWidth={1} />
          ))}
        </g>

        {/* Links */}
        <g>
          {links.map((l, i) => (
            <path
              key={`l${i}`}
              d={l.path}
              fill={`url(#gl${i})`}
              stroke="none"
              className="sk-link"
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => {
                const s = (e.currentTarget as Element).closest('svg')
                if (!s) return
                const r = s.getBoundingClientRect()
                handleEnter(`${l.sLabel} → ${l.tLabel}`, l.value, e.clientX - r.left + 14, e.clientY - r.top - 10)
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </g>

        {/* Nodes */}
        <g filter="url(#nodeShadow)">
          {nodes.map(n => (
            <g key={`n${n.id}`} className="sk-node" style={{ cursor: 'pointer', animation: 'sankeyFadeIn 0.5s ease-out both' }}>
              <rect
                x={n.rect.x} y={n.rect.y}
                width={n.rect.w} height={n.rect.h}
                rx={6} ry={6}
                fill={`url(#gn${n.id})`}
                onMouseEnter={e => {
                  const s = (e.currentTarget as Element).closest('svg')
                  if (!s) return
                  const r = s.getBoundingClientRect()
                  handleEnter(n.label, n.value, e.clientX - r.left + 14, e.clientY - r.top - 10)
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {/* Amount label on node */}
              {n.rect.h > 28 && (
                <text
                  x={n.rect.x + n.rect.w / 2}
                  y={n.rect.y + n.rect.h / 2}
                  dy="0.35em"
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={Math.min(10, n.rect.h / 3.5)}
                  fontWeight={700}
                  style={{ pointerEvents: 'none' }}
                >
                  {fmtCompact(n.value)}
                </text>
              )}
              {/* Name label */}
              <text
                x={n.rect.x > 280 ? n.rect.x - 10 : n.rect.x + NODE_W + 10}
                y={n.rect.y + n.rect.h / 2}
                dy="0.35em"
                textAnchor={n.rect.x > 280 ? 'end' : 'start'}
                fill="currentColor"
                fontSize={12}
                fontWeight={600}
                className="fill-foreground"
                style={{ pointerEvents: 'none' }}
              >
                {n.label}
              </text>
            </g>
          ))}
        </g>

        {/* Legend */}
        <g transform={`translate(48, 22)`}>
          <rect x={0} y={0} width={svgW - 96} height={1} rx={1} fill="currentColor" opacity={0.06} />
        </g>
      </svg>

      {tooltip && (
        <div
          className="fixed pointer-events-none z-[999] px-3 py-2 rounded-xl bg-gray-900/95 text-white text-xs font-medium shadow-xl whitespace-nowrap backdrop-blur-sm border border-white/10"
          style={{ left: tooltip.x, top: tooltip.y - 32, transform: 'translateY(-100%)' }}
        >
          <span className="text-white/60 text-[10px]">{tooltip.label}</span>
          <br />
          <span className="text-white font-semibold text-sm">{fmt(tooltip.amount)}</span>
        </div>
      )}
    </div>
  )
}
