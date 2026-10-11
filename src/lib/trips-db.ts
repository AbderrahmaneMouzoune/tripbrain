/**
 * Persistance des voyages dans IndexedDB (base `tripbrain`).
 *
 * Version 1 : un seul voyage, rangé sous la clé `current` du magasin
 * `tripData`. Version 2 : un magasin `trips` (un enregistrement par voyage).
 * La montée de version recopie l'ancien voyage dans le nouveau magasin, dans la
 * transaction même de la mise à niveau : personne ne perd son voyage, et
 * l'ancien enregistrement reste en place comme filet de sécurité.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import { createTripId, deriveTripTitle, type StoredTrip } from '@/lib/trips'

const DB_NAME = 'tripbrain'
const DB_VERSION = 2
const LEGACY_STORE = 'tripData'
const LEGACY_KEY = 'current'
const TRIPS_STORE = 'trips'

/** Voyage consulté : un réglage d'interface, pas une donnée à synchroniser. */
const ACTIVE_TRIP_KEY = 'tripbrain-active-trip'
/** Ancien drapeau du mode démo, lu une fois à la migration. */
const LEGACY_DEMO_KEY = 'tripbrain-demo'

function legacyIsDemo(): boolean {
  try {
    return localStorage.getItem(LEGACY_DEMO_KEY) === 'true'
  } catch {
    return false
  }
}

export function openTripsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      const tx = request.transaction
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.createObjectStore(LEGACY_STORE)
      }
      if (!db.objectStoreNames.contains(TRIPS_STORE)) {
        const trips = db.createObjectStore(TRIPS_STORE, { keyPath: 'id' })
        trips.createIndex('updatedAt', 'updatedAt', { unique: false })
      }

      // Migration v1 → v2 : l'unique voyage devient le premier de la liste.
      if (event.oldVersion < 2 && tx) {
        const legacy = tx.objectStore(LEGACY_STORE).get(LEGACY_KEY)
        legacy.onsuccess = () => {
          const data = legacy.result as
            | { itinerary?: DayItinerary[] }
            | undefined
          if (!data?.itinerary?.length) return
          const isDemo = legacyIsDemo()
          const now = Date.now()
          const trip: StoredTrip = {
            id: createTripId(),
            title: isDemo ? 'Chine & Taïwan' : deriveTripTitle(data.itinerary),
            itinerary: data.itinerary,
            source: isDemo ? 'demo' : 'legacy',
            createdAt: now,
            updatedAt: now,
            isDemo,
          }
          tx.objectStore(TRIPS_STORE).put(trip)
          try {
            localStorage.setItem(ACTIVE_TRIP_KEY, trip.id)
          } catch {
            // Sans stockage local, le voyage par défaut sera choisi à l'ouverture.
          }
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function readAllTrips(): Promise<StoredTrip[]> {
  const db = await openTripsDB()
  const tx = db.transaction(TRIPS_STORE, 'readonly')
  return requestToPromise(
    tx.objectStore(TRIPS_STORE).getAll() as IDBRequest<StoredTrip[]>,
  )
}

export async function writeTrip(trip: StoredTrip): Promise<void> {
  const db = await openTripsDB()
  const tx = db.transaction(TRIPS_STORE, 'readwrite')
  tx.objectStore(TRIPS_STORE).put(trip)
  await transactionDone(tx)
}

export async function deleteTripRecord(id: string): Promise<void> {
  const db = await openTripsDB()
  const tx = db.transaction(TRIPS_STORE, 'readwrite')
  tx.objectStore(TRIPS_STORE).delete(id)
  await transactionDone(tx)
}

/** Efface tous les voyages, ancien enregistrement compris. */
export async function deleteAllTrips(): Promise<void> {
  const db = await openTripsDB()
  const tx = db.transaction([TRIPS_STORE, LEGACY_STORE], 'readwrite')
  tx.objectStore(TRIPS_STORE).clear()
  tx.objectStore(LEGACY_STORE).clear()
  await transactionDone(tx)
}

export function readActiveTripId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TRIP_KEY)
  } catch {
    return null
  }
}

export function writeActiveTripId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_TRIP_KEY, id)
    else localStorage.removeItem(ACTIVE_TRIP_KEY)
    localStorage.removeItem(LEGACY_DEMO_KEY)
  } catch {
    // Réglage de confort : sans stockage local, on retombe sur le voyage par défaut.
  }
}
