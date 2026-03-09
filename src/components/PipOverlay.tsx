import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import type { ExpMetrics } from '../types'
import './PipOverlay.css'

interface PipOverlayProps {
  metrics: ExpMetrics
  pipWindow: Window | null
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

function PipContent({ metrics }: { metrics: ExpMetrics }) {
  const { t } = useTranslation()
  return (
    <div className="pip-container">
      <div className="pip-row pip-highlight">
        <span className="pip-label">{t('pip.currentExp')}</span>
        <span className="pip-value">{formatNumber(metrics.currentExp)} [{metrics.currentPercentage.toFixed(2)}%]</span>
      </div>
      <div className="pip-divider" />
      <div className="pip-row">
        <span className="pip-label">{t('pip.expPerTenMin')}</span>
        <span className="pip-value">
          {formatNumber(metrics.expPer10Min)}
          {metrics.isExpPer10MinEstimated && <span className="pip-est"> {t('pip.est')}</span>}
        </span>
      </div>
      <div className="pip-row">
        <span className="pip-label">{t('pip.expPerHour')}</span>
        <span className="pip-value">
          {formatNumber(metrics.expPerHour)}
          {metrics.isExpPerHourEstimated && <span className="pip-est"> {t('pip.est')}</span>}
        </span>
      </div>
      <div className="pip-row">
        <span className="pip-label">{t('pip.timeToLevel')}</span>
        <span className="pip-value">
          {formatDuration(metrics.timeToLevelMs)}
          {metrics.isExpPerHourEstimated && <span className="pip-est"> {t('pip.est')}</span>}
        </span>
      </div>
      <div className="pip-divider" />
      <div className="pip-row">
        <span className="pip-label">{t('pip.session')}</span>
        <span className="pip-value">{formatDuration(metrics.sessionDurationMs)}</span>
      </div>
      <div className="pip-row">
        <span className="pip-label">{t('pip.expGained')}</span>
        <span className="pip-value">{formatNumber(metrics.sessionExpGained)} [+{metrics.sessionPercentGained.toFixed(2)}%]</span>
      </div>
    </div>
  )
}

export function PipOverlay({ metrics, pipWindow }: PipOverlayProps) {
  if (!pipWindow) return null
  return createPortal(<PipContent metrics={metrics} />, pipWindow.document.body)
}
