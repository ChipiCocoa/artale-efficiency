import type { ExpReading, CropRegion } from '../types.ts'
import { ScreenCapture } from './screen-capture.ts'
import { OcrService } from './ocr-service.ts'
import type { OcrDebugImages } from './ocr-service.ts'

export type TrackingStatus = 'idle' | 'initializing' | 'tracking' | 'error'

export interface TrackingCallbacks {
  onReading: (reading: ExpReading) => void
  onStatusChange: (status: TrackingStatus) => void
  onOcrFailure: (consecutiveFailures: number) => void
  onDebugImages: (images: OcrDebugImages) => void
  onLevelUp: () => void
  /** Fired when the capture stream ends outside our control (browser "Stop sharing"). */
  onEnded: () => void
}

// Max allowed discrepancy between expected and actual percentage.
// Covers rounding from 2-decimal display precision (0.01%) with margin.
const PCT_TOLERANCE = 0.1

// After this many consecutive validation rejections the baseline itself is
// considered stale (e.g. a level-up happened while OCR was blocked) and the
// next reading is trusted as the new baseline. Rejections are well-parsed,
// high-confidence readings — several in a row contradicting the baseline
// means the baseline is wrong, not the readings.
const REBASELINE_AFTER_REJECTIONS = 3

export class TrackingEngine {
  private capture = new ScreenCapture()
  private ocr = new OcrService()
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private intervalMs = 1000
  private running = false
  private consecutiveFailures = 0
  private consecutiveRejections = 0
  private lastPercentage: number | null = null
  private lastCumulativeExp: number | null = null
  private lastRawExp: number | null = null
  private expOffset = 0 // cumulative offset added on each level-up
  private cropRegion: CropRegion | null = null
  private callbacks: TrackingCallbacks

  constructor(callbacks: TrackingCallbacks) {
    this.callbacks = callbacks
  }

  updateCropRegion(cropRegion: CropRegion | null): void {
    this.cropRegion = cropRegion
  }

  setDebugEnabled(enabled: boolean): void {
    this.ocr.debugEnabled = enabled
  }

  async start(intervalSeconds: number, cropRegion: CropRegion | null): Promise<void> {
    this.cropRegion = cropRegion
    this.intervalMs = intervalSeconds * 1000
    this.running = true
    this.callbacks.onStatusChange('initializing')

    try {
      await this.ocr.initialize()
      await this.capture.start()

      this.capture.onEnded(() => {
        this.stop()
        this.callbacks.onStatusChange('idle')
        this.callbacks.onEnded()
      })

      this.callbacks.onStatusChange('tracking')

      // Take first reading, then chain next after completion
      this.sampleLoop()
    } catch (err) {
      // Failed start (e.g. user cancelled the screen picker) must not leak
      // the already-created OCR worker or leave the engine marked running.
      this.stop()
      this.callbacks.onStatusChange('error')
      throw err
    }
  }

  private async sampleLoop(): Promise<void> {
    if (!this.running) return
    const start = Date.now()
    try {
      await this.takeSample()
    } catch (err) {
      // A single failed sample (e.g. transient worker error) must not kill
      // the loop — count it like an OCR misread and keep sampling.
      console.error('[Tracking] sample failed:', err)
      this.consecutiveFailures++
      this.callbacks.onOcrFailure(this.consecutiveFailures)
    }
    if (!this.running) return
    // Schedule next sample: interval minus time spent, minimum 0
    const elapsed = Date.now() - start
    const delay = Math.max(0, this.intervalMs - elapsed)
    this.timeoutId = setTimeout(() => this.sampleLoop(), delay)
  }

