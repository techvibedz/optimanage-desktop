import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface DataPoint {
  date: string
  revenue: number
  expenses: number
  net: number
}

interface Props {
  data: DataPoint[]
  showAmounts: boolean
  loading?: boolean
}

export default function RevenueChart({ data, showAmounts, loading }: Props) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      label: formatDateLabel(d.date),
    }))
  }, [data])

  if (loading) {
    return (
      <div className="h-[260px] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
        Aucune donnée pour cette période
      </div>
    )
  }

  const fmtYAxis = (value: number) => {
    if (!showAmounts) return '••'
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`
    return String(value)
  }

  const fmtTooltip = (value: number) => {
    if (!showAmounts) return '••••'
    return `${value.toLocaleString()} DA`
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={fmtYAxis}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="rounded-xl border border-border bg-background/95 backdrop-blur-sm px-3 py-2.5 shadow-lg">
                  <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-muted-foreground">Bénéfice net</span>
                    <span className="ml-auto font-semibold text-foreground">{fmtTooltip(payload[0].value as number)}</span>
                  </div>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="net"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#gradNet)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#3b82f6' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
