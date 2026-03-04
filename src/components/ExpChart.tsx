import { useRef, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { ExpReading } from '../types'
import './ExpChart.css'

interface ExpChartProps {
  readings: ExpReading[]
}

interface ChartPoint {
  time: string
  expPerHour: number
}

export function ExpChart({ readings }: ExpChartProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const lastBucketTimestampRef = useRef(0)
  const firstReadingRef = useRef<ExpReading | null>(null)

  useEffect(() => {
    if (readings.length < 2) return

    if (!firstReadingRef.current) {
      firstReadingRef.current = readings[0]
    }
    const first = firstReadingRef.current

    const bucketMs = 60_000
    let bucketStart = lastBucketTimestampRef.current || first.timestamp

    // Binary search for first reading after bucketStart
    let lo = 0, hi = readings.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (readings[mid].timestamp <= bucketStart) lo = mid + 1
      else hi = mid
    }

    const newPoints: ChartPoint[] = []
    for (let i = lo; i < readings.length; i++) {
      if (readings[i].timestamp - bucketStart >= bucketMs) {
        const elapsed = readings[i].timestamp - first.timestamp
        const expGained = readings[i].rawExp - first.rawExp
        const expPerHour = elapsed > 0 ? Math.round((expGained / elapsed) * 3_600_000) : 0

        newPoints.push({
          time: new Date(readings[i].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          expPerHour,
        })
        bucketStart = readings[i].timestamp
      }
    }

    if (newPoints.length > 0) {
      setData(prev => [...prev, ...newPoints])
      lastBucketTimestampRef.current = bucketStart
    }
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
      <h3>EXP/Hour Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="time" stroke="#666" fontSize={12} />
          <YAxis stroke="#666" fontSize={12} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #444', borderRadius: '8px' }}
            labelStyle={{ color: '#888' }}
            formatter={(value: number | undefined) => [value?.toLocaleString() ?? '0', 'EXP/hr']}
          />
          <Line
            type="monotone"
            dataKey="expPerHour"
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
