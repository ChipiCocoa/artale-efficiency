import type { ExpReading, CropRegion } from '../types.ts'
import type { ParsedExp } from './exp-parser.ts'
import { ScreenCapture } from './screen-capture.ts'
import { OcrService } from './ocr-service.ts'
import type { OcrDebugImages } from './ocr-service.ts'

export type TrackingStatus = 'idle' | 'initializing' | 'tracking' | 'error'

export interface TrackingCallbacks {
  onReading: (reading: ExpReading) => void
  onStatusChange: (status: TrackingStatus) => void
  onOcrFailure: (consecutiveFailures: number) => void
  onDebugImages: (images: OcrDebugImages) => void
  onLevelUp: () => void
  /** Fired when the capture stream ends outside our control (browser "Stop sharing"). */
  onEnded: () => void
}

// The bar shows two decimals and truncates rather than rounds: with a single
// EXP point left it reads 99.99%, not 100%. So the true percentage sits
// somewhere in [shown, shown + 0.01), and taking the middle of that is the
// best estimate available. Dividing by the shown value instead would infer a
// level size that is always too large, never too small.
const PCT_DISPLAY_STEP = 0.01

// Slack multiplier over the computed error bound, for OCR jitter and for a
// remembered level size that was itself inferred from an imperfect reading.
const PCT_TOLERANCE_MARGIN = 2

// A run of this many rejected readings that corroborate each other means the
// baseline is the broken part, not the readings, and tracking resyncs onto them.
// The readings must also show EXP climbing: a baseline that has gone stale is
// still being overtaken by a grinding player, whereas a stuck OCR misread
// repeats the same value and can never satisfy this.
const REJECTIONS_BEFORE_RESYNC = 3

// Dying costs the player up to this many percentage points of the level bar,
// floored at zero. Cumulative EXP is therefore not monotonic, and a drop this
// small that the cross-check vouches for is real progress lost rather than a
// misread. It also sets the floor for a level-up: a wrap moves the bar much
// further than a death can.
const DEATH_PENALTY_PCT = 10

// Each level costs more EXP than the one before, so a wrap must land in a
// bigger level than it left. A misread that shrinks EXP and percentage by the
// same factor leaves the implied size unchanged and is caught by that, which
// nothing else here can distinguish. The size is inferred by dividing by
// percentage, so the comparison is only worth making once the bar has moved
// far enough for that division to mean something: at 0.01% the two-decimal
// display rounds by up to half its own value.
const MIN_PCT_TO_COMPARE_LEVELS = 0.5

// A level-up credits the EXP between the last reading and the level's end,
// which was never observed. Near the top of the bar that gap is small enough to
// stand behind; lower down it means the wrap itself was missed and the gap could
// be anything, so a misread at 4% of a supposedly larger level would be believed
// to the tune of a whole level. Below this, cumulative EXP is carried across
// unchanged, the same discipline a resync follows. Note the figure is a share of
// the bar while the thing it guards is an amount of EXP, and levels differ by
// orders of magnitude in size: at low levels one sample can genuinely cross this
// much of the bar, while at level 170 it stands for tens of millions of EXP.
const MIN_PCT_TO_CREDIT_REMAINDER = 90

// No level costs more than this multiple of the one before it. Real curves grow
// by a few percent, so this is deliberately far looser than anything the game
// does; it exists to give a brand new level an upper bound at all. Without one,
// the bar reading 0.00% says only that the level is bigger than some figure,
// the cross-check has nothing to predict against, and the ratio filter is no
// help either once cumulative EXP is in the hundreds of millions.
const MAX_LEVEL_GROWTH = 2

/**
 * How far a predicted percentage may sit from the displayed one before the pair
 * is called inconsistent. Two things blur the prediction, and only one of them
 * is constant. The display truncates, which costs half a step either way. The
 * level size was itself divided out of a percentage, so its error is
 * proportional to how far up the bar that reading sat: sizing a level from 1%
 * and then predicting 50% carries fifty times the slop of predicting 1%. A
 * single fixed figure is therefore far too loose at the top of the bar, where
 * most readings live, and too tight near the bottom.
 */
