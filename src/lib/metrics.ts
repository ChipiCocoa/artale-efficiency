import type { ExpReading, ExpMetrics } from '../types'

const TEN_MINUTES_MS = 10 * 60_000
const ONE_HOUR_MS = 60 * 60_000

export function computeMetrics(readings: ExpReading[]): ExpMetrics {
  if (readings.length === 0) {
    return {
      currentExp: 0,
      currentPercentage: 0,
      expPer10Min: 0,
      expPerHour: 0,
      timeToLevelMs: null,
      sessionDurationMs: 0,
      sessionExpGained: 0,
      isExpPer10MinEstimated: true,
      isExpPerHourEstimated: true,
    }
  }

  const first = readings[0]
  const latest = readings[readings.length - 1]
  const elapsedMs = latest.timestamp - first.timestamp
  const sessionExpGained = latest.rawExp - first.rawExp

  // Rate calculation
  let expPerHour = 0
  let expPer10Min = 0

  if (elapsedMs > 0) {
    const expPerMs = sessionExpGained / elapsedMs
    expPerHour = expPerMs * ONE_HOUR_MS
    expPer10Min = expPerMs * TEN_MINUTES_MS
  }

  // Estimated vs actual
  const isExpPer10MinEstimated = elapsedMs < TEN_MINUTES_MS
  const isExpPerHourEstimated = elapsedMs < ONE_HOUR_MS

  // Time to level: estimate based on percentage remaining
  let timeToLevelMs: number | null = null
  if (expPerHour > 0 && latest.percentage < 100) {
    const percentRemaining = 100 - latest.percentage
    const percentGained = latest.percentage - first.percentage

    if (percentGained > 0) {
      const msPerPercent = elapsedMs / percentGained
      timeToLevelMs = percentRemaining * msPerPercent
    } else if (sessionExpGained > 0 && latest.percentage > 0) {
      // Fallback: estimate using raw EXP and current percentage
      const estimatedTotalLevelExp = latest.rawExp / (latest.percentage / 100)
      const expRemaining = estimatedTotalLevelExp - latest.rawExp
      const expPerMs = sessionExpGained / elapsedMs
      timeToLevelMs = expRemaining / expPerMs
    }
  }

  return {
    currentExp: latest.rawExp,
    currentPercentage: latest.percentage,
    expPer10Min: Math.round(expPer10Min),
    expPerHour: Math.round(expPerHour),
    timeToLevelMs,
    sessionDurationMs: elapsedMs,
    sessionExpGained,
    isExpPer10MinEstimated,
    isExpPerHourEstimated,
  }
}
