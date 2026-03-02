import type { CropRegion } from '../types'

export class ScreenCapture {
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private canvas: OffscreenCanvas | null = null

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    this.video = document.createElement('video')
    this.video.srcObject = this.stream
    this.video.play()

    // Wait for video to be ready
    await new Promise<void>((resolve) => {
      this.video!.onloadedmetadata = () => resolve()
    })
  }

  isActive(): boolean {
    return this.stream !== null && this.stream.active
  }

  onEnded(callback: () => void): void {
    if (!this.stream) return
    const track = this.stream.getVideoTracks()[0]
    if (track) {
      track.addEventListener('ended', callback)
    }
  }

  captureFrame(cropRegion?: CropRegion | null): ImageData | null {
    if (!this.video || !this.stream?.active) return null

    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    if (vw === 0 || vh === 0) return null

    const sx = cropRegion?.x ?? 0
    const sy = cropRegion?.y ?? 0
    const sw = cropRegion?.width ?? vw
    const sh = cropRegion?.height ?? vh

    if (!this.canvas || this.canvas.width !== sw || this.canvas.height !== sh) {
      this.canvas = new OffscreenCanvas(sw, sh)
    }

    const ctx = this.canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, sw, sh)
    return ctx.getImageData(0, 0, sw, sh)
  }

  getPreviewFrame(): ImageData | null {
    return this.captureFrame(null)
  }

  getVideoDimensions(): { width: number; height: number } | null {
    if (!this.video) return null
    return { width: this.video.videoWidth, height: this.video.videoHeight }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }
    if (this.video) {
      this.video.srcObject = null
      this.video = null
    }
    this.canvas = null
  }
}
