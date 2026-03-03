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

const CANVAS_W = 800
const CANVAS_H = 500

export function CropSelector({ capture, currentRegion, onRegionSelected, onClose }: CropSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<OffscreenCanvas | null>(null)

  // Viewport: which portion of the source image is visible
  const [zoom, setZoom] = useState(1) // screen pixels per source pixel
  const [viewX, setViewX] = useState(0) // source image top-left X
  const [viewY, setViewY] = useState(0) // source image top-left Y
  const [srcW, setSrcW] = useState(0)
  const [srcH, setSrcH] = useState(0)

  // Interaction state
  const [mode, setMode] = useState<'idle' | 'drawing' | 'panning'>('idle')
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 })
  const [, setDrawEnd] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [panViewStart, setPanViewStart] = useState({ x: 0, y: 0 })
  const [selection, setSelection] = useState<CropRegion | null>(null)

  // Convert screen coords to source image coords
  const toSrc = useCallback((screenX: number, screenY: number) => ({
    x: viewX + screenX / zoom,
    y: viewY + screenY / zoom,
  }), [viewX, viewY, zoom])

  // Load the preview frame once
  useEffect(() => {
    const frame = capture.getPreviewFrame()
    if (!frame) return

    setSrcW(frame.width)
    setSrcH(frame.height)

    // Fit image to canvas
    const fitZoom = Math.min(CANVAS_W / frame.width, CANVAS_H / frame.height)
    setZoom(fitZoom)
    setViewX(0)
    setViewY(0)

    // Cache frame as OffscreenCanvas for fast redraws
    const oc = new OffscreenCanvas(frame.width, frame.height)
    const ctx = oc.getContext('2d')!
    ctx.putImageData(frame, 0, 0)
    frameRef.current = oc
  }, [capture])

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const frameSrc = frameRef.current
    if (!canvas || !frameSrc) return

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // Draw the visible portion of the source image
    const visibleW = CANVAS_W / zoom
    const visibleH = CANVAS_H / zoom
    ctx.drawImage(
      frameSrc,
      viewX, viewY, visibleW, visibleH,
      0, 0, CANVAS_W, CANVAS_H,
    )

    // Draw existing region
    if (currentRegion && !selection) {
      ctx.strokeStyle = '#4a6cf7'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(
        (currentRegion.x - viewX) * zoom,
        (currentRegion.y - viewY) * zoom,
        currentRegion.width * zoom,
        currentRegion.height * zoom,
      )
      ctx.setLineDash([])
    }

    // Draw current selection
    if (selection) {
      ctx.strokeStyle = '#4a6cf7'
      ctx.lineWidth = 2
      ctx.fillStyle = 'rgba(74, 108, 247, 0.2)'
      const rx = (selection.x - viewX) * zoom
      const ry = (selection.y - viewY) * zoom
      const rw = selection.width * zoom
      const rh = selection.height * zoom
      ctx.fillRect(rx, ry, rw, rh)
      ctx.strokeRect(rx, ry, rw, rh)
    }
  }, [viewX, viewY, zoom, currentRegion, selection])

  useEffect(() => { redraw() }, [redraw])

  // Scroll to zoom (centered on cursor)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Source point under cursor before zoom
    const srcPoint = toSrc(screenX, screenY)

    const zoomFactor = e.deltaY < 0 ? 1.2 : 1 / 1.2
    const fitZoom = Math.min(CANVAS_W / srcW, CANVAS_H / srcH)
    const maxZoom = fitZoom * 20
    const newZoom = Math.max(fitZoom, Math.min(maxZoom, zoom * zoomFactor))

    // Adjust view so the source point stays under cursor
    const newViewX = srcPoint.x - screenX / newZoom
    const newViewY = srcPoint.y - screenY / newZoom

    setZoom(newZoom)
    setViewX(Math.max(0, Math.min(srcW - CANVAS_W / newZoom, newViewX)))
    setViewY(Math.max(0, Math.min(srcH - CANVAS_H / newZoom, newViewY)))
  }, [zoom, toSrc, srcW, srcH])

  const getScreenPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const screen = getScreenPos(e)

    // Right-click or middle-click = pan
    if (e.button === 1 || e.button === 2) {
      e.preventDefault()
      setMode('panning')
      setPanStart(screen)
      setPanViewStart({ x: viewX, y: viewY })
      return
    }

    // Left click = draw selection
    const src = toSrc(screen.x, screen.y)
    setMode('drawing')
    setDrawStart(src)
    setDrawEnd(src)
    setSelection(null)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const screen = getScreenPos(e)

    if (mode === 'panning') {
      const dx = (screen.x - panStart.x) / zoom
      const dy = (screen.y - panStart.y) / zoom
      setViewX(Math.max(0, Math.min(srcW - CANVAS_W / zoom, panViewStart.x - dx)))
      setViewY(Math.max(0, Math.min(srcH - CANVAS_H / zoom, panViewStart.y - dy)))
      return
    }

    if (mode === 'drawing') {
      const src = toSrc(screen.x, screen.y)
      setDrawEnd(src)
      setSelection({
        x: Math.round(Math.min(drawStart.x, src.x)),
        y: Math.round(Math.min(drawStart.y, src.y)),
        width: Math.round(Math.abs(src.x - drawStart.x)),
        height: Math.round(Math.abs(src.y - drawStart.y)),
      })
    }
  }

  const handleMouseUp = () => {
    setMode('idle')
  }

  const handleConfirm = () => {
    if (selection && selection.width > 5 && selection.height > 3) {
      onRegionSelected(selection)
    }
  }

  const zoomPercent = srcW > 0
    ? Math.round(zoom / Math.min(CANVAS_W / srcW, CANVAS_H / srcH) * 100)
    : 100

  return (
    <div className="crop-overlay">
      <div className="crop-modal">
        <h3>Select EXP Number Region</h3>
        <p>
          Scroll to zoom in, then drag to select <strong>just the numbers</strong> (e.g. <code>84837120[60.76%]</code>).
          Right-click drag to pan.
        </p>
        <div className="crop-toolbar">
          <span className="zoom-label">Zoom: {zoomPercent}%</span>
          <button className="btn-small" onClick={() => {
            const fitZoom = Math.min(CANVAS_W / srcW, CANVAS_H / srcH)
            setZoom(fitZoom)
            setViewX(0)
            setViewY(0)
          }}>Fit</button>
        </div>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={e => e.preventDefault()}
          className="crop-canvas"
        />
        <div className="crop-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          {currentRegion && !selection && (
            <button onClick={() => onRegionSelected(currentRegion)} className="btn-primary">
              Keep Current
            </button>
          )}
          {selection && (
            <button onClick={handleConfirm} className="btn-primary">
              Confirm Selection ({selection.width}x{selection.height})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