function pctToleranceFor(expectedPct: number, levelSizeUncertainty: number): number {
  const fromDisplay = PCT_DISPLAY_STEP / 2
  return PCT_TOLERANCE_MARGIN * (fromDisplay + expectedPct * levelSizeUncertainty)
}

/** Total EXP a level requires, inferred from one reading of the bar. */
function levelMaxFrom(rawExp: number, percentage: number): number {
  return rawExp / ((percentage + PCT_DISPLAY_STEP / 2) / 100)
}

export class TrackingEngine {
  private capture = new ScreenCapture()
  private ocr = new OcrService()
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private intervalMs = 1000
  private running = false
  private consecutiveFailures = 0
  private rejectedRun: ParsedExp[] = []
  private lastPercentage: number | null = null
  private lastCumulativeExp: number | null = null
  private lastRawExp: number | null = null
  private expOffset = 0 // cumulative offset added on each level-up
  // Bounds on the size of the level the player is currently in. Each reading
  // says the size lies in a range, because the percentage it shows stands for
  // an interval rather than a point, and every reading in the same level
  // constrains the same number. Intersecting them narrows the answer far
  // beyond what any single reading can: across one real level a lone reading
  // at 99.99% left a window of roughly 43,000 EXP, while fourteen of them
  // together left 1,194. A level's size never changes while the player is in
  // it, and dying does not cost a level, so these survive a death that empties
  // the bar and are discarded only on a real level-up.
  private levelMaxLo = 0
  private levelMaxHi = Infinity
  private cropRegion: CropRegion | null = null
  private callbacks: TrackingCallbacks

  constructor(callbacks: TrackingCallbacks) {
    this.callbacks = callbacks
  }

  updateCropRegion(cropRegion: CropRegion | null): void {
    this.cropRegion = cropRegion
  }

  setDebugEnabled(enabled: boolean): void {
    this.ocr.debugEnabled = enabled
  }

  async start(intervalSeconds: number, cropRegion: CropRegion | null): Promise<void> {
    this.cropRegion = cropRegion
    this.intervalMs = intervalSeconds * 1000
    this.running = true
    this.callbacks.onStatusChange('initializing')

    try {
      await this.ocr.initialize()
      await this.capture.start()

      this.capture.onEnded(() => {
        this.stop()
        this.callbacks.onStatusChange('idle')
        this.callbacks.onEnded()
      })

      this.callbacks.onStatusChange('tracking')

      // Take first reading, then chain next after completion
      this.sampleLoop()
    } catch (err) {
      // Failed start (e.g. user cancelled the screen picker) must not leak
      // the already-created OCR worker or leave the engine marked running.
      this.stop()
      this.callbacks.onStatusChange('error')
      throw err
    }
  }

  private async sampleLoop(): Promise<void> {
    if (!this.running) return
    const start = Date.now()
    try {
      await this.takeSample()
    } catch (err) {
      // A single failed sample (e.g. transient worker error) must not kill
      // the loop — count it like an OCR misread and keep sampling.
      console.error('[Tracking] sample failed:', err)
      this.consecutiveFailures++
      this.callbacks.onOcrFailure(this.consecutiveFailures)
    }
    if (!this.running) return
    // Schedule next sample: interval minus time spent, minimum 0
    const elapsed = Date.now() - start
    const delay = Math.max(0, this.intervalMs - elapsed)
    this.timeoutId = setTimeout(() => this.sampleLoop(), delay)
  }

