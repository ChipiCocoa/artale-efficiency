import { describe, it, expect } from 'vitest'
import { parseExpText } from './exp-parser'

describe('parseExpText', () => {
  it('parses standard format "3109353[30.87%]"', () => {
    const result = parseExpText('3109353[30.87%]')
    expect(result).toEqual({ rawExp: 3109353, percentage: 30.87 })
  })

  it('parses large EXP numbers "43125829[30.88%]"', () => {
    const result = parseExpText('43125829[30.88%]')
    expect(result).toEqual({ rawExp: 43125829, percentage: 30.88 })
  })

  it('parses 0% and 100%', () => {
    expect(parseExpText('0[0.00%]')).toEqual({ rawExp: 0, percentage: 0 })
    expect(parseExpText('99999999[100.00%]')).toEqual({ rawExp: 99999999, percentage: 100 })
  })

  it('returns null for garbage text', () => {
    expect(parseExpText('hello world')).toBeNull()
    expect(parseExpText('')).toBeNull()
    expect(parseExpText('abc[def%]')).toBeNull()
  })

  it('handles OCR artifacts (spaces, extra chars around the match)', () => {
    expect(parseExpText(' 3109353[30.87%] ')).toEqual({ rawExp: 3109353, percentage: 30.87 })
    expect(parseExpText('EXP: 3109353[30.87%] Next')).toEqual({ rawExp: 3109353, percentage: 30.87 })
  })

  it('handles space before closing bracket "84837120[60.76% ]"', () => {
    expect(parseExpText('EXP. 84837120[60.76% ]')).toEqual({ rawExp: 84837120, percentage: 60.76 })
    expect(parseExpText('84837120[60.76%  ]')).toEqual({ rawExp: 84837120, percentage: 60.76 })
  })

})
