import type { ExpMetrics } from '../types'
import { MetricCard } from './MetricCard'
import './Dashboard.css'

interface DashboardProps {
  metrics: ExpMetrics
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return '--'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `~${hours}h ${minutes}m`
  return `~${minutes}m`
}

export function Dashboard({ metrics }: DashboardProps) {
  return (
    <div className="dashboard">
      <div className="metrics-grid">
        <MetricCard
          label="Current EXP"
          value={`${formatNumber(metrics.currentExp)} [${metrics.currentPercentage.toFixed(2)}%]`}
        />
        <MetricCard
          label="EXP / 10 min"
          value={formatNumber(metrics.expPer10Min)}
          estimated={metrics.isExpPer10MinEstimated}
        />
        <MetricCard
          label="EXP / Hour"
          value={formatNumber(metrics.expPerHour)}
          estimated={metrics.isExpPerHourEstimated}
        />
        <MetricCard
          label="Time to Level"
          value={formatDuration(metrics.timeToLevelMs)}
          estimated={metrics.isExpPerHourEstimated}
        />
        <MetricCard
          label="Session Duration"
          value={formatDuration(metrics.sessionDurationMs)}
        />
        <MetricCard
          label="Session EXP Gained"
          value={`${formatNumber(metrics.sessionExpGained)} [+${metrics.sessionPercentGained.toFixed(2)}%]`}
        />
      </div>
    </div>
  )
}
