import type { ExpMetrics } from '../types'
import './PipOverlay.css'

interface PipOverlayProps {
  metrics: ExpMetrics
  containerRef: React.RefObject<HTMLDivElement | null>
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return '--'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `~${hours}h ${minutes}m`
  return `~${minutes}m`
}

export function PipOverlay({ metrics, containerRef }: PipOverlayProps) {
  return (
    <div ref={containerRef} className="pip-container">
      <div className="pip-row">
        <span className="pip-label">EXP/hr</span>
        <span className="pip-value">{metrics.expPerHour.toLocaleString()}</span>
      </div>
      <div className="pip-row">
        <span className="pip-label">Level</span>
        <span className="pip-value">{metrics.currentPercentage.toFixed(2)}%</span>
      </div>
      <div className="pip-row">
        <span className="pip-label">ETA</span>
        <span className="pip-value">{formatDuration(metrics.timeToLevelMs)}</span>
      </div>
    </div>
  )
}
