import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Must be declared before imports so Vitest can hoist the mock
vi.mock('fflate', () => ({
  zip: vi.fn(),
  unzip: vi.fn(),
}))

import { zip, unzip } from 'fflate'
import {
  uniqueFileName,
  exportDocumentsAsZip,
  parseDocumentsZip,
} from '../document-zip'

// ---------------------------------------------------------------------------
// uniqueFileName – pure function, no mocking needed
// ---------------------------------------------------------------------------

describe('uniqueFileName', () => {
  it('returns the candidate when the name is not taken', () => {
    expect(uniqueFileName('file.pdf', new Set())).toBe('file.pdf')
  })

  it('appends (1) when the exact name already exists', () => {
    expect(uniqueFileName('file.pdf', new Set(['file.pdf']))).toBe(
      'file (1).pdf',
    )
  })

  it('increments counter past existing numbered variants', () => {
    const existing = new Set(['file.pdf', 'file (1).pdf', 'file (2).pdf'])
    expect(uniqueFileName('file.pdf', existing)).toBe('file (3).pdf')
  })

  it('handles files without an extension', () => {
    expect(uniqueFileName('README', new Set(['README']))).toBe('README (1)')
  })

  it('uses only the last dot as the extension separator', () => {
    // "archive.tar.gz" → base "archive.tar", ext ".gz"
    expect(uniqueFileName('archive.tar.gz', new Set(['archive.tar.gz']))).toBe(
      'archive.tar (1).gz',
    )
  })

  it('is case-sensitive when matching existing names', () => {
    // 'FILE.PDF' is different from 'file.pdf'
    expect(uniqueFileName('file.pdf', new Set(['FILE.PDF']))).toBe('file.pdf')
  })

  it('returns candidate unchanged when the set is empty', () => {
    expect(uniqueFileName('any-name.docx', new Set())).toBe('any-name.docx')
  })

  it('handles a name that is only a dot', () => {
    // edge-case: dotIndex === 0, so base is '' and ext is '.'
    const result = uniqueFileName('.', new Set(['.']))
    expect(typeof result).toBe('string')
    expect(result).not.toBe('.')
  })
})

// ---------------------------------------------------------------------------
// exportDocumentsAsZip – requires DOM + fflate mocks
// ---------------------------------------------------------------------------

