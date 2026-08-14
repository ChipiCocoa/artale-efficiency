import { describe, it, expect } from 'vitest'
import en from './locales/en.json'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh-CN.json'

// Must cover every TrackingStatus value — App renders t(`app.status.${status}`)
const STATUSES = ['idle', 'initializing', 'tracking', 'error'] as const

describe.each([
  ['en', en],
  ['zh-TW', zhTW],
  ['zh-CN', zhCN],
])('%s locale', (_name, locale) => {
  it.each(STATUSES)('translates app.status.%s', (status) => {
    expect((locale as Record<string, string>)[`app.status.${status}`]).toBeTruthy()
  })
})
