import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrackingEngine } from './tracking-engine'
import type { TrackingCallbacks } from './tracking-engine'

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

function makeCallbacks(): TrackingCallbacks {
  return {
    onReading: vi.fn(),
    onStatusChange: vi.fn(),
    onOcrFailure: vi.fn(),
    onDebugImages: vi.fn(),
    onLevelUp: vi.fn(),
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
})
