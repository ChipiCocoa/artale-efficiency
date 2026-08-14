import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrackingEngine } from './tracking-engine'

const { mockCapture, mockOcr } = vi.hoisted(() => ({
  mockCapture: {
    start: vi.fn(),
    stop: vi.fn(),
    onEnded: vi.fn(),
    captureFrame: vi.fn(),
    isActive: vi.fn(),
  },
  mockOcr: {
    initialize: vi.fn(),
    recognizeExp: vi.fn(),
    terminate: vi.fn(),
    lastDebugImages: null as unknown,
    debugEnabled: false,
  },
}))

vi.mock('./screen-capture.ts', () => ({
  ScreenCapture: class { constructor() { return mockCapture } },
}))

vi.mock('./ocr-service.ts', () => ({
  OcrService: class { constructor() { return mockOcr } },
}))

function makeCallbacks() {
  return {
    onReading: vi.fn(),
    onStatusChange: vi.fn(),
    onOcrFailure: vi.fn(),
    onDebugImages: vi.fn(),
    onLevelUp: vi.fn(),
    onEnded: vi.fn(),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mockCapture.start.mockResolvedValue(undefined)
  mockCapture.captureFrame.mockReturnValue({} as ImageData)
  mockCapture.isActive.mockReturnValue(true)
  mockOcr.initialize.mockResolvedValue(undefined)
  mockOcr.terminate.mockResolvedValue(undefined)
  mockOcr.recognizeExp.mockResolvedValue({ rawExp: 1000, percentage: 10 })
  mockOcr.lastDebugImages = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TrackingEngine sample loop', () => {
  it('keeps sampling when a sample throws, counting it as an OCR failure', async () => {
    mockOcr.recognizeExp
      .mockRejectedValueOnce(new Error('worker terminated mid-recognize'))
      .mockResolvedValue({ rawExp: 1000, percentage: 10 })

    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)

    // First sample rejects
    await vi.advanceTimersByTimeAsync(0)
    expect(callbacks.onOcrFailure).toHaveBeenCalledWith(1)

    // Loop must stay alive: next scheduled sample succeeds
    await vi.advanceTimersByTimeAsync(1000)
    expect(callbacks.onReading).toHaveBeenCalledTimes(1)

    engine.stop()
  })

  it('cleans up the OCR worker when capture fails to start', async () => {
    mockCapture.start.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))

    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)

    await expect(engine.start(1, null)).rejects.toThrow()
    expect(mockOcr.terminate).toHaveBeenCalled()
    expect(callbacks.onStatusChange).toHaveBeenLastCalledWith('error')
  })

  it('re-baselines as a level-up after consecutive rejections when EXP and percentage both dropped', async () => {
    // Level-up happened while OCR was blocked: last accepted reading was 40%,
    // readings resume at ~3% of the next level. The naive level-up condition
    // (pct < last - 50) is unsatisfiable, and the outlier filter rejects
    // every reading — tracking must recover instead of freezing forever.
    const seq = [
      { rawExp: 400_000, percentage: 40 },  // accepted baseline
      { rawExp: 30_000, percentage: 3 },    // rejected (ratio < 0.5)
      { rawExp: 31_000, percentage: 3.1 },  // rejected
      { rawExp: 32_000, percentage: 3.2 },  // rejected
      { rawExp: 33_000, percentage: 3.3 },  // must re-baseline as level-up
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))

    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    expect(callbacks.onLevelUp).toHaveBeenCalledTimes(1)
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    // Cumulative EXP continues across the level: 400k (old level) + 33k (new)
    expect(readings.at(-1)?.cumulativeExp).toBe(433_000)

    engine.stop()
  })

  it('re-baselines without a level-up after consecutive rejections when EXP jumped up', async () => {
    // A legit >2x EXP jump (e.g. big quest turn-in) trips the outlier filter
    // on every subsequent reading; tracking must resync, not freeze.
    const seq = [
      { rawExp: 200_000, percentage: 20 },   // accepted baseline
      { rawExp: 500_000, percentage: 50 },   // rejected (ratio > 2)
      { rawExp: 501_000, percentage: 50.1 }, // rejected
      { rawExp: 502_000, percentage: 50.2 }, // rejected
      { rawExp: 503_000, percentage: 50.3 }, // must re-baseline, no level-up
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))

    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    expect(callbacks.onLevelUp).not.toHaveBeenCalled()
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.at(-1)?.cumulativeExp).toBe(503_000)

    engine.stop()
  })

  it('drops a sample still in flight when the engine stops', async () => {
    let resolveOcr: (v: { rawExp: number; percentage: number }) => void = () => {}
    mockOcr.recognizeExp.mockImplementation(() => new Promise((r) => { resolveOcr = r }))

    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(0) // first sample is now awaiting OCR

    engine.stop()
    resolveOcr({ rawExp: 1000, percentage: 10 })
    await vi.advanceTimersByTimeAsync(0)

    // The late result must not leak into callbacks after stop
    expect(callbacks.onReading).not.toHaveBeenCalled()
  })

  it('notifies onEnded when the capture stream ends externally', async () => {
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)

    // Simulate the user clicking the browser's own "Stop sharing" button
    const trackEnded = mockCapture.onEnded.mock.calls[0][0] as () => void
    trackEnded()

    expect(callbacks.onEnded).toHaveBeenCalled()
    expect(callbacks.onStatusChange).toHaveBeenLastCalledWith('idle')
  })
})
