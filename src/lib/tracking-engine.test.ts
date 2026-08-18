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

  it('recovers from a level-up missed while OCR was blocked', async () => {
    // Last accepted reading was 40%; readings resume at ~3% of the next level.
    // The drop is measured against that level's 1m maximum rather than the 400k
    // reading itself, so the wrap is recognised on the first reading back.
    const seq = [
      { rawExp: 400_000, percentage: 40 },     // accepted baseline, level max 1m
      { rawExp: 30_000, percentage: 2.72 },    // level-up recognised here; next level is 1.1m
      { rawExp: 31_000, percentage: 2.81 },
      { rawExp: 32_000, percentage: 2.9 },
      { rawExp: 33_000, percentage: 3 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))

    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    expect(callbacks.onLevelUp).toHaveBeenCalledTimes(1)
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    // Tracking resumes and the level is counted, but the EXP earned while the
    // bar was unreadable is not: the last reading sat at 40%, so the run up to
    // the wrap was never seen and there is nothing to size it from. Cumulative
    // EXP carries across unchanged and only observed progress is added.
    expect(readings[1]?.cumulativeExp).toBe(400_000)
    expect(readings.at(-1)?.cumulativeExp).toBe(403_000)

    engine.stop()
  })

  it('accepts a legitimate large EXP gain immediately', async () => {
    // A big quest turn-in more than doubles EXP. The percentage moves with it,
    // so the cross-check confirms the pair and the gain is real. Only the ratio
    // filter would have objected, and it does not get a veto over a reading the
    // cross-check can vouch for.
    const seq = [
      { rawExp: 200_000, percentage: 20 },
      { rawExp: 500_000, percentage: 50 },
      { rawExp: 501_000, percentage: 50.1 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))

    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(2100)

    expect(callbacks.onLevelUp).not.toHaveBeenCalled()
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([200_000, 500_000, 501_000])

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

  it('rejects a misread that inflates EXP while the percentage stays put', async () => {
    // A dropped or duplicated digit moves EXP without moving the percentage.
    // The two no longer agree about the level size, which is exactly what the
    // cross-check is for. Adopting it would inject millions of EXP that the
    // player never earned.
    const seq = [
      { rawExp: 400_000, percentage: 40 },
      { rawExp: 4_000_000, percentage: 40 },
      { rawExp: 4_000_000, percentage: 40 },
      { rawExp: 4_000_000, percentage: 40 },
      { rawExp: 4_000_000, percentage: 40 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([400_000])

    engine.stop()
  })

  it('never emits a reading whose cumulative EXP fell below the previous one', async () => {
    // A dropped digit shrinks EXP while the percentage stays plausible. Left
    // alone it reaches the metrics as a large negative rate.
    const seq = [
      { rawExp: 400_000, percentage: 40 },
      { rawExp: 40_000, percentage: 40 },
      { rawExp: 40_000, percentage: 40 },
      { rawExp: 40_000, percentage: 40 },
      { rawExp: 40_000, percentage: 40 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([400_000])

    engine.stop()
  })

  it('does not mistake a systematic misread for a level-up', async () => {
    // The same wrong pair every frame: EXP ticks down slightly while the
    // percentage disagrees with it. Neither value halves, so it is not a wrap.
    const seq = [
      { rawExp: 400_000, percentage: 40 },
      { rawExp: 390_000, percentage: 30 },
      { rawExp: 390_000, percentage: 30 },
      { rawExp: 390_000, percentage: 30 },
      { rawExp: 390_000, percentage: 30 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    expect(callbacks.onLevelUp).not.toHaveBeenCalled()
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([400_000])

    engine.stop()
  })

  it('resyncs onto a run of readings that corroborate each other', async () => {
    // OCR was blocked long enough that the player is 40% into the next level by
    // the time it recovers, so the wrap is no longer visible as a halving. The
    // readings agree with each other and EXP climbs, which is what a stale
    // baseline looks like. Cumulative EXP stays continuous across the resync:
    // the missed level is under-counted rather than guessed at.
    const seq = [
      { rawExp: 900_000, percentage: 90 },     // level max 1m
      { rawExp: 560_000, percentage: 40 },     // next level is 1.4m
      { rawExp: 570_000, percentage: 40.71 },
      { rawExp: 580_000, percentage: 41.42 },
      { rawExp: 590_000, percentage: 42.14 },  // resyncs here
      { rawExp: 600_000, percentage: 42.85 },
      { rawExp: 610_000, percentage: 43.57 },
      { rawExp: 620_000, percentage: 44.28 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(7100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([900_000, 900_000, 910_000, 920_000, 930_000])

    engine.stop()
  })

  it('does not resync onto a stuck misread that never gains EXP', async () => {
    // Same shape as a stale baseline — repeated readings that disagree with it
    // and agree with each other — except EXP never moves. A player being
    // tracked is earning EXP; a frozen misread is not, and that is what
    // separates the two.
    const seq = [
      { rawExp: 400_000, percentage: 40 },
      { rawExp: 800_000, percentage: 40 },
      { rawExp: 800_000, percentage: 40 },
      { rawExp: 800_000, percentage: 40 },
      { rawExp: 800_000, percentage: 40 },
      { rawExp: 800_000, percentage: 40 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(5100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([400_000])

    engine.stop()
  })

  it('recovers from a missed level-up into a larger level', async () => {
    const seq = [
      { rawExp: 600_000, percentage: 60 },     // level max 1m
      { rawExp: 350_000, percentage: 25 },     // next level is 1.4m
      { rawExp: 360_000, percentage: 25.71 },
      { rawExp: 370_000, percentage: 26.42 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(3100)

    expect(callbacks.onLevelUp).toHaveBeenCalledTimes(1)
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    // As above, the unobserved run up to the wrap is not credited.
    expect(readings[1]?.cumulativeExp).toBe(600_000)
    expect(readings.at(-1)?.cumulativeExp).toBe(620_000)

    engine.stop()
  })

  it('accumulates offsets across successive level-ups without double counting', async () => {
    const seq = [
      // A level size is inferred by dividing by percentage, so a reading taken
      // from a nearly empty bar pins it only loosely. Steps stay within about
      // 10x the previous percentage, which is far coarser than the one-second
      // sampling this runs at.
      { rawExp: 950_000, percentage: 95 },        // level max 1m
      { rawExp: 12_500, percentage: 1 },          // level-up 1; next level is 1.25m
      { rawExp: 125_000, percentage: 10 },
      { rawExp: 1_237_500, percentage: 99 },
      { rawExp: 15_625, percentage: 1 },          // level-up 2; next level is 1.5625m
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    expect(callbacks.onLevelUp).toHaveBeenCalledTimes(2)
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([
      950_000, 1_012_447, 1_124_947, 2_237_447, 2_265_509,
    ])

    engine.stop()
  })

  it('accepts the EXP a player loses by dying', async () => {
    // Dying takes 10 points off the bar. EXP is therefore not monotonic, and
    // the loss is real progress gone: it belongs in the numbers, not filtered
    // out. What separates it from a dropped-digit misread is that EXP and
    // percentage fall together, which the cross-check confirms.
    const seq = [
      { rawExp: 500_000, percentage: 50 },  // level max 1m
      { rawExp: 400_000, percentage: 40 },  // died
      { rawExp: 410_000, percentage: 41 },  // grinding again
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(2100)

    expect(callbacks.onLevelUp).not.toHaveBeenCalled()
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([500_000, 400_000, 410_000])

    engine.stop()
  })

  it('does not mistake a death low in the level for a level-up', async () => {
    // At 15% a death halves both EXP and percentage, which is the shape of a
    // wrap. A real wrap moves the bar much further than the death penalty can.
    const seq = [
      { rawExp: 150_000, percentage: 15 },  // level max 1m
      { rawExp: 50_000, percentage: 5 },    // died
      { rawExp: 60_000, percentage: 6 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(2100)

    expect(callbacks.onLevelUp).not.toHaveBeenCalled()
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([150_000, 50_000, 60_000])

    engine.stop()
  })

  it('accepts a death that empties the bar from below the penalty', async () => {
    // Under 10% there is not a full penalty left to take, so the bar goes to
    // zero rather than wrapping backwards into the previous level.
    const seq = [
      { rawExp: 50_000, percentage: 5 },    // level max 1m
      { rawExp: 0, percentage: 0 },         // died
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(1100)

    expect(callbacks.onLevelUp).not.toHaveBeenCalled()
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([50_000, 0])

    engine.stop()
  })

  it('rejects a misread that shrinks EXP and percentage by the same factor', async () => {
    // 400k at 40% misread as 40k at 4.00% is internally consistent, so the
    // cross-check cannot fault it, and it has the shape of a wrap. What gives
    // it away is that the level it implies is exactly the size of the one the
    // player is already in, and levels only ever get bigger.
    const seq = [
      { rawExp: 400_000, percentage: 40 },
      { rawExp: 40_000, percentage: 4 },
      { rawExp: 40_000, percentage: 4 },
      { rawExp: 40_000, percentage: 4 },
      { rawExp: 40_000, percentage: 4 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    expect(callbacks.onLevelUp).not.toHaveBeenCalled()
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([400_000])

    engine.stop()
  })

  it('keeps validating after a death empties the bar', async () => {
    // Dying never costs a level: the player stays where they were, at 0%. The
    // level's size is therefore still known, and must not be forgotten just
    // because the reading it was last inferred from now reads zero. Forgetting
    // it takes the cross-check offline exactly when the bar is least readable.
    const seq = [
      { rawExp: 50_000, percentage: 5 },        // level max 1m
      { rawExp: 0, percentage: 0 },             // died
      { rawExp: 4_000_000, percentage: 5 },     // misread, EXP without the bar
      { rawExp: 4_000_000, percentage: 5 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(3100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([50_000, 0])

    engine.stop()
  })

  it('keeps validating while an emptied bar still truncates to zero', async () => {
    // After a death the bar reads 0.00% for as long as the EXP earned back is
    // under one hundredth of the level, which at a slow rate is many seconds.
    // Nothing about that window should be taken on trust.
    const seq = [
      { rawExp: 50_000, percentage: 5 },        // level max 1m
      { rawExp: 0, percentage: 0 },
      { rawExp: 58, percentage: 0 },            // under 100, so still shows 0.00
      { rawExp: 99, percentage: 0 },
      { rawExp: 9_999_999, percentage: 0 },     // absurd, must not be adopted
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(4100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.at(-1)?.cumulativeExp).toBeLessThan(1_000)

    engine.stop()
  })

  it('does not treat a misread drifting upward with real progress as a gain', async () => {
    // OCR reads EXP as roughly double throughout. Each reading contradicts the
    // baseline but agrees with the one before it, and EXP climbs, so the run
    // looks exactly like a stale baseline being overtaken. Adopting it is fine;
    // reading a gain out of it is not, because a resync says only that the old
    // baseline cannot be trusted.
    const seq = [
      { rawExp: 400_000, percentage: 40 },
      { rawExp: 800_000, percentage: 40 },
      { rawExp: 820_000, percentage: 41 },
      { rawExp: 840_000, percentage: 42 },
      { rawExp: 860_000, percentage: 43 },
      { rawExp: 880_000, percentage: 44 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(5100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    // The resync lands on the old value, then only real movement counts.
    expect(readings[1]?.cumulativeExp).toBe(400_000)
    expect(readings.at(-1)?.cumulativeExp).toBe(420_000)

    engine.stop()
  })

  it('does not credit unobserved EXP when the wrap was missed', async () => {
    // A misread of 50k at 4% clears every level-up test: both values more than
    // halve, the bar falls 36 points, and the level it implies is larger than
    // the current one. Crediting it means believing a single frame that says
    // 600k EXP appeared between two samples. The last reading sat at 40%, so
    // the gap to the level's end was never observed and cannot be bounded.
    const seq = [
      { rawExp: 400_000, percentage: 40 },
      { rawExp: 50_000, percentage: 4 },
      { rawExp: 51_000, percentage: 4.08 },
      { rawExp: 52_000, percentage: 4.16 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(3100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings[1]?.cumulativeExp).toBe(400_000)
    expect(readings.at(-1)?.cumulativeExp).toBe(402_000)

    engine.stop()
  })

  it('credits the finished level accurately when the wrap is caught at 99.99%', async () => {
    // The last reading before a wrap normally sits at the very top of the bar,
    // where the level size is inferred most precisely and the unobserved gap is
    // a hundred EXP rather than a guess. This is the case the crediting rule
    // exists for, and the one it should be most accurate in.
    const seq = [
      { rawExp: 999_900, percentage: 99.99 },   // level max 1m, 100 EXP short
      { rawExp: 100, percentage: 0 },           // next level is 1.25m
      { rawExp: 10_100, percentage: 0.8 },
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve(seq[Math.min(call++, seq.length - 1)]))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync(2100)

    expect(callbacks.onLevelUp).toHaveBeenCalledTimes(1)
    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    // 1,000,000 carried within 50 EXP of the true total, then 10k of real gain.
    expect(readings[1]?.cumulativeExp).toBe(1_000_050)
    expect(readings.at(-1)?.cumulativeExp).toBe(1_010_050)

    engine.stop()
  })

  // Captured from a real level 170 to 171 transition. Level 170 requires
  // 428,049,128 EXP and level 171 requires 451,506,220, neither of which the
  // engine is told: it has to work them out from the bar alone.
  const REAL_170_TO_171: Array<[number, number]> = [
    [427453319, 99.86], [427493318, 99.87], [427527692, 99.87], [427550816, 99.88],
    [427596440, 99.89], [427625189, 99.9], [427642376, 99.9], [427677062, 99.91],
    [427717061, 99.92], [427877369, 99.95], [427923617, 99.97], [427952678, 99.97],
    [427964240, 99.98], [428042676, 99.99],
    [27298, 0], [73234, 0.01], [152920, 0.03], [193231, 0.04],
    [250417, 0.05], [284791, 0.06], [370726, 0.08], [451660, 0.1],
  ]

  it('tracks a real level transition without rejecting a single reading', async () => {
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve({
      rawExp: REAL_170_TO_171[Math.min(call, REAL_170_TO_171.length - 1)][0],
      percentage: REAL_170_TO_171[Math.min(call++, REAL_170_TO_171.length - 1)][1],
    }))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync((REAL_170_TO_171.length - 1) * 1000 + 100)

    expect(callbacks.onOcrFailure).not.toHaveBeenCalled()
    expect(callbacks.onLevelUp).toHaveBeenCalledTimes(1)
    expect(callbacks.onReading).toHaveBeenCalledTimes(REAL_170_TO_171.length)

    engine.stop()
  })

  it('measures a real level transition to within a few hundred EXP', async () => {
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve({
      rawExp: REAL_170_TO_171[Math.min(call, REAL_170_TO_171.length - 1)][0],
      percentage: REAL_170_TO_171[Math.min(call++, REAL_170_TO_171.length - 1)][1],
    }))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync((REAL_170_TO_171.length - 1) * 1000 + 100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    const measured = readings.at(-1)!.cumulativeExp - readings[0].cumulativeExp
    // Finish level 170 from 427,453,319 of 428,049,128, then 451,660 into 171.
    const truth = (428_049_128 - 427_453_319) + 451_660
    expect(Math.abs(measured - truth)).toBeLessThan(300)

    engine.stop()
  })

  it('keeps checking readings while a new level still reads 0.00%', async () => {
    // A brand new level reads 0.00% for as long as the EXP earned back is under
    // a hundredth of it, which at level 170 is hundreds of thousands. A reading
    // that low bounds the level's size from below and not at all from above, so
    // without carrying anything over from the level just finished there is
    // nothing to check against, and the ratio filter cannot help either once
    // cumulative EXP is in the hundreds of millions.
    const seq: Array<[number, number]> = [
      [427_964_240, 99.98], [428_042_676, 99.99],
      [27_298, 0],              // level-up
      [10_000_000, 0.01],       // misread: ten million EXP out of nowhere
      [10_000_000, 0.01],
    ]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve({
      rawExp: seq[Math.min(call, seq.length - 1)][0],
      percentage: seq[Math.min(call++, seq.length - 1)][1],
    }))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync((seq.length - 1) * 1000 + 100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings).toHaveLength(3)
    expect(readings.at(-1)?.cumulativeExp).toBe(428_073_561)

    engine.stop()
  })

  it('rejects a reading whose level size cannot coexist with the readings before it', async () => {
    // 400,180 shows 40.00% only if the level is at least 1,000,450, while the
    // reading before it showed the level is at most 1,000,000. Both cannot hold.
    // That is sharper evidence than the cross-check's slack tolerance, which on
    // its own would have let this through.
    const seq: Array<[number, number]> = [[400_000, 40], [400_180, 40], [400_180, 40]]
    let call = 0
    mockOcr.recognizeExp.mockImplementation(() => Promise.resolve({
      rawExp: seq[Math.min(call, seq.length - 1)][0],
      percentage: seq[Math.min(call++, seq.length - 1)][1],
    }))
    const callbacks = makeCallbacks()
    const engine = new TrackingEngine(callbacks)
    await engine.start(1, null)
    await vi.advanceTimersByTimeAsync((seq.length - 1) * 1000 + 100)

    const readings = callbacks.onReading.mock.calls.map(c => c[0] as { cumulativeExp: number })
    expect(readings.map(r => r.cumulativeExp)).toEqual([400_000])

    engine.stop()
  })
})
