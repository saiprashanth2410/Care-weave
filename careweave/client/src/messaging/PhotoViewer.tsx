import { useEffect } from 'react'
import './messaging.css'

/** Shows one photo full size over the page. Click outside it, press Escape, or use Close. */
export default function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="mg-viewer" role="dialog" aria-label="Photo" onClick={onClose}>
      <button type="button" className="mg-viewer-close" onClick={onClose}>Close</button>
      <img src={src} alt="Shared photo, full size" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
