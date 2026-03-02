import { describe, it, expect } from 'vitest'
import { toGrayscale, enhanceContrast } from './image-preprocessing'

describe('toGrayscale', () => {
  it('converts color pixels to grayscale', () => {
    // 1x1 pixel: R=100, G=150, B=200, A=255
    const data = new Uint8ClampedArray([100, 150, 200, 255])
    const imageData = new ImageData(data, 1, 1)
    const result = toGrayscale(imageData)
    // Luminance = 0.299*100 + 0.587*150 + 0.114*200 = 29.9 + 88.05 + 22.8 = 140.75 ~ 141
    const gray = result.data[0]
    expect(gray).toBeGreaterThanOrEqual(139)
    expect(gray).toBeLessThanOrEqual(142)
    expect(result.data[0]).toBe(result.data[1])
    expect(result.data[1]).toBe(result.data[2])
    expect(result.data[3]).toBe(255) // alpha unchanged
  })
})

describe('enhanceContrast', () => {
  it('increases difference between light and dark pixels', () => {
    // 2 pixels: one dark (50,50,50), one light (200,200,200)
    const data = new Uint8ClampedArray([50, 50, 50, 255, 200, 200, 200, 255])
    const imageData = new ImageData(data, 2, 1)
    const result = enhanceContrast(imageData, 1.5)
    // Dark should get darker, light should get lighter
    expect(result.data[0]).toBeLessThan(50)
    expect(result.data[4]).toBeGreaterThan(200)
  })
})
