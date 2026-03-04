import type { ExpReading, ExpMetrics } from '../types'

const TEN_MINUTES_MS = 10 * 60_000
const ONE_HOUR_MS = 60 * 60_000

// Find the reading closest to (but not after) a target timestamp using binary search
function findReadingAt(readings: ExpReading[], targetTimestamp: number): ExpReading {
  let lo = 0, hi = readings.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (readings[mid].timestamp <= targetTimestamp) lo = mid
    else hi = mid - 1
  }
  return readings[lo]
}

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

  // Estimated vs actual
  const isExpPer10MinEstimated = elapsedMs < TEN_MINUTES_MS
  const isExpPerHourEstimated = elapsedMs < ONE_HOUR_MS

  // EXP/10min: use sliding window if enough data, otherwise extrapolate from all data
  let expPer10Min = 0
  if (elapsedMs > 0) {
    if (!isExpPer10MinEstimated) {
      // Actual: EXP gained in the last 10 minutes
      const windowStart = findReadingAt(readings, latest.timestamp - TEN_MINUTES_MS)
      expPer10Min = latest.rawExp - windowStart.rawExp
    } else {
      // Estimated: extrapolate from available data
      expPer10Min = (sessionExpGained / elapsedMs) * TEN_MINUTES_MS
    }
  }

  // EXP/hour: use sliding window if enough data, otherwise extrapolate
  let expPerHour = 0
  if (elapsedMs > 0) {
    if (!isExpPerHourEstimated) {
      // Actual: EXP gained in the last 60 minutes
      const windowStart = findReadingAt(readings, latest.timestamp - ONE_HOUR_MS)
      expPerHour = latest.rawExp - windowStart.rawExp
    } else {
      // Estimated: extrapolate from available data
      expPerHour = (sessionExpGained / elapsedMs) * ONE_HOUR_MS
    }
  }

  // Time to level: use the most accurate rate available
  let timeToLevelMs: number | null = null
  const ratePerMs = expPerHour / ONE_HOUR_MS
  if (ratePerMs > 0 && latest.percentage < 100) {
    const percentRemaining = 100 - latest.percentage

    // Use percentage-based calculation from the rate window
    const rateWindowMs = isExpPerHourEstimated ? elapsedMs : ONE_HOUR_MS
    const rateWindowStart = findReadingAt(readings, latest.timestamp - rateWindowMs)
    const percentGained = latest.percentage - rateWindowStart.percentage

    if (percentGained > 0) {
      const msPerPercent = rateWindowMs / percentGained
      timeToLevelMs = percentRemaining * msPerPercent
    } else if (latest.percentage > 0) {
      // Fallback: estimate using raw EXP and current percentage
      const estimatedTotalLevelExp = latest.rawExp / (latest.percentage / 100)
      const expRemaining = estimatedTotalLevelExp - latest.rawExp
      timeToLevelMs = expRemaining / ratePerMs
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
