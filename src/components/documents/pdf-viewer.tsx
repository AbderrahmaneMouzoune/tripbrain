'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import { openPdf, type OpenedPdf } from '@/lib/pdf'

/** Safari refuse les canvas de plus de ~16 millions de pixels : on reste dessous. */
const MAX_CANVAS_PIXELS = 12_000_000
/** Netteté suffisante pour zoomer un peu sans alourdir la mémoire. */
const MAX_DENSITY = 2.5
/** Format A4 en attendant de connaître la vraie page. */
const DEFAULT_RATIO = 1.414

/**
 * Aperçu d'un PDF dessiné par pdf.js, page après page, dans la page même.
 * Le lecteur intégré de Safari (iframe) affiche souvent une page blanche
 * dans l'app iPhone ou en mode installé ; celui-ci marche partout, hors
 * ligne compris. Les pages ne sont dessinées qu'en approchant de l'écran.
 */
export function PdfViewer({
  data,
  name,
  onError,
}: {
  data: Blob
  name: string
  /** pdf.js n'a pas pu ouvrir le fichier : l'appelant propose autre chose. */
  onError: () => void
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [width, setWidth] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let cancelled = false
    let opened: OpenedPdf | null = null
    openPdf(data)
      .then((doc) => {
        if (cancelled) {
          doc.close()
          return
        }
        opened = doc
        setPdf(doc.pdf)
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current()
      })
    return () => {
      cancelled = true
      setPdf(null)
      opened?.close()
    }
  }, [data])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={scroller}
      role="document"
      aria-label={`Aperçu de ${name}`}
      aria-busy={!pdf}
      className="h-full w-full touch-pan-y touch-pinch-zoom overflow-y-auto overscroll-contain"
    >
      {!pdf ? (
        <div className="flex h-full items-center justify-center">
          <Loader2
            aria-hidden
            className="text-ink-foreground/70 size-7 animate-spin"
          />
          <span className="sr-only">Ouverture du document…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-2">
          {width > 0 &&
            Array.from({ length: pdf.numPages }, (_, index) => (
              <PdfPage
                key={index}
                pdf={pdf}
                number={index + 1}
                width={width}
                root={scroller.current}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function PdfPage({
  pdf,
  number,
  width,
  root,
}: {
  pdf: PDFDocumentProxy
  number: number
  width: number
  root: HTMLElement | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ratio, setRatio] = useState(DEFAULT_RATIO)
  const [near, setNear] = useState(number === 1)
  const [drawn, setDrawn] = useState(false)

  // Dessinée quand elle approche de l'écran (une page d'avance environ).
  useEffect(() => {
    const element = box.current
    if (!element || near) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { root, rootMargin: '100% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [root, near])

  useEffect(() => {
    if (!near) return
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    void (async () => {
      try {
        const page = await pdf.getPage(number)
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        setRatio(base.height / base.width)
        const cssScale = width / base.width
        const density = Math.min(
          window.devicePixelRatio || 1,
          MAX_DENSITY,
          Math.sqrt(
            MAX_CANVAS_PIXELS /
              (base.width * cssScale * base.height * cssScale),
          ),
        )
        const viewport = page.getViewport({ scale: cssScale * density })
        const target = canvas.current
        if (!target) return
        target.width = Math.floor(viewport.width)
        target.height = Math.floor(viewport.height)
        task = page.render({ canvas: target, viewport })
        await task.promise
        if (!cancelled) setDrawn(true)
      } catch {
        // Rendu annulé (page quittée) ou page illisible : elle reste blanche.
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, number, width, near])

  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-md bg-white shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
      style={{ aspectRatio: `1 / ${ratio}` }}
    >
      <canvas
        ref={canvas}
        aria-hidden
        className="absolute inset-0 h-full w-full"
      />
      {!drawn && (
        <Loader2
          aria-hidden
          className="text-muted-foreground absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin"
        />
      )}
      <span className="sr-only">
        Page {number} sur {pdf.numPages}
      </span>
    </div>
  )
}