describe('exportDocumentsAsZip', () => {
  let clickMock: ReturnType<typeof vi.fn>
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  const zipMock = zip as unknown as ReturnType<typeof vi.fn>
  let originalURL: typeof globalThis.URL | undefined
  let originalDocument: Document | undefined

  beforeEach(() => {
    clickMock = vi.fn()
    createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    revokeObjectURLMock = vi.fn()

    originalURL = globalThis.URL
    originalDocument = globalThis.document

    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      writable: true,
      value: {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      },
    })

    const mockAnchor = { href: '', download: '', click: clickMock }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        createElement: vi.fn().mockReturnValue(mockAnchor),
      },
    })

    // Make fflate.zip call back synchronously with a dummy buffer
    zipMock.mockImplementation(
      (_files, _opts, cb) => void cb(null, new Uint8Array([80, 75, 3, 4])),
    )
  })

  afterEach(() => {
    if (originalURL === undefined) {
      delete (globalThis as { URL?: unknown }).URL
    } else {
      Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        writable: true,
        value: originalURL,
      })
    }

    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        writable: true,
        value: originalDocument,
      })
    }

    vi.clearAllMocks()
  })

  it('calls onProgress with preparing then done', async () => {
    const progress: string[] = []
    const blob = new Blob(['hello'], { type: 'text/plain' })
    await exportDocumentsAsZip(
      [{ name: 'doc.txt', type: 'text/plain', size: 5, blob }],
      (p) => {
        progress.push(p.status)
      },
    )
    expect(progress).toContain('preparing')
    expect(progress).toContain('done')
  })

  it('triggers an anchor click for download', async () => {
    const blob = new Blob(['data'], { type: 'application/pdf' })
    await exportDocumentsAsZip([
      { name: 'report.pdf', type: 'application/pdf', size: 4, blob },
    ])
    expect(clickMock).toHaveBeenCalledOnce()
  })

  it('revokes the object URL after download', async () => {
    const blob = new Blob(['x'])
    await exportDocumentsAsZip([
      { name: 'x.bin', type: 'application/octet-stream', size: 1, blob },
    ])
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url')
  })

  it('works with an empty documents array', async () => {
    await expect(exportDocumentsAsZip([])).resolves.toBeUndefined()
    expect(clickMock).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// parseDocumentsZip – requires fflate + File mocks
// ---------------------------------------------------------------------------

describe('parseDocumentsZip', () => {
  const unzipMock = unzip as unknown as ReturnType<typeof vi.fn>

  afterEach(() => {
    vi.clearAllMocks()
  })

  function makeManifestEntries(
    docs: Array<{ name: string; type: string; size: number }>,
  ) {
    const encoder = new TextEncoder()
    const manifest = {
      version: '1.0' as const,
      exportedAt: '2026-01-01T00:00:00Z',
      documentCount: docs.length,
      totalSize: docs.reduce((s, d) => s + d.size, 0),
      documents: docs,
    }
    const entries: Record<string, Uint8Array> = {
      'manifest.json': encoder.encode(JSON.stringify(manifest)),
    }
    for (const doc of docs) {
      entries[`documents/${doc.name}`] = encoder.encode(
        `content-of-${doc.name}`,
      )
    }
    return entries
  }

  it('throws when the file does not have a .zip extension or mime type', async () => {
    const file = new File(['data'], 'document.pdf', { type: 'application/pdf' })
    await expect(parseDocumentsZip(file)).rejects.toThrow('Fichier non valide')
  })

  it('accepts a file with .zip extension', async () => {
    const entries = makeManifestEntries([
      { name: 'file.txt', type: 'text/plain', size: 20 },
    ])
    unzipMock.mockImplementation((_data, cb) => void cb(null, entries))
    const file = new File([new Uint8Array([80, 75])], 'export.zip', {
      type: 'application/zip',
    })
    const result = await parseDocumentsZip(file)
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].name).toBe('file.txt')
    expect(result.manifest.documentCount).toBe(1)
  })

  it('accepts a file with application/zip mime type even without .zip extension', async () => {
    const entries = makeManifestEntries([])
    unzipMock.mockImplementation((_data, cb) => void cb(null, entries))
    const file = new File([new Uint8Array([80, 75])], 'archive', {
      type: 'application/zip',
    })
    await expect(parseDocumentsZip(file)).resolves.toBeDefined()
  })

  it('throws when the ZIP has no manifest.json', async () => {
    unzipMock.mockImplementation((_data, cb) => void cb(null, {}))
    const file = new File([new Uint8Array([80, 75])], 'bad.zip', {
      type: 'application/zip',
    })
    await expect(parseDocumentsZip(file)).rejects.toThrow('Format non supporté')
  })

  it('throws when the manifest is not valid JSON', async () => {
    unzipMock.mockImplementation(
      (_data, cb) =>
        void cb(null, {
          'manifest.json': new TextEncoder().encode('NOT JSON!!!'),
        }),
    )
    const file = new File([new Uint8Array([80, 75])], 'bad.zip', {
      type: 'application/zip',
    })
    await expect(parseDocumentsZip(file)).rejects.toThrow('Format non supporté')
  })

  it('returns parsed manifest metadata', async () => {
    const entries = makeManifestEntries([
      { name: 'a.pdf', type: 'application/pdf', size: 100 },
      { name: 'b.png', type: 'image/png', size: 200 },
    ])
    unzipMock.mockImplementation((_data, cb) => void cb(null, entries))
    const file = new File([new Uint8Array([80, 75])], 'export.zip', {
      type: 'application/zip',
    })
    const { manifest, documents } = await parseDocumentsZip(file)
    expect(manifest.documentCount).toBe(2)
    expect(documents).toHaveLength(2)
    expect(documents.map((d) => d.name)).toEqual(['a.pdf', 'b.png'])
  })

  it('skips documents whose binary entry is missing from the ZIP', async () => {
    const encoder = new TextEncoder()
    const manifest = {
      version: '1.0' as const,
      exportedAt: '2026-01-01T00:00:00Z',
      documentCount: 2,
      totalSize: 0,
      documents: [
        { name: 'present.txt', type: 'text/plain', size: 10 },
        { name: 'missing.txt', type: 'text/plain', size: 10 },
      ],
    }
    const entries: Record<string, Uint8Array> = {
      'manifest.json': encoder.encode(JSON.stringify(manifest)),
      'documents/present.txt': encoder.encode('hello'),
      // 'documents/missing.txt' intentionally absent
    }
    unzipMock.mockImplementation((_data, cb) => void cb(null, entries))
    const file = new File([new Uint8Array([80, 75])], 'partial.zip', {
      type: 'application/zip',
    })
    const { documents } = await parseDocumentsZip(file)
    expect(documents).toHaveLength(1)
    expect(documents[0].name).toBe('present.txt')
  })

  it('uses application/octet-stream when document type is empty', async () => {
    const encoder = new TextEncoder()
    const manifest = {
      version: '1.0' as const,
      exportedAt: '2026-01-01T00:00:00Z',
      documentCount: 1,
      totalSize: 5,
      documents: [{ name: 'unknown', type: '', size: 5 }],
    }
    const entries: Record<string, Uint8Array> = {
      'manifest.json': encoder.encode(JSON.stringify(manifest)),
      'documents/unknown': encoder.encode('hello'),
    }
    unzipMock.mockImplementation((_data, cb) => void cb(null, entries))
    const file = new File([new Uint8Array([80, 75])], 'export.zip', {
      type: 'application/zip',
    })
    const { documents } = await parseDocumentsZip(file)
    expect(documents[0].blob.type).toBe('application/octet-stream')
  })
})
