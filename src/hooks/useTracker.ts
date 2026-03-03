import { useState, useCallback, useRef, useEffect } from 'react'
import type { ExpReading, ExpMetrics, Settings } from '../types.ts'
import { computeMetrics } from '../lib/metrics.ts'
import { TrackingEngine } from '../lib/tracking-engine.ts'
import type { TrackingStatus } from '../lib/tracking-engine.ts'
import type { OcrDebugImages } from '../lib/ocr-service.ts'

export function useTracker(settings: Settings) {
  const [readings, setReadings] = useState<ExpReading[]>([])
  const [metrics, setMetrics] = useState<ExpMetrics>(computeMetrics([]))
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [ocrFailures, setOcrFailures] = useState(0)
  const [levelUps, setLevelUps] = useState(0)
  const [debugImages, setDebugImages] = useState<OcrDebugImages | null>(null)
  const engineRef = useRef<TrackingEngine | null>(null)

  const startTracking = useCallback(async () => {
    const engine = new TrackingEngine({
      onReading: (reading) => {
        setReadings(prev => {
          const next = [...prev, reading]
          setMetrics(computeMetrics(next))
          return next
        })
      },
      onStatusChange: setStatus,
      onOcrFailure: setOcrFailures,
      onDebugImages: (images) => {
        // Revoke previous URLs to avoid memory leak
        setDebugImages(prev => {
          if (prev) {
            URL.revokeObjectURL(prev.raw)
            URL.revokeObjectURL(prev.processed)
          }
          return images
        })
      },
      onLevelUp: () => setLevelUps(prev => prev + 1),
    })
    engineRef.current = engine
    await engine.start(settings.sampleInterval, settings.cropRegion)
  }, [settings.sampleInterval, settings.cropRegion])

  // Sync crop region changes to running engine
  useEffect(() => {
    engineRef.current?.updateCropRegion(settings.cropRegion)
  }, [settings.cropRegion])

  const stopTracking = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
    setStatus('idle')
  }, [])

  const getCapture = useCallback(() => {
    return engineRef.current?.getCapture() ?? null
  }, [])

  return {
    readings,
    metrics,
    status,
    ocrFailures,
    levelUps,
    debugImages,
    startTracking,
    stopTracking,
    getCapture,
  }
}
