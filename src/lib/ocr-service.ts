import { createWorker, PSM } from 'tesseract.js'
import type { Worker } from 'tesseract.js'
import { parseExpText } from './exp-parser.ts'
import type { ParsedExp } from './exp-parser.ts'
import { toGrayscale, threshold, upscale, invert } from './image-preprocessing.ts'

const MIN_CONFIDENCE = 40

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
      tessedit_char_whitelist: '0123456789[].% ',
    })
  }

  lastDebugImages: OcrDebugImages | null = null
  debugEnabled = false
  private ocrCanvas: OffscreenCanvas | null = null

  async recognizeExp(imageData: ImageData): Promise<ParsedExp | null> {
    if (!this.worker) throw new Error('OCR not initialized. Call initialize() first.')

    // Preprocess: upscale 4x → grayscale → high threshold → invert
    const scaled = upscale(imageData, 4)
    const gray = toGrayscale(scaled)
    const binary = threshold(gray, 200)
    const final_ = invert(binary)

    // Generate debug images only when debug panel is visible
    if (this.debugEnabled) {
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
    }

    // Reuse canvas for Tesseract conversion
    if (!this.ocrCanvas || this.ocrCanvas.width !== final_.width || this.ocrCanvas.height !== final_.height) {
      this.ocrCanvas = new OffscreenCanvas(final_.width, final_.height)
    }
    const ctx = this.ocrCanvas.getContext('2d')!
    ctx.putImageData(final_, 0, 0)
    const blob = await this.ocrCanvas.convertToBlob({ type: 'image/png' })

    const { data: { text, confidence } } = await this.worker.recognize(blob)
    const trimmed = text.trim()
    console.log(`[OCR] raw="${trimmed}" confidence=${confidence} size=${final_.width}x${final_.height}`)

    if (confidence < MIN_CONFIDENCE) {
      console.log(`[OCR] low confidence (${confidence}), skipping`)
      return null
    }

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
