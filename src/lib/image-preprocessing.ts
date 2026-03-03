export function toGrayscale(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data)
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
    // alpha unchanged
  }
  return new ImageData(data, imageData.width, imageData.height)
}

export function enhanceContrast(imageData: ImageData, factor: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(factor * (data[i] - 128) + 128)
    data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128)
    data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128)
  }
  return new ImageData(data, imageData.width, imageData.height)
}

export function threshold(imageData: ImageData, cutoff: number = 128): ImageData {
  const data = new Uint8ClampedArray(imageData.data)
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] >= cutoff ? 255 : 0
    data[i] = val
    data[i + 1] = val
    data[i + 2] = val
  }
  return new ImageData(data, imageData.width, imageData.height)
}

export function invert(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]
    data[i + 1] = 255 - data[i + 1]
    data[i + 2] = 255 - data[i + 2]
  }
  return new ImageData(data, imageData.width, imageData.height)
}

let _srcCanvas: OffscreenCanvas | null = null
let _dstCanvas: OffscreenCanvas | null = null

export function upscale(imageData: ImageData, factor: number): ImageData {
  const sw = imageData.width
  const sh = imageData.height
  const dw = Math.round(sw * factor)
  const dh = Math.round(sh * factor)

  if (!_srcCanvas || _srcCanvas.width !== sw || _srcCanvas.height !== sh) {
    _srcCanvas = new OffscreenCanvas(sw, sh)
  }
  const srcCtx = _srcCanvas.getContext('2d')!
  srcCtx.putImageData(imageData, 0, 0)

  if (!_dstCanvas || _dstCanvas.width !== dw || _dstCanvas.height !== dh) {
    _dstCanvas = new OffscreenCanvas(dw, dh)
  }
  const dstCtx = _dstCanvas.getContext('2d')!
  dstCtx.imageSmoothingEnabled = true
  dstCtx.imageSmoothingQuality = 'high'
  dstCtx.drawImage(_srcCanvas, 0, 0, dw, dh)
  return dstCtx.getImageData(0, 0, dw, dh)
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
