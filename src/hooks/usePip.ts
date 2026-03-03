import { useState, useCallback } from 'react'

export function usePip() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)

  const isSupported = 'documentPictureInPicture' in window

  const openPip = useCallback(async () => {
    if (!isSupported) return

    // @ts-expect-error — Document PiP API types not yet in TS lib
    const pip = await window.documentPictureInPicture.requestWindow({
      width: 320,
      height: 340,
    })

    // Copy stylesheets to PiP window
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.href) {
          const link = pip.document.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href
          pip.document.head.appendChild(link)
        } else if (sheet.cssRules) {
          const style = pip.document.createElement('style')
          for (const rule of sheet.cssRules) {
            style.textContent += rule.cssText + '\n'
          }
          pip.document.head.appendChild(style)
        }
      } catch { /* cross-origin stylesheets */ }
    }

    pip.addEventListener('pagehide', () => {
      setPipWindow(null)
    })

    setPipWindow(pip)
  }, [isSupported])

  const closePip = useCallback(() => {
    pipWindow?.close()
    setPipWindow(null)
  }, [pipWindow])

  return {
    isSupported,
    isOpen: pipWindow !== null,
    pipWindow,
    openPip,
    closePip,
  }
}
