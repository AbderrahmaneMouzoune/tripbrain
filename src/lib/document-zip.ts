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

/** A document as it goes into a ZIP — what both the export and the share need. */
export interface ZippableDocument {
  name: string
  type: string
  size: number
  blob: Blob
}

/** Turn a Blob into a Uint8Array. */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Pack documents into a ZIP archive, in memory.
 *
 * Shared by the download export and the code share (`@/lib/document-share`):
 * both produce the exact same archive, so an archive received either way is
 * read back by `readDocumentsZip`.
 */
export async function buildDocumentsZip(
  documents: ZippableDocument[],
): Promise<Uint8Array> {
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
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(fileMap, { level: 6 }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

/**
 * Export an array of StoredFile-like objects into a downloadable ZIP.
 * Calls `onProgress` at key steps so the UI can show feedback.
 */
export async function exportDocumentsAsZip(
  documents: ZippableDocument[],
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  onProgress?.({ status: 'preparing', message: 'Préparation des documents…' })

  const zipData = await buildDocumentsZip(documents)

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
 * Read a documents archive from raw bytes and return the manifest + documents.
 * Throws descriptive errors on invalid input.
 */
export async function readDocumentsZip(data: Uint8Array): Promise<ParsedZip> {
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

  // The archive can come from the network (a shared code), so the manifest is
  // checked rather than trusted: a listing that is not one stops here.
  if (!Array.isArray(manifest?.documents)) {
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
 * Parse a ZIP file picked by the user and return the manifest + documents.
 * Throws descriptive errors on invalid input.
 */
export async function parseDocumentsZip(file: File): Promise<ParsedZip> {
  if (!file.name.endsWith('.zip') && file.type !== 'application/zip') {
    throw new Error('Fichier non valide')
  }

  return readDocumentsZip(await blobToUint8Array(file))
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
  const base = dotIndex !== -1 ? candidate.slice(0, dotIndex) : candidate
  const ext = dotIndex !== -1 ? candidate.slice(dotIndex) : ''

  let counter = 1
  let name: string
  do {
    name = `${base} (${counter})${ext}`
    counter++
  } while (existingNames.has(name))
  return name
}
