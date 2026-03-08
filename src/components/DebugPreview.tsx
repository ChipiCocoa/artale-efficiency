import { useTranslation } from 'react-i18next'
import type { OcrDebugImages } from '../lib/ocr-service'
import './DebugPreview.css'

interface DebugPreviewProps {
  images: OcrDebugImages
}

export function DebugPreview({ images }: DebugPreviewProps) {
  const { t } = useTranslation()
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
    </div>
  )
}
