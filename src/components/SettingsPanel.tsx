import type { Settings, SampleInterval } from '../types'
import './SettingsPanel.css'

interface SettingsPanelProps {
  settings: Settings
  onSettingsChange: (settings: Settings) => void
  onSetCropRegion: () => void
  onClose: () => void
}

const INTERVAL_OPTIONS: SampleInterval[] = [5, 10, 30, 60]

export function SettingsPanel({ settings, onSettingsChange, onSetCropRegion, onClose }: SettingsPanelProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <h3>Settings</h3>

        <div className="setting-group">
          <label>Sample Interval</label>
          <div className="interval-options">
            {INTERVAL_OPTIONS.map(seconds => (
              <button
                key={seconds}
                className={`interval-btn ${settings.sampleInterval === seconds ? 'active' : ''}`}
                onClick={() => onSettingsChange({ ...settings, sampleInterval: seconds })}
              >
                {seconds}s
              </button>
            ))}
          </div>
        </div>

        <div className="setting-group">
          <label>Crop Region</label>
          <p className="setting-desc">
            {settings.cropRegion
              ? `${settings.cropRegion.width}x${settings.cropRegion.height} at (${settings.cropRegion.x}, ${settings.cropRegion.y})`
              : 'Not set — OCR will scan the full screen'}
          </p>
          <div className="crop-buttons">
            <button className="btn-secondary" onClick={onSetCropRegion}>
              {settings.cropRegion ? 'Change Region' : 'Set Region'}
            </button>
            {settings.cropRegion && (
              <button
                className="btn-secondary"
                onClick={() => onSettingsChange({ ...settings, cropRegion: null })}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <button className="btn-primary settings-close" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
