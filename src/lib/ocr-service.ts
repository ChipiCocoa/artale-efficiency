import { createWorker, PSM } from 'tesseract.js'
import type { Worker } from 'tesseract.js'
import { parseExpText } from './exp-parser.ts'
import type { ParsedExp } from './exp-parser.ts'
import { toGrayscale, threshold, upscale, invert } from './image-preprocessing.ts'

const MIN_CONFIDENCE = 90

export interface OcrDebugResult {
  text: string
  pageConfidence: number
  digitConfidence: number
  symbols: Array<{ text: string; confidence: number }>
  skipped: boolean
}

export interface OcrDebugImages {
  raw: string       // data URL of cropped raw frame
  processed: string // data URL after preprocessing (what Tesseract sees)
  ocrResult?: OcrDebugResult
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
    const binary = threshold(gray, 180)
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

    const { data } = await this.worker.recognize(blob, {}, { blocks: true })
    const trimmed = data.text.trim()

    // Use digit symbol-level confidence instead of page-level mean.
    // Page-level averages ALL words — Tesseract splits "]" as a separate
    // word with confidence=0, dragging the mean to ~5 even when every
    // digit symbol is recognized at 98-99 confidence.
    const words = data.blocks?.flatMap(b =>
      b.paragraphs.flatMap(p =>
        p.lines.flatMap(l => l.words)
      )
    ) ?? []
    const symbols = words.flatMap(w => w.symbols)
    const digitSymbols = symbols.filter(s => /^\d$/.test(s.text))
    const confidence = digitSymbols.length > 0
      ? Math.min(...digitSymbols.map(s => s.confidence))
      : data.confidence
    const skipped = confidence < MIN_CONFIDENCE

    if (this.lastDebugImages) {
      this.lastDebugImages.ocrResult = {
        text: trimmed,
        pageConfidence: data.confidence,
        digitConfidence: confidence,
        symbols: symbols.map(s => ({ text: s.text, confidence: s.confidence })),
        skipped,
      }
    }

    console.log(`[OCR] raw="${trimmed}" pageConf=${data.confidence} digitConf=${confidence} size=${final_.width}x${final_.height}`)

    if (skipped) {
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
