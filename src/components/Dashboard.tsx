import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  return (
    <div className="dashboard">
      <div className="metrics-grid">
        <MetricCard
          label={t('dashboard.currentExp')}
          value={`${formatNumber(metrics.currentExp)} [${metrics.currentPercentage.toFixed(2)}%]`}
        />
        <MetricCard
          label={t('dashboard.expPerTenMin')}
          value={formatNumber(metrics.expPer10Min)}
          estimated={metrics.isExpPer10MinEstimated}
        />
        <MetricCard
          label={t('dashboard.expPerHour')}
          value={formatNumber(metrics.expPerHour)}
          estimated={metrics.isExpPerHourEstimated}
        />
        <MetricCard
          label={t('dashboard.timeToLevel')}
          value={formatDuration(metrics.timeToLevelMs)}
          estimated={metrics.isExpPerHourEstimated}
        />
        <MetricCard
          label={t('dashboard.sessionDuration')}
          value={formatDuration(metrics.sessionDurationMs)}
        />
        <MetricCard
          label={t('dashboard.sessionExpGained')}
          value={`${formatNumber(metrics.sessionExpGained)} [+${metrics.sessionPercentGained.toFixed(2)}%]`}
        />
      </div>
    </div>
  )
}
