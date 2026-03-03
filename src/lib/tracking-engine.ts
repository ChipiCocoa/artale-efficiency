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
}

export class TrackingEngine {
  private capture = new ScreenCapture()
  private ocr = new OcrService()
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private intervalMs = 1000
  private running = false
  private consecutiveFailures = 0
  private lastPercentage: number | null = null
  private lastRawExp: number | null = null
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
      })

      this.callbacks.onStatusChange('tracking')

      // Take first reading, then chain next after completion
      this.sampleLoop()
    } catch (err) {
      this.callbacks.onStatusChange('error')
      throw err
    }
  }

  private async sampleLoop(): Promise<void> {
    if (!this.running) return
    const start = Date.now()
    await this.takeSample()
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

    // Level-up detection (check before outlier filter)
    const isLevelUp = this.lastPercentage !== null && parsed.percentage < this.lastPercentage - 50
    if (isLevelUp) {
      this.callbacks.onLevelUp()
    }

    // Outlier filter: if EXP jumps by more than 2x vs previous reading,
    // it's almost certainly an OCR misread (e.g. extra digit). Skip it.
    // Exception: allow through if level-up detected (EXP may reset per-level).
    if (this.lastRawExp !== null && parsed.rawExp > 0 && !isLevelUp) {
      const ratio = parsed.rawExp / this.lastRawExp
      if (ratio > 2 || ratio < 0.5) {
        console.log(`[OCR] outlier filtered: ${parsed.rawExp} vs prev ${this.lastRawExp} (ratio ${ratio.toFixed(2)})`)
        this.consecutiveFailures++
        this.callbacks.onOcrFailure(this.consecutiveFailures)
        return
      }
    }

    this.consecutiveFailures = 0
    this.lastRawExp = parsed.rawExp
    this.lastPercentage = parsed.percentage

    const reading: ExpReading = {
      timestamp: Date.now(),
      rawExp: parsed.rawExp,
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
    this.lastPercentage = null
    this.lastRawExp = null
  }
}