  private async takeSample(): Promise<void> {
    const frame = this.capture.captureFrame(this.cropRegion)
    if (!frame) return

    const parsed = await this.ocr.recognizeExp(frame)

    // stop() may have run while OCR was in flight — a late result must not
    // reach the callbacks or it would repopulate an already-cleared session.
    if (!this.running) return

    if (this.ocr.lastDebugImages) {
      this.callbacks.onDebugImages(this.ocr.lastDebugImages)
    }

    if (!parsed) {
      this.consecutiveFailures++
      this.callbacks.onOcrFailure(this.consecutiveFailures)
      return
    }

    // Level-up detection: both EXP and percentage must at least halve, so a
    // misread that moves only one of them is never mistaken for the bar
    // wrapping. The yardstick for EXP is the maximum of the level the player
    // was in, not the last reading within it — after a level-up the bar
    // restarts near the bottom of a new level, and OCR may only recover once
    // the player is some way into it.
    const levelMax = this.currentLevelMax()
    const isLevelUp = levelMax !== null && this.lastPercentage !== null
      && parsed.rawExp < levelMax * 0.5
      && parsed.percentage < this.lastPercentage * 0.5
      && this.lastPercentage - parsed.percentage > DEATH_PENALTY_PCT
      && this.entersALargerLevel(parsed, levelMax)
    if (isLevelUp && this.lastCumulativeExp !== null) {
      // EXP resets per level. Carry the whole level that just finished, not
      // just the part of it that happened to be sampled before the bar wrapped
      // — but only when that unsampled part is small enough to vouch for.
      this.expOffset = this.lastPercentage !== null && this.lastPercentage >= MIN_PCT_TO_CREDIT_REMAINDER
        ? this.completedLevelsExp(this.lastCumulativeExp)
        : this.lastCumulativeExp - parsed.rawExp
      console.log(`[Level Up] offset set to ${this.expOffset}`)
    }
    if (isLevelUp) this.callbacks.onLevelUp()

    let adjustedExp = parsed.rawExp + this.expOffset
    // A resync declares the whole baseline stale, the remembered level size
    // included, so that has to be re-derived from the reading being adopted.
    let resynced = false

    if (!isLevelUp) {
      const failure = this.baselineFailure(parsed, adjustedExp)
      if (failure !== null) {
        if (!this.runCorroboratesResync(parsed)) {
          this.reject(failure, parsed)
          return
        }
        // The baseline is what is wrong, so adopt this reading. Re-anchor the
        // offset in either direction so cumulative EXP is exactly where it was:
        // a resync says the old baseline cannot be trusted, which is no
        // evidence at all about how much EXP was earned. Anchoring only the
        // downward case let a misread that drifts upward in step with real
        // progress be adopted as a gain. Whatever the outage hid, including a
        // level transition, is under-counted rather than guessed at.
        if (this.lastCumulativeExp !== null) {
          this.expOffset += this.lastCumulativeExp - adjustedExp
          adjustedExp = this.lastCumulativeExp
        }
        resynced = true
        console.log(`[OCR] resync onto ${this.rejectedRun.length} corroborating readings: ${adjustedExp} @ ${parsed.percentage}%`)
      } else if (this.lastCumulativeExp !== null && adjustedExp < this.lastCumulativeExp
        && !this.isDeathPenalty(parsed)) {
        // Outside a level-up, EXP falls only when the player dies. The
        // cross-check has already confirmed EXP and percentage fell together,
        // so a drop bigger than a death is a misread and would otherwise reach
        // the metrics as a huge negative rate.
        this.reject(`rejected: ${adjustedExp} falls below ${this.lastCumulativeExp} by more than a death`, parsed)
        return
      }
    }

    this.consecutiveFailures = 0
    this.rejectedRun = []
    this.narrowLevelMax(parsed, isLevelUp ? 'levelUp' : resynced ? 'resync' : 'keep')
    this.lastCumulativeExp = adjustedExp
    this.lastRawExp = parsed.rawExp
    this.lastPercentage = parsed.percentage

    const reading: ExpReading = {
      timestamp: Date.now(),
      cumulativeExp: adjustedExp,
      displayExp: parsed.rawExp,
      percentage: parsed.percentage,
    }
    this.callbacks.onReading(reading)
  }

