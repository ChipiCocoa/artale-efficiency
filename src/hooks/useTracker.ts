import { useState, useCallback, useRef } from 'react'
import type { ExpReading, ExpMetrics, Settings } from '../types.ts'
import { computeMetrics } from '../lib/metrics.ts'
import { TrackingEngine } from '../lib/tracking-engine.ts'
import type { TrackingStatus } from '../lib/tracking-engine.ts'

export function useTracker(settings: Settings) {
  const [readings, setReadings] = useState<ExpReading[]>([])
  const [metrics, setMetrics] = useState<ExpMetrics>(computeMetrics([]))
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [ocrFailures, setOcrFailures] = useState(0)
  const [levelUps, setLevelUps] = useState(0)
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
      onLevelUp: () => setLevelUps(prev => prev + 1),
    })
    engineRef.current = engine
    await engine.start(settings.sampleInterval, settings.cropRegion)
  }, [settings.sampleInterval, settings.cropRegion])

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
    startTracking,
    stopTracking,
    getCapture,
  }
}
