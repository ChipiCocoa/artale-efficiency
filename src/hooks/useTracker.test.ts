import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTracker } from './useTracker'
import type { TrackingCallbacks } from '../lib/tracking-engine'
import type { ExpReading, Settings } from '../types'

const { engineState } = vi.hoisted(() => ({
  engineState: {
    callbacks: null as TrackingCallbacks | null,
    instances: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
  },
}))

vi.mock('../lib/tracking-engine.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/tracking-engine.ts')>()
  return {
    ...original,
    TrackingEngine: class {
      start = vi.fn().mockResolvedValue(undefined)
      stop = vi.fn()
      updateCropRegion = vi.fn()
      setDebugEnabled = vi.fn()
      getCapture = vi.fn()
      isActive = vi.fn()
      constructor(callbacks: TrackingCallbacks) {
        engineState.callbacks = callbacks
        engineState.instances.push(this as never)
      }
    },
  }
})

const SETTINGS: Settings = { sampleInterval: 1, cropRegion: null }

function reading(timestamp: number, cumulativeExp: number, percentage: number): ExpReading {
  return { timestamp, cumulativeExp, displayExp: cumulativeExp, percentage }
}

beforeEach(() => {
  vi.useFakeTimers()
  engineState.callbacks = null
  engineState.instances = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTracker session lifecycle', () => {
  it('clears the metrics interval and resets the session when capture ends externally', async () => {
    const { result } = renderHook(() => useTracker(SETTINGS))

    await act(async () => {
      await result.current.startTracking()
    })
    expect(vi.getTimerCount()).toBe(1) // metrics interval running

    // A reading arrives, then the user clicks the browser's "Stop sharing"
    act(() => {
      engineState.callbacks!.onReading(reading(1_000_000, 500_000, 10))
      engineState.callbacks!.onEnded()
    })

    // Interval must be gone — no timer left ticking
    expect(vi.getTimerCount()).toBe(0)

    // A new session must start fresh, not inherit the old baseline
    await act(async () => {
      await result.current.startTracking()
    })
    act(() => {
      engineState.callbacks!.onReading(reading(2_000_000, 800_000, 20))
      vi.advanceTimersByTime(2000)
    })

    // Session started at the new reading: duration 0, gained 0 — not 1000s / 300k
    expect(result.current.metrics.sessionDurationMs).toBe(0)
    expect(result.current.metrics.sessionExpGained).toBe(0)
  })
})
