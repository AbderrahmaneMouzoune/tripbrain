/**
 * Low-level IndexedDB access for the documents store.
 *
 * Shared between the `useDocuments` hook (user files), the demo data seeding
 * (`@/lib/demo-documents`) and the share import (documents received through a
 * share code), so they all write to the same store.
 */

import { uniqueFileName, type ImportProgress } from '@/lib/document-zip'

const DB_NAME = 'tripbrain-documents'
const DB_VERSION = 1

export const DOCUMENTS_STORE = 'files'

export interface StoredFile {
  id: string
  name: string
  size: number
  type: string
  lastModified: number
  addedAt: number
  blob: Blob
}

export function openDocumentsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        const store = db.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' })
        store.createIndex('addedAt', 'addedAt', { unique: false })
        store.createIndex('name', 'name', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ---------------------------------------------------------------------------
// Change notifications
// ---------------------------------------------------------------------------

/**
 * Documents can be written from several places at once: the documents view,
 * and the share import dialog, which can be open over any screen. This event
 * lets every mounted `useDocuments` reload after a write, wherever it came
 * from. It stays inside the tab — other tabs reload on their next mount.
 */
const DOCUMENTS_CHANGED_EVENT = 'tripbrain:documents-changed'

export function notifyDocumentsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DOCUMENTS_CHANGED_EVENT))
}

/** Subscribe to document writes. Returns the unsubscribe function. */
export function subscribeToDocuments(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(DOCUMENTS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(DOCUMENTS_CHANGED_EVENT, listener)
}

// ---------------------------------------------------------------------------
// Writing incoming documents
// ---------------------------------------------------------------------------

/** A document received from a ZIP or a share code, before it is stored. */
export interface IncomingDocument {
  name: string
  type: string
  blob: Blob
}

export interface SaveDocumentsResult {
  imported: number
  failed: number
}

/** Names already taken in the store — read without pulling any blob in. */
async function readDocumentNames(db: IDBDatabase): Promise<Set<string>> {
  const index = db
    .transaction(DOCUMENTS_STORE, 'readonly')
    .objectStore(DOCUMENTS_STORE)
    .index('name')

  // A key cursor walks the index keys — the names — without reading a single
  // record, so no blob is loaded just to check for a collision.
  return new Promise((resolve, reject) => {
    const names = new Set<string>()
    const request = index.openKeyCursor()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(names)
        return
      }
      names.add(String(cursor.key))
      cursor.continue()
    }
  })
}

/**
 * Store documents received from outside the app, renaming collisions so an
 * import never overwrites a file already kept on the device.
 */
export async function saveDocuments(
  documents: IncomingDocument[],
  onProgress?: (progress: ImportProgress) => void,
): Promise<SaveDocumentsResult> {
  const db = await openDocumentsDB()
  const existingNames = await readDocumentNames(db)

  const total = documents.length
  let imported = 0
  let failed = 0

  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite')
  const store = tx.objectStore(DOCUMENTS_STORE)

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    onProgress?.({
      status: 'importing',
      current: i + 1,
      total,
      message: `Import en cours… (${i + 1}/${total})`,
    })
    try {
      const safeName = uniqueFileName(doc.name, existingNames)
      existingNames.add(safeName)

      const storedFile: StoredFile = {
        id: crypto.randomUUID(),
        name: safeName,
        size: doc.blob.size,
        type: doc.type || 'application/octet-stream',
        lastModified: Date.now(),
        addedAt: Date.now(),
        blob: doc.blob,
      }

      store.put(storedFile)
      imported++
    } catch {
      failed++
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  notifyDocumentsChanged()

  onProgress?.({
    status: 'done',
    current: total,
    total,
    message:
      failed === 0
        ? 'Documents importés avec succès'
        : `Certains documents n'ont pas pu être importés`,
  })

  return { imported, failed }
}
