import { zip, unzip } from 'fflate'

export interface ZipManifest {
  version: '1.0'
  exportedAt: string
  documentCount: number
  totalSize: number
  documents: Array<{
    name: string
    type: string
    size: number
  }>
}

export interface ExportProgress {
  status: 'preparing' | 'done'
  message: string
}

export interface ImportProgress {
  status: 'importing' | 'done' | 'error'
  current: number
  total: number
  message: string
}

/** Turn a Blob into a Uint8Array. */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Export an array of StoredFile-like objects into a downloadable ZIP.
 * Calls `onProgress` at key steps so the UI can show feedback.
 */
export async function exportDocumentsAsZip(
  documents: Array<{ name: string; type: string; size: number; blob: Blob }>,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  onProgress?.({ status: 'preparing', message: 'Préparation des documents…' })

  const manifest: ZipManifest = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    documentCount: documents.length,
    totalSize: documents.reduce((sum, d) => sum + d.size, 0),
    documents: documents.map((d) => ({
      name: d.name,
      type: d.type,
      size: d.size,
    })),
  }

  // Build the file map for fflate
  const fileMap: Record<string, Uint8Array> = {
    'manifest.json': new TextEncoder().encode(
      JSON.stringify(manifest, null, 2),
    ),
  }

  for (const doc of documents) {
    const data = await blobToUint8Array(doc.blob)
    // Store binary under documents/ prefix
    fileMap[`documents/${doc.name}`] = data
  }

  // Compress asynchronously (level 6 = balanced speed/size)
  const zipData = await new Promise<Uint8Array>((resolve, reject) => {
    zip(fileMap, { level: 6 }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })

  // Trigger download
  const blob = new Blob([zipData], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const dateStr = new Date().toISOString().slice(0, 10)
  a.download = `tripbrain-documents-${dateStr}.zip`
  a.click()
  URL.revokeObjectURL(url)

  onProgress?.({ status: 'done', message: 'Export terminé' })
}

export interface ParsedZipDocument {
  name: string
  type: string
  blob: Blob
}

export interface ParsedZip {
  documents: ParsedZipDocument[]
  manifest: ZipManifest
}

/**
 * Parse a ZIP file and return the manifest + documents as Blobs.
 * Throws descriptive errors on invalid input.
 */
export async function parseDocumentsZip(file: File): Promise<ParsedZip> {
  if (!file.name.endsWith('.zip') && file.type !== 'application/zip') {
    throw new Error('Fichier non valide')
  }

  const data = await blobToUint8Array(file)
  const entries = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => {
      unzip(data, (err, result) => {
        if (err) reject(new Error('Fichier non valide'))
        else resolve(result)
      })
    },
  )

  const manifestRaw = entries['manifest.json']
  if (!manifestRaw) {
    throw new Error('Format non supporté')
  }

  let manifest: ZipManifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as ZipManifest
  } catch {
    throw new Error('Format non supporté')
  }

  const documents: ParsedZipDocument[] = []
  for (const docMeta of manifest.documents) {
    const entry = entries[`documents/${docMeta.name}`]
    if (!entry) continue
    const blob = new Blob([entry], {
      type: docMeta.type || 'application/octet-stream',
    })
    documents.push({ name: docMeta.name, type: docMeta.type, blob })
  }

  return { documents, manifest }
}

/**
 * Generate a unique name for `candidate` given a set of existing names.
 * e.g. "file.pdf" → "file (1).pdf" → "file (2).pdf" …
 */
export function uniqueFileName(
  candidate: string,
  existingNames: Set<string>,
): string {
  if (!existingNames.has(candidate)) return candidate

  const dotIndex = candidate.lastIndexOf('.')
  const base =
    dotIndex !== -1 ? candidate.slice(0, dotIndex) : candidate
  const ext = dotIndex !== -1 ? candidate.slice(dotIndex) : ''

  let counter = 1
  let name: string
  do {
    name = `${base} (${counter})${ext}`
    counter++
  } while (existingNames.has(name))
  return name
}
