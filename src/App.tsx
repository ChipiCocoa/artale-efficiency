import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTracker } from './hooks/useTracker'
import { usePip } from './hooks/usePip'
import { useDocumentMeta } from './hooks/useDocumentMeta'
import { Dashboard } from './components/Dashboard'
import { ExpChart } from './components/ExpChart'
import { SettingsPanel } from './components/SettingsPanel'
import { CropSelector } from './components/CropSelector'
import { PipOverlay } from './components/PipOverlay'
import { DebugPreview } from './components/DebugPreview'
import { loadSettings, saveSettings } from './lib/settings'
import type { Settings } from './types'
import './App.css'

function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [showCropSelector, setShowCropSelector] = useState(false)
  const { readings, metrics, status, ocrFailures, debugImages, setDebugEnabled, startTracking, stopTracking, getCapture } = useTracker(settings)
  const [showDebug, setShowDebug] = useState(false)
  const pip = usePip()
  const { t } = useTranslation()
  useDocumentMeta()

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // Auto-open crop selector after tracking starts if no crop region set
  const [needsCrop, setNeedsCrop] = useState(false)
  useEffect(() => {
    if (needsCrop && status === 'tracking' && getCapture()) {
      setShowCropSelector(true)
      setNeedsCrop(false)
    }
  }, [needsCrop, status, getCapture])

  const handleToggle = () => {
    if (status === 'tracking') {
      stopTracking()
    } else {
      if (!settings.cropRegion) {
        setNeedsCrop(true)
      }
      startTracking()
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('app.title')}</h1>
        <div className="header-controls">
          <span className={`status-dot status-${status}`} />
          <span className="status-text">{t(`app.status.${status}`)}</span>
          <button
            className={`btn-toggle ${status === 'tracking' ? 'btn-stop' : 'btn-start'}`}
            onClick={handleToggle}
            disabled={status === 'initializing'}
          >
            {status === 'tracking' ? t('app.stop') : t('app.startTracking')}
          </button>
          <button className="btn-settings" onClick={() => setShowSettings(true)}>
            {t('app.settings')}
          </button>
          {pip.isSupported && (
            <button
              className="btn-toggle btn-start"
              onClick={pip.isOpen ? pip.closePip : pip.openPip}
            >
              {pip.isOpen ? t('app.closeOverlay') : t('app.popOut')}
            </button>
          )}
          {ocrFailures >= 3 && (
            <span className="ocr-warning" title={t('app.ocrWarning')}>
              {t('app.ocrIssues', { count: ocrFailures })}
            </span>
          )}
        </div>
      </header>
      <main>
        <Dashboard metrics={metrics} />
        <ExpChart readings={readings} />
        <button
          className="btn-debug-toggle"
          onClick={() => {
            const next = !showDebug
            setShowDebug(next)
            setDebugEnabled(next)
          }}
        >
          {showDebug ? t('app.hide') : t('app.show')} {t('app.ocrDebug')}
        </button>
        {showDebug && debugImages && <DebugPreview images={debugImages} />}
      </main>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          onSetCropRegion={() => {
            setShowSettings(false)
            setShowCropSelector(true)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCropSelector && status === 'tracking' && getCapture() && (
        <CropSelector
          capture={getCapture()!}
          currentRegion={settings.cropRegion}
          onRegionSelected={(region) => {
            setSettings(prev => ({ ...prev, cropRegion: region }))
            setShowCropSelector(false)
          }}
          onClose={() => {
            // If no crop region, stop tracking — crop is mandatory
            if (!settings.cropRegion) {
              stopTracking()
            }
            setShowCropSelector(false)
          }}
        />
      )}

      <PipOverlay metrics={metrics} pipWindow={pip.pipWindow} />

      <footer className="app-footer">
        {t('app.madeBy')} <a href="https://github.com/ChipiCocoa" target="_blank" rel="noopener noreferrer">ChipiCocoa</a>
        {' · '}
        <a href="https://github.com/ChipiCocoa/artale-efficiency" target="_blank" rel="noopener noreferrer">{t('app.sourceCode')}</a>
      </footer>
    </div>
  )
}

export default App
