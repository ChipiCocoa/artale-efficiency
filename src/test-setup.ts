import '@testing-library/jest-dom/vitest'

// Polyfill ImageData for jsdom (not provided by default)
if (typeof globalThis.ImageData === 'undefined') {
  class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number

    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = height ?? (dataOrWidth.length / 4 / widthOrHeight)
      } else {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4)
      }
    }
  }
  globalThis.ImageData = ImageData as unknown as typeof globalThis.ImageData
}