  /**
   * Validates a reading against the current baseline, returning a description
   * of the first failure or null when it is consistent.
   *
   * The cross-check is authoritative: it compares EXP against percentage, so it
   * can tell a genuine windfall (both jump together, consistently) from a
   * misread (only one of them moves). The ratio filter cannot make that
   * distinction and would reject a large quest reward, so it only stands in
   * when there is no baseline percentage to check against.
   */
  private baselineFailure(parsed: ParsedExp, adjustedExp: number): string | null {
    // A reading also bounds the level's size, and those bounds have to leave
    // room beside what every earlier reading in this level established. Two
    // ranges that cannot both be true is sharper evidence than the cross-check's
    // deliberately slack tolerance, so it is worth checking separately.
    if (this.levelMaxLo > 0 || Number.isFinite(this.levelMaxHi)) {
      const lo = parsed.rawExp / ((parsed.percentage + PCT_DISPLAY_STEP) / 100)
      const hi = parsed.percentage > 0 ? parsed.rawExp / (parsed.percentage / 100) : Infinity
      if (lo > this.levelMaxHi || hi < this.levelMaxLo) {
        return `level size disagrees: reading needs [${lo.toFixed(0)}, ${hi.toFixed(0)}] `
          + `but the level is [${this.levelMaxLo.toFixed(0)}, ${this.levelMaxHi.toFixed(0)}]`
      }
    }

    const levelMax = this.currentLevelMax()
    if (levelMax !== null) {
      // expectedPct predicts the true percentage, while the bar shows a
      // truncated one, so the comparison is made against the middle of the
      // interval the display stands for rather than its floor.
      const expectedPct = (parsed.rawExp / levelMax) * 100
      const diff = Math.abs(expectedPct - (parsed.percentage + PCT_DISPLAY_STEP / 2))
      const tolerance = pctToleranceFor(expectedPct, this.levelMaxUncertainty())
      if (diff > tolerance) {
        return `cross-check failed: expected ${expectedPct.toFixed(3)}% but got ${parsed.percentage}% `
          + `(diff ${diff.toFixed(3)}% > ${tolerance.toFixed(3)}%)`
      }
      return null
    }

    // Only when cumulative EXP is large enough for the ratio to be meaningful.
    // Below 100k, single mob kills can cause huge ratios.
    if (this.lastCumulativeExp !== null && this.lastCumulativeExp > 100_000 && adjustedExp > 0) {
      const ratio = adjustedExp / this.lastCumulativeExp
      if (ratio > 2 || ratio < 0.5) {
        return `outlier filtered: ${adjustedExp} vs prev ${this.lastCumulativeExp} (ratio ${ratio.toFixed(2)})`
      }
    }

    return null
  }

  /**
   * Whether the reading is sized like the next level up rather than the same
   * level seen through a misread. Skipped while the percentage is too small to
   * infer a size from, which is the normal case immediately after a wrap.
   */
  private entersALargerLevel(parsed: ParsedExp, previousLevelMax: number): boolean {
    if (parsed.percentage < MIN_PCT_TO_COMPARE_LEVELS) return true
    return levelMaxFrom(parsed.rawExp, parsed.percentage) > previousLevelMax
  }

  /**
   * Whether a drop is small enough to be the death penalty. Death is the one
   * legitimate way for EXP to fall without a level-up, and it takes at most
   * DEATH_PENALTY_PCT points off the bar. Callers must have cleared the
   * cross-check first: that is what confirms EXP and percentage fell together
   * rather than one of them being misread.
   */
  private isDeathPenalty(parsed: ParsedExp): boolean {
    if (this.lastPercentage === null) return false
    return parsed.percentage >= this.lastPercentage - DEATH_PENALTY_PCT
  }

  /**
   * Whether the run of rejected readings, plus this one, is consistent enough
   * to conclude the baseline has gone stale. Every neighbouring pair must agree
   * about the level size and EXP must climb across the run — a stuck misread
   * repeats one value and never qualifies.
   */
  private runCorroboratesResync(parsed: ParsedExp): boolean {
    const run = [...this.rejectedRun, parsed]
    if (run.length <= REJECTIONS_BEFORE_RESYNC) return false
    for (let i = 1; i < run.length; i++) {
      if (run[i].rawExp <= run[i - 1].rawExp) return false
      if (run[i - 1].percentage <= 0) return false
      const impliedMax = levelMaxFrom(run[i - 1].rawExp, run[i - 1].percentage)
      if (!Number.isFinite(impliedMax)) return false
      const expectedPct = (run[i].rawExp / impliedMax) * 100
      const diff = Math.abs(expectedPct - (run[i].percentage + PCT_DISPLAY_STEP / 2))
      // One reading pins the size only to within half a display step of itself.
      const uncertainty = (PCT_DISPLAY_STEP / 2) / run[i - 1].percentage
      if (diff > pctToleranceFor(expectedPct, uncertainty)) return false
    }
    return true
  }

