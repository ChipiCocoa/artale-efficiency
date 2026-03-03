import type { OcrDebugImages } from '../lib/ocr-service'
import './DebugPreview.css'

interface DebugPreviewProps {
  images: OcrDebugImages
}

export function DebugPreview({ images }: DebugPreviewProps) {
  return (
    <div className="debug-preview">
      <h3>OCR Debug</h3>
      <div className="debug-images">
        <div className="debug-item">
          <span className="debug-label">Cropped Raw</span>
          <img src={images.raw} alt="Raw cropped frame" />
        </div>
        <div className="debug-item">
          <span className="debug-label">Processed (sent to OCR)</span>
          <img src={images.processed} alt="Preprocessed for OCR" />
        </div>
      </div>
    </div>
  )
}
