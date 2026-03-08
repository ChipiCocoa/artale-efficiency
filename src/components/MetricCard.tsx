import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import './MetricCard.css'

interface MetricCardProps {
  label: string
  value: string
  estimated?: boolean
}

export const MetricCard = memo(function MetricCard({ label, value, estimated }: MetricCardProps) {
  const { t } = useTranslation()
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        {estimated && <span className="metric-estimated">{t('metric.estimated')}</span>}
      </div>
    </div>
  )
})
