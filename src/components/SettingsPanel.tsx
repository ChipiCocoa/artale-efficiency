import { useTranslation } from 'react-i18next'
import type { Settings, SampleInterval } from '../types'
import './SettingsPanel.css'

interface SettingsPanelProps {
  settings: Settings
  onSettingsChange: (settings: Settings) => void
  onSetCropRegion: () => void
  onClose: () => void
}

const INTERVAL_OPTIONS: SampleInterval[] = [0.5, 1, 2, 3, 5]

function setLangParam(lang: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('lang', lang)
  window.history.replaceState(null, '', url.toString())
}

export function SettingsPanel({ settings, onSettingsChange, onSetCropRegion, onClose }: SettingsPanelProps) {
  const { t, i18n } = useTranslation()

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <h3>{t('settings.title')}</h3>

        <div className="setting-group">
          <label>{t('settings.sampleInterval')}</label>
          <div className="interval-options">
            {INTERVAL_OPTIONS.map(seconds => (
              <button
                key={seconds}
                className={`interval-btn ${settings.sampleInterval === seconds ? 'active' : ''}`}
                onClick={() => onSettingsChange({ ...settings, sampleInterval: seconds })}
              >
                {seconds >= 1 ? t('settings.intervalSeconds', { value: seconds }) : t('settings.intervalMs', { value: seconds * 1000 })}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-group">
          <label>{t('settings.language')}</label>
          <div className="interval-options">
            <button
              className={`interval-btn ${i18n.language === 'en' ? 'active' : ''}`}
              onClick={() => { i18n.changeLanguage('en'); setLangParam('en') }}
            >
              English
            </button>
            <button
              className={`interval-btn ${i18n.language === 'zh-TW' ? 'active' : ''}`}
              onClick={() => { i18n.changeLanguage('zh-TW'); setLangParam('zh-TW') }}
            >
              繁體中文
            </button>
            <button
              className={`interval-btn ${i18n.language === 'zh-CN' ? 'active' : ''}`}
              onClick={() => { i18n.changeLanguage('zh-CN'); setLangParam('zh-CN') }}
            >
              简体中文
            </button>
          </div>
        </div>

        <div className="setting-group">
          <label>{t('settings.cropRegion')}</label>
          <p className="setting-desc">
            {settings.cropRegion
              ? t('settings.cropDesc', { width: settings.cropRegion.width, height: settings.cropRegion.height, x: settings.cropRegion.x, y: settings.cropRegion.y })
              : t('settings.cropNotSet')}
          </p>
          <div className="crop-buttons">
            <button className="btn-secondary" onClick={onSetCropRegion}>
              {settings.cropRegion ? t('settings.changeRegion') : t('settings.setRegion')}
            </button>
            {settings.cropRegion && (
              <button
                className="btn-secondary"
                onClick={() => onSettingsChange({ ...settings, cropRegion: null })}
              >
                {t('settings.clear')}
              </button>
            )}
          </div>
        </div>

        <button className="btn-primary settings-close" onClick={onClose}>{t('settings.done')}</button>
      </div>
    </div>
  )
}
