import { useRef, useState, useCallback, useEffect } from 'react'
import type { CropRegion } from '../types'
import { ScreenCapture } from '../lib/screen-capture'
import './CropSelector.css'

interface CropSelectorProps {
  capture: ScreenCapture
  currentRegion: CropRegion | null
  onRegionSelected: (region: CropRegion) => void
  onClose: () => void
}

export function CropSelector({ capture, currentRegion, onRegionSelected, onClose }: CropSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)

  // Draw preview frame
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const frame = capture.getPreviewFrame()
    if (!frame) return

    const maxWidth = 800
    const s = Math.min(1, maxWidth / frame.width)
    setScale(s)

    canvas.width = frame.width * s
    canvas.height = frame.height * s
    const ctx = canvas.getContext('2d')!
    const tempCanvas = new OffscreenCanvas(frame.width, frame.height)
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.putImageData(frame, 0, 0)
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height)

    if (currentRegion) {
      ctx.strokeStyle = '#4a6cf7'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(
        currentRegion.x * s,
        currentRegion.y * s,
        currentRegion.width * s,
        currentRegion.height * s,
      )
    }
  }, [capture, currentRegion])

  const getCanvasPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    }
  }, [scale])

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e)
    setStartPos(pos)
    setCurrentPos(pos)
    setDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    const pos = getCanvasPos(e)
    setCurrentPos(pos)

    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const frame = capture.getPreviewFrame()
    if (!frame) return

    const tempCanvas = new OffscreenCanvas(frame.width, frame.height)
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.putImageData(frame, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = '#4a6cf7'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(74, 108, 247, 0.15)'
    const rx = Math.min(startPos.x, pos.x) * scale
    const ry = Math.min(startPos.y, pos.y) * scale
    const rw = Math.abs(pos.x - startPos.x) * scale
    const rh = Math.abs(pos.y - startPos.y) * scale
    ctx.fillRect(rx, ry, rw, rh)
    ctx.strokeRect(rx, ry, rw, rh)
  }

  const handleMouseUp = () => {
    if (!dragging) return
    setDragging(false)

    const region: CropRegion = {
      x: Math.round(Math.min(startPos.x, currentPos.x)),
      y: Math.round(Math.min(startPos.y, currentPos.y)),
      width: Math.round(Math.abs(currentPos.x - startPos.x)),
      height: Math.round(Math.abs(currentPos.y - startPos.y)),
    }

    if (region.width > 10 && region.height > 5) {
      onRegionSelected(region)
    }
  }

  return (
    <div className="crop-overlay">
      <div className="crop-modal">
        <h3>Select EXP Bar Region</h3>
        <p>Drag a rectangle over the EXP bar area to improve OCR accuracy.</p>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="crop-canvas"
        />
        <div className="crop-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          {currentRegion && (
            <button onClick={() => onRegionSelected(currentRegion)} className="btn-primary">
              Keep Current
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
