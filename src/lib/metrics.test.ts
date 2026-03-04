import { describe, it, expect } from 'vitest'
import { computeMetrics } from './metrics'
import type { ExpReading } from '../types'

function makeReadings(data: Array<{ minutesAgo: number; cumulativeExp: number; percentage: number }>): ExpReading[] {
  const now = Date.now()
  return data.map(d => ({
    timestamp: now - d.minutesAgo * 60_000,
    cumulativeExp: d.cumulativeExp,
    displayExp: d.cumulativeExp,
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
    const readings = makeReadings([{ minutesAgo: 0, cumulativeExp: 1000, percentage: 50 }])
    const m = computeMetrics(readings)
    expect(m.currentExp).toBe(1000)
    expect(m.currentPercentage).toBe(50)
    expect(m.expPerHour).toBe(0)
    expect(m.sessionExpGained).toBe(0)
  })

  it('computes estimated EXP/hour from two readings 5 minutes apart', () => {
    const readings = makeReadings([
      { minutesAgo: 5, cumulativeExp: 1000, percentage: 10 },
      { minutesAgo: 0, cumulativeExp: 2000, percentage: 20 },
    ])
    const m = computeMetrics(readings)
    // Estimated: 1000 exp in 5 min extrapolated = 12000/hr, 2000/10min
    expect(m.expPerHour).toBe(12000)
    expect(m.expPer10Min).toBe(2000)
    expect(m.isExpPerHourEstimated).toBe(true)
    expect(m.isExpPer10MinEstimated).toBe(true)
  })

  it('uses sliding window for EXP/10min after 10+ minutes', () => {
    // Rate changes: slow first 10 min, fast last 2 min
    const readings = makeReadings([
      { minutesAgo: 12, cumulativeExp: 1000, percentage: 10 },
      { minutesAgo: 10, cumulativeExp: 1200, percentage: 12 }, // 10 min ago
      { minutesAgo: 2, cumulativeExp: 1800, percentage: 18 },
      { minutesAgo: 0, cumulativeExp: 3400, percentage: 34 },
    ])
    const m = computeMetrics(readings)
    // EXP/10min should be actual last 10 min: 3400 - 1200 = 2200
    expect(m.expPer10Min).toBe(2200)
    expect(m.isExpPer10MinEstimated).toBe(false)
    expect(m.isExpPerHourEstimated).toBe(true)
  })

  it('uses sliding window for EXP/hour after 60+ minutes', () => {
    const readings = makeReadings([
      { minutesAgo: 65, cumulativeExp: 1000, percentage: 10 },
      { minutesAgo: 60, cumulativeExp: 2000, percentage: 15 }, // 60 min ago
      { minutesAgo: 30, cumulativeExp: 8000, percentage: 30 },
      { minutesAgo: 0, cumulativeExp: 14000, percentage: 50 },
    ])
    const m = computeMetrics(readings)
    // EXP/hour should be actual last 60 min: 14000 - 2000 = 12000
    expect(m.expPerHour).toBe(12000)
    expect(m.isExpPer10MinEstimated).toBe(false)
    expect(m.isExpPerHourEstimated).toBe(false)
  })

  it('computes time to level', () => {
    const readings = makeReadings([
      { minutesAgo: 10, cumulativeExp: 1000, percentage: 10 },
      { minutesAgo: 0, cumulativeExp: 2000, percentage: 20 },
    ])
    const m = computeMetrics(readings)
    // 10% gained in 10 min, 80% remaining → 80 min
    expect(m.timeToLevelMs).toBeCloseTo(80 * 60_000, -3)
  })

  it('computes session duration and session exp gained', () => {
    const readings = makeReadings([
      { minutesAgo: 30, cumulativeExp: 5000, percentage: 10 },
      { minutesAgo: 15, cumulativeExp: 7000, percentage: 20 },
      { minutesAgo: 0, cumulativeExp: 9000, percentage: 30 },
    ])
    const m = computeMetrics(readings)
    expect(m.sessionDurationMs).toBeCloseTo(30 * 60_000, -3)
    expect(m.sessionExpGained).toBe(4000)
  })

  it('uses sessionStartTime/sessionStartExp when readings buffer overflows', () => {
    const now = Date.now()
    // Simulate: session started 90 min ago, but readings buffer only has last 30 min
    const sessionStartTime = now - 90 * 60_000
    const sessionStartExp = 1000
    const readings = makeReadings([
      { minutesAgo: 30, cumulativeExp: 7000, percentage: 40 },
      { minutesAgo: 15, cumulativeExp: 9000, percentage: 50 },
      { minutesAgo: 0, cumulativeExp: 11000, percentage: 60 },
    ])
    const m = computeMetrics(readings, sessionStartTime, sessionStartExp)
    // Session duration should be 90 min, not 30 min
    expect(m.sessionDurationMs).toBeCloseTo(90 * 60_000, -3)
    // Session EXP gained should be 11000 - 1000 = 10000, not 11000 - 7000 = 4000
    expect(m.sessionExpGained).toBe(10000)
  })

  it('handles EXP decrease (death penalty) gracefully', () => {
    const readings = makeReadings([
      { minutesAgo: 10, cumulativeExp: 5000, percentage: 50 },
      { minutesAgo: 5, cumulativeExp: 4500, percentage: 45 },
      { minutesAgo: 0, cumulativeExp: 5500, percentage: 55 },
    ])
    const m = computeMetrics(readings)
    // Estimated: net 500 in 10 min → 3000/hr
    expect(m.expPerHour).toBeCloseTo(3000, -1)
    expect(m.sessionExpGained).toBe(500)
  })
})
