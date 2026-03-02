import { describe, it, expect } from 'vitest'
import { computeMetrics } from './metrics'
import type { ExpReading } from '../types'

function makeReadings(data: Array<{ minutesAgo: number; rawExp: number; percentage: number }>): ExpReading[] {
  const now = Date.now()
  return data.map(d => ({
    timestamp: now - d.minutesAgo * 60_000,
    rawExp: d.rawExp,
    percentage: d.percentage,
  }))
}

describe('computeMetrics', () => {
  it('returns zeroed metrics with no readings', () => {
    const m = computeMetrics([])
    expect(m.currentExp).toBe(0)
    expect(m.expPerHour).toBe(0)
    expect(m.timeToLevelMs).toBeNull()
  })

  it('returns current values with a single reading', () => {
    const readings = makeReadings([{ minutesAgo: 0, rawExp: 1000, percentage: 50 }])
    const m = computeMetrics(readings)
    expect(m.currentExp).toBe(1000)
    expect(m.currentPercentage).toBe(50)
    expect(m.expPerHour).toBe(0)
    expect(m.sessionExpGained).toBe(0)
  })

  it('computes EXP/hour from two readings 5 minutes apart (estimated)', () => {
    const readings = makeReadings([
      { minutesAgo: 5, rawExp: 1000, percentage: 10 },
      { minutesAgo: 0, rawExp: 2000, percentage: 20 },
    ])
    const m = computeMetrics(readings)
    // 1000 exp in 5 min = 12000/hr
    expect(m.expPerHour).toBe(12000)
    expect(m.isExpPerHourEstimated).toBe(true)
    expect(m.isExpPer10MinEstimated).toBe(true)
  })

  it('marks EXP/10min as actual after 10+ minutes', () => {
    const readings = makeReadings([
      { minutesAgo: 12, rawExp: 1000, percentage: 10 },
      { minutesAgo: 0, rawExp: 3400, percentage: 34 },
    ])
    const m = computeMetrics(readings)
    expect(m.isExpPer10MinEstimated).toBe(false)
    expect(m.isExpPerHourEstimated).toBe(true)
  })

  it('marks EXP/hour as actual after 60+ minutes', () => {
    const readings = makeReadings([
      { minutesAgo: 65, rawExp: 1000, percentage: 10 },
      { minutesAgo: 0, rawExp: 14000, percentage: 50 },
    ])
    const m = computeMetrics(readings)
    expect(m.isExpPer10MinEstimated).toBe(false)
    expect(m.isExpPerHourEstimated).toBe(false)
  })

  it('computes time to level', () => {
    const readings = makeReadings([
      { minutesAgo: 10, rawExp: 1000, percentage: 10 },
      { minutesAgo: 0, rawExp: 2000, percentage: 20 },
    ])
    const m = computeMetrics(readings)
    // rate: 1000 per 10 min. At 20%, need 80% more.
    // If 10% = 1000 exp, then 100% = 10000 exp total for level.
    // Need 80% = 8000 exp. Rate = 6000/hr.
    // Time = 8000 / 6000 * 3600000 ms = 4800000 ms = 80 min
    expect(m.timeToLevelMs).toBeCloseTo(80 * 60_000, -3)
  })

  it('computes session duration and session exp gained', () => {
    const readings = makeReadings([
      { minutesAgo: 30, rawExp: 5000, percentage: 10 },
      { minutesAgo: 15, rawExp: 7000, percentage: 20 },
      { minutesAgo: 0, rawExp: 9000, percentage: 30 },
    ])
    const m = computeMetrics(readings)
    expect(m.sessionDurationMs).toBeCloseTo(30 * 60_000, -3)
    expect(m.sessionExpGained).toBe(4000)
  })

  it('handles EXP decrease (death penalty) gracefully', () => {
    const readings = makeReadings([
      { minutesAgo: 10, rawExp: 5000, percentage: 50 },
      { minutesAgo: 5, rawExp: 4500, percentage: 45 },
      { minutesAgo: 0, rawExp: 5500, percentage: 55 },
    ])
    const m = computeMetrics(readings)
    // Net gain: 500 in 10 min = 3000/hr
    expect(m.expPerHour).toBeCloseTo(3000, -1)
    expect(m.sessionExpGained).toBe(500)
  })
})
