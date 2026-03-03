import type { Settings } from '../types'

const STORAGE_KEY = 'artale-settings'

export const DEFAULT_SETTINGS: Settings = {
  sampleInterval: 1,
  cropRegion: null,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return JSON.parse(raw) as Settings
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