  /** Discards a reading, keeping it as evidence about the baseline's health. */
  private reject(reason: string, parsed: ParsedExp): void {
    console.log(`[OCR] ${reason}`)
    this.rejectedRun.push(parsed)
    if (this.rejectedRun.length > REJECTIONS_BEFORE_RESYNC) this.rejectedRun.shift()
    this.consecutiveFailures++
    this.callbacks.onOcrFailure(this.consecutiveFailures)
  }

  /** Total EXP the level the last reading belonged to requires. */
  private currentLevelMax(): number | null {
    if (!Number.isFinite(this.levelMaxHi) || this.levelMaxLo <= 0) return null
    return (this.levelMaxLo + this.levelMaxHi) / 2
  }

  /** How far the level size could be off, relative to the midpoint estimate. */
  private levelMaxUncertainty(): number {
    const mid = this.currentLevelMax()
    if (mid === null) return Infinity
    return (this.levelMaxHi - this.levelMaxLo) / 2 / mid
  }

  /**
   * Narrows the level's size with what this reading rules out. A bar reading
   * p% means the true share is in [p, p + one display step), so the size is
   * bounded on both ends. A reading of 0% only sets a lower bound.
   */
  private narrowLevelMax(parsed: ParsedExp, reset: 'keep' | 'levelUp' | 'resync'): void {
    if (reset === 'levelUp') {
      // The next level is bigger than this one and not unboundedly bigger, so
      // what was learned here still says something about where the new one
      // starts. Carrying it over keeps the bar checkable from the first reading
      // of a level, when it reads 0.00% and can otherwise pin nothing.
      this.levelMaxHi = Number.isFinite(this.levelMaxHi) ? this.levelMaxHi * MAX_LEVEL_GROWTH : Infinity
    } else if (reset === 'resync') {
      // A resync says the baseline was wrong, and the level size was part of it.
      this.levelMaxLo = 0
      this.levelMaxHi = Infinity
    }
    if (parsed.rawExp <= 0) return
    const lo = parsed.rawExp / ((parsed.percentage + PCT_DISPLAY_STEP) / 100)
    const hi = parsed.percentage > 0 ? parsed.rawExp / (parsed.percentage / 100) : Infinity
    const nextLo = Math.max(this.levelMaxLo, lo)
    const nextHi = Math.min(this.levelMaxHi, hi)
    // Readings that leave no room between them contradict each other. The
    // cross-check should have caught that already, so rather than carry an
    // impossible range forward, start again from this reading alone.
    if (nextLo > nextHi) {
      this.levelMaxLo = lo
      this.levelMaxHi = hi
      return
    }
    this.levelMaxLo = nextLo
    this.levelMaxHi = nextHi
  }

  /**
   * Total EXP of every level completed so far, used as the offset after a
   * level-up. The last reading before one sits short of the level's end, so its
   * cumulative value alone loses the remainder; add the inferred size of the
   * level that just finished instead. Dividing by percentage is reliable here
   * because a pre-level-up reading is near 100%, where rounding is negligible.
   */
  private completedLevelsExp(lastCumulativeExp: number): number {
    const finishedLevelMax = this.currentLevelMax()
    if (finishedLevelMax === null || this.lastRawExp === null) return lastCumulativeExp
    return (lastCumulativeExp - this.lastRawExp) + Math.round(finishedLevelMax)
  }

  getCapture(): ScreenCapture {
    return this.capture
  }

  isActive(): boolean {
    return this.capture.isActive()
  }

  stop(): void {
    this.running = false
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    this.capture.stop()
    this.ocr.terminate()
    this.consecutiveFailures = 0
    this.rejectedRun = []
    this.lastPercentage = null
    this.lastCumulativeExp = null
    this.lastRawExp = null
    this.expOffset = 0
    this.levelMaxLo = 0
    this.levelMaxHi = Infinity
  }
}