  private async takeSample(): Promise<void> {
    const frame = this.capture.captureFrame(this.cropRegion)
    if (!frame) return

    const parsed = await this.ocr.recognizeExp(frame)

    if (this.ocr.lastDebugImages) {
      this.callbacks.onDebugImages(this.ocr.lastDebugImages)
    }

    if (!parsed) {
      this.consecutiveFailures++
      this.callbacks.onOcrFailure(this.consecutiveFailures)
      return
    }

    const rebaseline = this.consecutiveRejections >= REBASELINE_AFTER_REJECTIONS

    // Level-up detection: require BOTH percentage and EXP to drop significantly
    // to avoid false triggers from OCR misreads. When re-baselining, any drop
    // in both values means the missed transition was a level-up.
    const lastExpBeforeOffset = this.lastCumulativeExp !== null ? this.lastCumulativeExp - this.expOffset : null
    const isLevelUp = (this.lastPercentage !== null
      && parsed.percentage < this.lastPercentage - 50
      && lastExpBeforeOffset !== null && parsed.rawExp < lastExpBeforeOffset * 0.5)
      || (rebaseline
        && this.lastPercentage !== null && parsed.percentage < this.lastPercentage
        && lastExpBeforeOffset !== null && parsed.rawExp < lastExpBeforeOffset)
    if (isLevelUp) {
      // EXP resets per-level. Set offset to last cumulative value directly
      // — not +=, which would double-count.
      if (this.lastCumulativeExp !== null) {
        this.expOffset = this.lastCumulativeExp
        console.log(`[Level Up] offset set to ${this.expOffset}`)
      }
      this.callbacks.onLevelUp()
    }

    const adjustedExp = parsed.rawExp + this.expOffset

    if (rebaseline && !isLevelUp) {
      console.log(`[OCR] re-baseline after ${this.consecutiveRejections} rejections: ${adjustedExp} @ ${parsed.percentage}%`)
    }

    if (!isLevelUp && !rebaseline) {
      // Extreme outlier filter: only when cumulative EXP is large enough for
      // ratio to be meaningful. Below 100k, single mob kills can cause huge ratios.
      if (this.lastCumulativeExp !== null && this.lastCumulativeExp > 100_000 && adjustedExp > 0) {
        const ratio = adjustedExp / this.lastCumulativeExp
        if (ratio > 2 || ratio < 0.5) {
          console.log(`[OCR] outlier filtered: ${adjustedExp} vs prev ${this.lastCumulativeExp} (ratio ${ratio.toFixed(2)})`)
          this.consecutiveRejections++
          this.consecutiveFailures++
          this.callbacks.onOcrFailure(this.consecutiveFailures)
          return
        }
      }

      // Cross-check: verify EXP and percentage are consistent.
      // Use previous reading to estimate total level EXP, then check if
      // the current rawExp matches the current percentage within tolerance.
      if (this.lastRawExp !== null && this.lastPercentage !== null && this.lastPercentage > 0) {
        const estimatedTotalExp = this.lastRawExp / (this.lastPercentage / 100)
        const expectedPct = (parsed.rawExp / estimatedTotalExp) * 100
        const diff = Math.abs(expectedPct - parsed.percentage)
        if (diff > PCT_TOLERANCE) {
          console.log(`[OCR] cross-check failed: expected ${expectedPct.toFixed(2)}% but got ${parsed.percentage}% (diff ${diff.toFixed(2)}%)`)
          this.consecutiveRejections++
          this.consecutiveFailures++
          this.callbacks.onOcrFailure(this.consecutiveFailures)
          return
        }
      }
    }

    this.consecutiveFailures = 0
    this.consecutiveRejections = 0
    this.lastCumulativeExp = adjustedExp
    this.lastRawExp = parsed.rawExp
    this.lastPercentage = parsed.percentage

    const reading: ExpReading = {
      timestamp: Date.now(),
      cumulativeExp: adjustedExp,
      displayExp: parsed.rawExp,
      percentage: parsed.percentage,
    }
    this.callbacks.onReading(reading)
  }

  getCapture(): ScreenCapture {
    return this.capture
  }

  isActive(): boolean {
    return this.capture.isActive()
  }

  stop(): void {
    this.running = false
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    this.capture.stop()
    this.ocr.terminate()
    this.consecutiveFailures = 0
    this.consecutiveRejections = 0
    this.lastPercentage = null
    this.lastCumulativeExp = null
    this.lastRawExp = null
    this.expOffset = 0
  }
}
