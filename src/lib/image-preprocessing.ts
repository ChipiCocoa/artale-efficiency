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

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
