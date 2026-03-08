import { useState, useEffect } from 'react'
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
        <h1>Artale EXP Tracker</h1>
        <div className="header-controls">
          <span className={`status-dot status-${status}`} />
          <span className="status-text">{status}</span>
          <button
            className={`btn-toggle ${status === 'tracking' ? 'btn-stop' : 'btn-start'}`}
            onClick={handleToggle}
            disabled={status === 'initializing'}
          >
            {status === 'tracking' ? 'Stop' : 'Start Tracking'}
          </button>
          <button className="btn-settings" onClick={() => setShowSettings(true)}>
            Settings
          </button>
          {pip.isSupported && (
            <button
              className="btn-toggle btn-start"
              onClick={pip.isOpen ? pip.closePip : pip.openPip}
            >
              {pip.isOpen ? 'Close Overlay' : 'Pop Out'}
            </button>
          )}
          {ocrFailures >= 3 && (
            <span className="ocr-warning" title="Multiple OCR failures — check your crop region">
              OCR issues ({ocrFailures})
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
          {showDebug ? 'Hide' : 'Show'} OCR Debug
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
        Made by <a href="https://github.com/ChipiCocoa" target="_blank" rel="noopener noreferrer">ChipiCocoa</a>
        {' · '}
        <a href="https://github.com/ChipiCocoa/artale-efficiency" target="_blank" rel="noopener noreferrer">Source Code</a>
      </footer>
    </div>
  )
}

export default App
