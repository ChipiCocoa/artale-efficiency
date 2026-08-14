import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTracker } from './useTracker'
import type { TrackingCallbacks } from '../lib/tracking-engine'
import type { ExpReading, Settings } from '../types'

const { engineState } = vi.hoisted(() => ({
  engineState: {
    callbacks: null as TrackingCallbacks | null,
    instances: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
    startBehavior: () => Promise.resolve(),
  },
}))

vi.mock('../lib/tracking-engine.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/tracking-engine.ts')>()
  return {
    ...original,
    TrackingEngine: class {
      start = vi.fn().mockImplementation(() => engineState.startBehavior())
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
  engineState.startBehavior = () => Promise.resolve()
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

  it('clears visible chart, level-ups, and OCR warnings when a new session starts', async () => {
    const { result } = renderHook(() => useTracker(SETTINGS))

    await act(async () => {
      await result.current.startTracking()
    })
    act(() => {
      // Two readings one bucket apart create a chart point; plus a level-up
      // and OCR failures that must not survive into the next session
      engineState.callbacks!.onReading(reading(1_000_000, 500_000, 10))
      engineState.callbacks!.onReading(reading(1_060_000, 560_000, 16))
      engineState.callbacks!.onLevelUp()
      engineState.callbacks!.onOcrFailure(3)
    })
    expect(result.current.chartData).toHaveLength(1)
    expect(result.current.levelUps).toBe(1)
    expect(result.current.ocrFailures).toBe(3)

    // Session ends externally, then a new one starts
    act(() => {
      engineState.callbacks!.onEnded()
    })
    await act(async () => {
      await result.current.startTracking()
    })

    expect(result.current.chartData).toEqual([])
    expect(result.current.levelUps).toBe(0)
    expect(result.current.ocrFailures).toBe(0)
  })

  it('keeps the previous session results visible when a restart attempt fails', async () => {
    const { result } = renderHook(() => useTracker(SETTINGS))

    await act(async () => {
      await result.current.startTracking()
    })
    act(() => {
      engineState.callbacks!.onReading(reading(1_000_000, 500_000, 10))
      engineState.callbacks!.onReading(reading(1_060_000, 560_000, 16))
      engineState.callbacks!.onLevelUp()
      result.current.stopTracking()
    })
    expect(result.current.chartData).toHaveLength(1)
    expect(result.current.levelUps).toBe(1)

    // User clicks Start again but cancels the picker — no session began,
    // so the previous results must remain visible
    engineState.startBehavior = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    await act(async () => {
      await result.current.startTracking()
    })

    expect(result.current.chartData).toHaveLength(1)
    expect(result.current.levelUps).toBe(1)
    expect(result.current.metrics.sessionExpGained).toBe(60_000)
  })

  it('does not leak an interval or engine when start fails (picker cancelled)', async () => {
    engineState.startBehavior = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    const { result } = renderHook(() => useTracker(SETTINGS))

    // Must not reject — App calls this without a catch handler
    await act(async () => {
      await result.current.startTracking()
    })

    expect(vi.getTimerCount()).toBe(0) // no metrics interval left behind
    expect(result.current.getCapture()).toBeNull() // no stale engine

    // Retry after cancelling must work and create exactly one interval
    engineState.startBehavior = () => Promise.resolve()
    await act(async () => {
      await result.current.startTracking()
    })
    expect(vi.getTimerCount()).toBe(1)
  })
})
