import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings'

beforeEach(() => {
  localStorage.clear()
})

describe('settings', () => {
  it('returns defaults when nothing is saved', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('saves and loads settings', () => {
    const settings = { sampleInterval: 30 as const, cropRegion: { x: 10, y: 20, width: 200, height: 30 } }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
  })

  it('returns defaults for corrupted data', () => {
    localStorage.setItem('artale-settings', 'not-json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})
