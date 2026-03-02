import { createWorker, PSM } from 'tesseract.js'
import type { Worker } from 'tesseract.js'
import { parseExpText } from './exp-parser.ts'
import type { ParsedExp } from './exp-parser.ts'
import { toGrayscale, enhanceContrast } from './image-preprocessing.ts'

export class OcrService {
  private worker: Worker | null = null

  async initialize(): Promise<void> {
    this.worker = await createWorker('eng')
    await this.worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: '0123456789[].%',
    })
  }

  async recognizeExp(imageData: ImageData): Promise<ParsedExp | null> {
    if (!this.worker) throw new Error('OCR not initialized. Call initialize() first.')

    // Preprocess
    const gray = toGrayscale(imageData)
    const enhanced = enhanceContrast(gray, 1.8)

    // Convert ImageData to canvas for Tesseract
    const canvas = new OffscreenCanvas(enhanced.width, enhanced.height)
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(enhanced, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })

    const { data: { text } } = await this.worker.recognize(blob)
    return parseExpText(text.trim())
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }
}
