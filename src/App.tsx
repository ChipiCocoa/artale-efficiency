import { useState, useEffect } from 'react'
import { useTracker } from './hooks/useTracker'
import { Dashboard } from './components/Dashboard'
import { loadSettings, saveSettings } from './lib/settings'
import type { Settings } from './types'
import './App.css'

function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const { readings, metrics, status, ocrFailures, startTracking, stopTracking, getCapture } = useTracker(settings)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const handleToggle = () => {
    if (status === 'tracking') {
      stopTracking()
    } else {
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
          {ocrFailures >= 3 && (
            <span className="ocr-warning" title="Multiple OCR failures — check your crop region">
              OCR issues ({ocrFailures})
            </span>
          )}
        </div>
      </header>
      <main>
        <Dashboard metrics={metrics} />
      </main>
    </div>
  )
}

export default App
