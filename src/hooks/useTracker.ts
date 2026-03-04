import { useState, useCallback, useRef, useEffect } from 'react'
import type { ExpReading, ExpMetrics, Settings } from '../types.ts'
import { computeMetrics } from '../lib/metrics.ts'
import { TrackingEngine } from '../lib/tracking-engine.ts'
import type { TrackingStatus } from '../lib/tracking-engine.ts'
import type { OcrDebugImages } from '../lib/ocr-service.ts'

const MAX_READINGS = 7200 // ~2 hours at 1s interval
const METRICS_UPDATE_INTERVAL = 2000 // update metrics every 2 seconds

export function useTracker(settings: Settings) {
  const [readings, setReadings] = useState<ExpReading[]>([])
  const [metrics, setMetrics] = useState<ExpMetrics>(computeMetrics([]))
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [ocrFailures, setOcrFailures] = useState(0)
  const [levelUps, setLevelUps] = useState(0)
  const [debugImages, setDebugImages] = useState<OcrDebugImages | null>(null)
  const [debugEnabled, setDebugEnabled] = useState(false)
  const engineRef = useRef<TrackingEngine | null>(null)
  const readingsRef = useRef<ExpReading[]>([])
  const metricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionStartTimeRef = useRef<number>(0)
  const sessionStartExpRef = useRef<number>(0)

  const startTracking = useCallback(async () => {
    const engine = new TrackingEngine({
      onReading: (reading) => {
        if (readingsRef.current.length === 0) {
          sessionStartTimeRef.current = reading.timestamp
          sessionStartExpRef.current = reading.cumulativeExp
        }
        readingsRef.current = readingsRef.current.length >= MAX_READINGS
          ? [...readingsRef.current.slice(-MAX_READINGS + 1), reading]
          : [...readingsRef.current, reading]
        setReadings(readingsRef.current)
      },
      onStatusChange: setStatus,
      onOcrFailure: setOcrFailures,
      onDebugImages: (images) => {
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

    // Metrics update on a separate timer (not every reading)
    metricsIntervalRef.current = setInterval(() => {
      if (readingsRef.current.length > 0) {
        setMetrics(computeMetrics(readingsRef.current, sessionStartTimeRef.current, sessionStartExpRef.current))
      }
    }, METRICS_UPDATE_INTERVAL)

    await engine.start(settings.sampleInterval, settings.cropRegion)
  }, [settings.sampleInterval, settings.cropRegion])

  // Sync crop region changes to running engine
  useEffect(() => {
    engineRef.current?.updateCropRegion(settings.cropRegion)
  }, [settings.cropRegion])

  // Sync debug mode to OCR service
  useEffect(() => {
    const engine = engineRef.current
    if (engine) {
      engine.setDebugEnabled(debugEnabled)
    }
  }, [debugEnabled])

  const stopTracking = useCallback(() => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
      metricsIntervalRef.current = null
    }
    // Final metrics update
    if (readingsRef.current.length > 0) {
      setMetrics(computeMetrics(readingsRef.current, sessionStartTimeRef.current, sessionStartExpRef.current))
    }
    engineRef.current?.stop()
    engineRef.current = null
    readingsRef.current = []
    sessionStartTimeRef.current = 0
    sessionStartExpRef.current = 0
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
    debugEnabled,
    setDebugEnabled,
    startTracking,
    stopTracking,
    getCapture,
  }
}
