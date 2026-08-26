/**
 * Low-level IndexedDB access for the documents store.
 *
 * Shared between the `useDocuments` hook (user files) and the demo data
 * seeding (`@/lib/demo-documents`), so both write to the same store.
 */

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
