import { useState, useCallback, useRef, useEffect } from 'react'
import type { ExpReading, ExpMetrics, ChartPoint, Settings } from '../types.ts'
import { computeMetrics } from '../lib/metrics.ts'
import { TrackingEngine } from '../lib/tracking-engine.ts'
import type { TrackingStatus } from '../lib/tracking-engine.ts'
import type { OcrDebugImages } from '../lib/ocr-service.ts'

const MAX_READINGS = 7200 // ~2 hours at 1s interval
const METRICS_UPDATE_INTERVAL = 2000 // update metrics every 2 seconds
const BUCKET_MS = 60_000
const WINDOW_MS = 5 * 60_000

// Find the reading closest to (but not after) targetTimestamp within readings[0..maxIdx]
function findReadingAt(readings: ExpReading[], targetTimestamp: number, maxIdx: number): ExpReading {
  let lo = 0, hi = maxIdx
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (readings[mid].timestamp <= targetTimestamp) lo = mid
    else hi = mid - 1
  }
  return readings[lo]
}

export function useTracker(settings: Settings) {
  const [metrics, setMetrics] = useState<ExpMetrics>(computeMetrics([]))
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [ocrFailures, setOcrFailures] = useState(0)
  const [levelUps, setLevelUps] = useState(0)
  const levelUpsRef = useRef(0)
  const [debugImages, setDebugImages] = useState<OcrDebugImages | null>(null)
  const [debugEnabled, setDebugEnabled] = useState(false)
  const engineRef = useRef<TrackingEngine | null>(null)
  const readingsRef = useRef<ExpReading[]>([])
  const metricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionStartTimeRef = useRef<number>(0)
  const sessionStartExpRef = useRef<number>(0)
  const sessionStartPercentageRef = useRef<number>(0)

  // Chart data: computed incrementally, only updates state on new bucket
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const chartPointsRef = useRef<ChartPoint[]>([])
  const bucketStartRef = useRef(0)

  const startTracking = useCallback(async () => {
    const engine = new TrackingEngine({
      onReading: (reading) => {
        if (readingsRef.current.length === 0) {
          sessionStartTimeRef.current = reading.timestamp
          sessionStartExpRef.current = reading.cumulativeExp
          sessionStartPercentageRef.current = reading.percentage
          bucketStartRef.current = reading.timestamp
        }
        readingsRef.current = readingsRef.current.length >= MAX_READINGS
          ? [...readingsRef.current.slice(-MAX_READINGS + 1), reading]
          : [...readingsRef.current, reading]

        // Check if a new chart bucket should be created
        if (reading.timestamp - bucketStartRef.current >= BUCKET_MS) {
          const readings = readingsRef.current
          const i = readings.length - 1
          const windowStart = findReadingAt(readings, reading.timestamp - WINDOW_MS, i)
          const elapsed = reading.timestamp - windowStart.timestamp
          const expGained = reading.cumulativeExp - windowStart.cumulativeExp
          const expPer10Min = elapsed > 0 ? Math.round((expGained / elapsed) * 600_000) : 0

          chartPointsRef.current = [...chartPointsRef.current, {
            time: new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            expPer10Min,
          }]
          bucketStartRef.current = reading.timestamp
          setChartData(chartPointsRef.current)
        }
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
      onLevelUp: () => {
        levelUpsRef.current += 1
        setLevelUps(levelUpsRef.current)
      },
    })
    engineRef.current = engine

    // Metrics update on a separate timer (not every reading)
    metricsIntervalRef.current = setInterval(() => {
      if (readingsRef.current.length > 0) {
        setMetrics(computeMetrics(readingsRef.current, sessionStartTimeRef.current, sessionStartExpRef.current, sessionStartPercentageRef.current, levelUpsRef.current))
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
      setMetrics(computeMetrics(readingsRef.current, sessionStartTimeRef.current, sessionStartExpRef.current, sessionStartPercentageRef.current, levelUpsRef.current))
    }
    engineRef.current?.stop()
    engineRef.current = null
    readingsRef.current = []
    sessionStartTimeRef.current = 0
    sessionStartExpRef.current = 0
    sessionStartPercentageRef.current = 0
    levelUpsRef.current = 0
    chartPointsRef.current = []
    bucketStartRef.current = 0
    setStatus('idle')
  }, [])

  const getCapture = useCallback(() => {
    return engineRef.current?.getCapture() ?? null
  }, [])

  return {
    chartData,
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
