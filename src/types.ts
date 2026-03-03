export interface ExpReading {
  timestamp: number    // Date.now()
  rawExp: number       // e.g. 3109353
  percentage: number   // e.g. 30.87
}

export interface ExpMetrics {
  currentExp: number
  currentPercentage: number
  expPer10Min: number
  expPerHour: number
  timeToLevelMs: number | null  // null if rate is 0
  sessionDurationMs: number
  sessionExpGained: number
  isExpPer10MinEstimated: boolean
  isExpPerHourEstimated: boolean
}

export interface CropRegion {
  x: number
  y: number
  width: number
  height: number
}

export type SampleInterval = 0.5 | 1 | 2 | 3 | 5 | 10 | 30 | 60

export interface Settings {
  sampleInterval: SampleInterval
  cropRegion: CropRegion | null
}
