import type { CropRegion } from '../types'
import type { ScreenCapture } from '../lib/screen-capture'

interface CropSelectorProps {
  capture: ScreenCapture
  currentRegion: CropRegion | null
  onRegionSelected: (region: CropRegion) => void
  onClose: () => void
}

// Stub component — will be implemented in Task 11
export function CropSelector({ capture: _capture, currentRegion: _currentRegion, onRegionSelected: _onRegionSelected, onClose: _onClose }: CropSelectorProps) {
  return null
}
