/**
 * Accès à pdf.js, chargé à la demande (la bibliothèque pèse lourd et ne sert
 * qu'à l'ouverture d'un PDF). Son worker et ses données (polices, CMap,
 * décodeurs) sont servis depuis `public/pdfjs/<version>/`, copiés au build par
 * `scripts/copy-pdfjs-assets.mjs` : rien ne part vers un CDN, et le service
 * worker les garde pour le hors-ligne.
 *
 * La version « legacy » tourne aussi sur les iPhone qui n'ont pas la toute
 * dernière version de Safari.
 */

import type {
  PDFDocumentProxy,
  TextItem,
} from 'pdfjs-dist/types/src/display/api'

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let loading: Promise<PdfJs> | null = null

function assetsBase(version: string): string {
  return `/pdfjs/${version}/`
}

/** Charge pdf.js une seule fois. */
export function loadPdfJs(): Promise<PdfJs> {
  loading ??= import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `${assetsBase(pdfjs.version)}pdf.worker.min.mjs`
      return pdfjs
    })
    .catch((error: unknown) => {
      // Un échec réseau ne doit pas condamner les ouvertures suivantes.
      loading = null
      throw error
    })
  return loading
}

export interface OpenedPdf {
  pdf: PDFDocumentProxy
  /** Libère le document et son worker. */
  close: () => void
}

/** Ouvre un PDF stocké sur le téléphone. */
export async function openPdf(data: Blob): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs()
  const base = assetsBase(pdfjs.version)
  const bytes = new Uint8Array(await data.arrayBuffer())
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
  })
  const pdf = await task.promise
  return { pdf, close: () => void task.destroy() }
}

/** Au-delà, on ne lit pas : de quoi trouver dates, villes et références. */
const MAX_TEXT_PAGES = 6

/** Texte des premières pages d'un PDF, une ligne par bloc de texte. */
export async function pdfText(data: Blob): Promise<string> {
  const { pdf, close } = await openPdf(data)
  try {
    const pages = Math.min(pdf.numPages, MAX_TEXT_PAGES)
    const chunks: string[] = []
    for (let number = 1; number <= pages; number++) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      const line = content.items
        .map((item) => {
          const text = (item as TextItem).str ?? ''
          return (item as TextItem).hasEOL ? `${text}\n` : text
        })
        .join(' ')
      chunks.push(line)
      page.cleanup()
    }
    return chunks.join('\n')
  } finally {
    close()
  }
}
