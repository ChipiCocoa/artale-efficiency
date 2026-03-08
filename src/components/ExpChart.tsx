import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { ExpReading } from '../types'
import './ExpChart.css'

interface ExpChartProps {
  readings: ExpReading[]
}

interface ChartPoint {
  time: string
  expPer10Min: number
}

const BUCKET_MS = 60_000
const WINDOW_MS = 5 * 60_000

// Find the reading closest to (but not after) targetTimestamp within readings[0..maxIdx]
function findReadingAt(readings: ExpReading[], targetTimestamp: number, maxIdx: number): ExpReading {
  let lo = 0, hi = maxIdx
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (readings[mid].timestamp <= targetTimestamp) lo = mid
    else hi = mid - 1
  }
  return readings[lo]
}

export function ExpChart({ readings }: ExpChartProps) {
  const data = useMemo(() => {
    if (readings.length < 2) return []

    const first = readings[0]
    const points: ChartPoint[] = []
    let bucketStart = first.timestamp

    for (let i = 1; i < readings.length; i++) {
      if (readings[i].timestamp - bucketStart >= BUCKET_MS) {
        const windowStart = findReadingAt(readings, readings[i].timestamp - WINDOW_MS, i)
        const elapsed = readings[i].timestamp - windowStart.timestamp
        const expGained = readings[i].cumulativeExp - windowStart.cumulativeExp
        const expPer10Min = elapsed > 0 ? Math.round((expGained / elapsed) * 600_000) : 0

        points.push({
          time: new Date(readings[i].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          expPer10Min,
        })
        bucketStart = readings[i].timestamp
      }
    }

    return points
  }, [readings])

  if (data.length < 2) {
    return (
      <div className="exp-chart-empty">
        Collecting data... Chart will appear after a few minutes of tracking.
      </div>
    )
  }

  return (
    <div className="exp-chart">
      <h3>EXP/10min Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="time" stroke="#666" fontSize={12} />
          <YAxis stroke="#666" fontSize={12} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #444', borderRadius: '8px' }}
            labelStyle={{ color: '#888' }}
            formatter={(value: number | undefined) => [value?.toLocaleString() ?? '0', 'EXP/10min']}
          />
          <Line
            type="monotone"
            dataKey="expPer10Min"
            stroke="#4a6cf7"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
