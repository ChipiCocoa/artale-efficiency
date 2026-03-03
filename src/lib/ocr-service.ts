import { createWorker, PSM } from 'tesseract.js'
import type { Worker } from 'tesseract.js'
import { parseExpText } from './exp-parser.ts'
import type { ParsedExp } from './exp-parser.ts'
import { toGrayscale, threshold, upscale, invert } from './image-preprocessing.ts'

export interface OcrDebugImages {
  raw: string       // data URL of cropped raw frame
  processed: string // data URL after preprocessing (what Tesseract sees)
}

export class OcrService {
  private worker: Worker | null = null

  async initialize(): Promise<void> {
    this.worker = await createWorker('eng')
    await this.worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    })
  }

  lastDebugImages: OcrDebugImages | null = null

  async recognizeExp(imageData: ImageData): Promise<ParsedExp | null> {
    if (!this.worker) throw new Error('OCR not initialized. Call initialize() first.')

    // Preprocess: upscale 3x → grayscale → high threshold → invert
    // High threshold (200) keeps only bright white text, removes progress bar & background
    // Invert: Tesseract prefers dark text on white background
    const scaled = upscale(imageData, 3)
    const gray = toGrayscale(scaled)
    const binary = threshold(gray, 200)
    const final_ = invert(binary)

    // Generate debug images
    const rawCanvas = new OffscreenCanvas(imageData.width, imageData.height)
    rawCanvas.getContext('2d')!.putImageData(imageData, 0, 0)
    const rawBlob = await rawCanvas.convertToBlob({ type: 'image/png' })

    const procCanvas = new OffscreenCanvas(final_.width, final_.height)
    procCanvas.getContext('2d')!.putImageData(final_, 0, 0)
    const procBlob = await procCanvas.convertToBlob({ type: 'image/png' })

    this.lastDebugImages = {
      raw: URL.createObjectURL(rawBlob),
      processed: URL.createObjectURL(procBlob),
    }

    // Convert ImageData to canvas for Tesseract
    const canvas = new OffscreenCanvas(final_.width, final_.height)
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(final_, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })

    const { data: { text, confidence } } = await this.worker.recognize(blob)
    const trimmed = text.trim()
    console.log(`[OCR] raw="${trimmed}" confidence=${confidence} size=${final_.width}x${final_.height}`)
    const parsed = parseExpText(trimmed)
    if (!parsed) {
      console.log(`[OCR] regex failed to match. Raw text: "${trimmed}"`)
    }
    return parsed
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }
}
