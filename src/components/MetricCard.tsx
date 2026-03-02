import './MetricCard.css'

interface MetricCardProps {
  label: string
  value: string
  estimated?: boolean
}

export function MetricCard({ label, value, estimated }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        {estimated && <span className="metric-estimated">(estimated)</span>}
      </div>
    </div>
  )
}
