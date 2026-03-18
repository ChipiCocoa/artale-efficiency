import { useTranslation } from 'react-i18next'
import type { OcrDebugImages } from '../lib/ocr-service'
import './DebugPreview.css'

interface DebugPreviewProps {
  images: OcrDebugImages
}

function confidenceColor(conf: number): string {
  if (conf >= 90) return '#4caf50'
  if (conf >= 70) return '#ff9800'
  return '#f44336'
}

export function DebugPreview({ images }: DebugPreviewProps) {
  const { t } = useTranslation()
  const r = images.ocrResult
  return (
    <div className="debug-preview">
      <h3>{t('debug.title')}</h3>
      <div className="debug-images">
        <div className="debug-item">
          <span className="debug-label">{t('debug.croppedRaw')}</span>
          <img src={images.raw} alt={t('debug.rawAlt')} />
        </div>
        <div className="debug-item">
          <span className="debug-label">{t('debug.processed')}</span>
          <img src={images.processed} alt={t('debug.processedAlt')} />
        </div>
      </div>

      {r && (
        <div className="debug-details">
          <div className="debug-detail-row">
            <span className="debug-detail-label">Text</span>
            <span className="debug-detail-value">{r.text || '(empty)'}</span>
            {r.skipped && <span className="debug-skip-badge">SKIPPED</span>}
          </div>
          <div className="debug-detail-row">
            <span className="debug-detail-label">Page conf</span>
            <span style={{ color: confidenceColor(r.pageConfidence) }}>{r.pageConfidence}</span>
            <span className="debug-detail-sep" />
            <span className="debug-detail-label">Digit conf</span>
            <span style={{ color: confidenceColor(r.digitConfidence) }}>{r.digitConfidence}</span>
          </div>
          <div className="debug-detail-row">
            <span className="debug-detail-label">Symbols</span>
            {r.symbols.map((s, i) => (
              <span key={i} className="debug-token">
                <span className="debug-token-text">{s.text}</span>
                <span className="debug-token-conf" style={{ color: confidenceColor(s.confidence) }}>{s.confidence}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
