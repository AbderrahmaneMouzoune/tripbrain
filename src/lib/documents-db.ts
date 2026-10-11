/**
 * Low-level IndexedDB access for the documents store.
 *
 * Shared between the `useDocuments` hook (user files) and the demo data
 * seeding (`@/lib/demo-documents`), so both write to the same store.
 */

const DB_NAME = 'tripbrain-documents'
const DB_VERSION = 1

export const DOCUMENTS_STORE = 'files'

/**
 * Famille d'un document, choisie par l'utilisateur. Sans elle, l'app la devine
 * d'après le rattachement et le nom du fichier (`documentCategory`).
 */
export type DocumentCategory = 'ticket' | 'hotel' | 'identity' | 'other'

export const DOCUMENT_CATEGORY_IDS: readonly DocumentCategory[] = [
  'ticket',
  'hotel',
  'identity',
  'other',
]

export interface StoredFile {
  id: string
  name: string
  size: number
  type: string
  lastModified: number
  addedAt: number
  blob: Blob
  /**
   * Voyage auquel le document appartient. Absent sur les documents enregistrés
   * avant les voyages multiples : ils restent visibles dans tous les voyages.
   */
  tripId?: string
  /** Journée concernée (identifiant de `DayItinerary`), quand on l'a précisée. */
  dayId?: string
  /** Ce que le document justifie dans la journée : un trajet, un hébergement… */
  linkedTo?: 'transport' | 'accommodation' | 'activity'
  /** Identifiant de l'activité liée, quand `linkedTo` vaut `activity`. */
  activityId?: string
  /** Famille choisie par l'utilisateur (billet, hôtel, visa…). */
  category?: DocumentCategory
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

function allDocuments(db: IDBDatabase): Promise<StoredFile[]> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(DOCUMENTS_STORE, 'readonly')
      .objectStore(DOCUMENTS_STORE)
      .getAll()
    request.onsuccess = () => resolve(request.result as StoredFile[])
    request.onerror = () => reject(request.error)
  })
}

/** Nombre de documents rattachés à un voyage précis. */
export async function countTripDocuments(tripId: string): Promise<number> {
  const db = await openDocumentsDB()
  const files = await allDocuments(db)
  return files.filter((file) => file.tripId === tripId).length
}

/**
 * Supprime les documents rattachés à un voyage (ceux d'avant les voyages
 * multiples, sans voyage, sont épargnés). Renvoie le nombre supprimé.
 */
export async function deleteTripDocuments(tripId: string): Promise<number> {
  const db = await openDocumentsDB()
  const ids = (await allDocuments(db))
    .filter((file) => file.tripId === tripId)
    .map((file) => file.id)
  if (ids.length === 0) return 0
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite')
  const store = tx.objectStore(DOCUMENTS_STORE)
  for (const id of ids) store.delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return ids.length
}
