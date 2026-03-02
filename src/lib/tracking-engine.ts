import type { ExpReading, CropRegion } from '../types.ts'
import { ScreenCapture } from './screen-capture.ts'
import { OcrService } from './ocr-service.ts'

export type TrackingStatus = 'idle' | 'initializing' | 'tracking' | 'error'

export interface TrackingCallbacks {
  onReading: (reading: ExpReading) => void
  onStatusChange: (status: TrackingStatus) => void
  onOcrFailure: (consecutiveFailures: number) => void
  onLevelUp: () => void
}

export class TrackingEngine {
  private capture = new ScreenCapture()
  private ocr = new OcrService()
  private intervalId: ReturnType<typeof setInterval> | null = null
  private consecutiveFailures = 0
  private lastPercentage: number | null = null
  private callbacks: TrackingCallbacks

  constructor(callbacks: TrackingCallbacks) {
    this.callbacks = callbacks
  }

  async start(intervalSeconds: number, cropRegion: CropRegion | null): Promise<void> {
    this.callbacks.onStatusChange('initializing')

    try {
      await this.ocr.initialize()
      await this.capture.start()

      this.capture.onEnded(() => {
        this.stop()
        this.callbacks.onStatusChange('idle')
      })

      this.callbacks.onStatusChange('tracking')

      // Take first reading immediately
      await this.takeSample(cropRegion)

      // Then at intervals
      this.intervalId = setInterval(() => {
        this.takeSample(cropRegion)
      }, intervalSeconds * 1000)
    } catch (err) {
      this.callbacks.onStatusChange('error')
      throw err
    }
  }

  private async takeSample(cropRegion: CropRegion | null): Promise<void> {
    const frame = this.capture.captureFrame(cropRegion)
    if (!frame) return

    const parsed = await this.ocr.recognizeExp(frame)

    if (!parsed) {
      this.consecutiveFailures++
      this.callbacks.onOcrFailure(this.consecutiveFailures)
      return
    }

    this.consecutiveFailures = 0

    // Level-up detection
    if (this.lastPercentage !== null && parsed.percentage < this.lastPercentage - 50) {
      this.callbacks.onLevelUp()
    }
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
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.capture.stop()
    this.ocr.terminate()
    this.consecutiveFailures = 0
    this.lastPercentage = null
  }
}
