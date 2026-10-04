'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  exportDocumentsAsZip,
  parseDocumentsZip,
  uniqueFileName,
  type ExportProgress,
  type ImportProgress,
} from '@/lib/document-zip'
import {
  DOCUMENTS_STORE as STORE_NAME,
  openDocumentsDB as openDB,
  type StoredFile,
} from '@/lib/documents-db'
import { isDocumentInTrip, type DocumentLink } from '@/lib/document-organize'
import { useTrip } from '@/components/app/trip-provider'

export type { StoredFile }

/**
 * Plusieurs écrans lisent les documents en même temps (l'onglet, la feuille
 * d'ajout, l'aperçu, l'état hors ligne) : chaque écriture prévient toutes les
 * instances du hook pour qu'elles relisent la base, sinon un document ajouté
 * depuis la feuille n'apparaîtrait dans l'onglet qu'au prochain lancement.
 */
const listeners = new Set<() => void>()
function notifyDocumentsChanged() {
  for (const listener of listeners) listener()
}

function readAll(db: IDBDatabase): Promise<StoredFile[]> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAll()
    request.onsuccess = () => resolve(request.result as StoredFile[])
    request.onerror = () => reject(request.error)
  })
}

function waitFor(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Enregistre le document dans les téléchargements de l'appareil. */
export function downloadStoredFile(file: StoredFile): void {
  const url = URL.createObjectURL(file.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  // Laisser au navigateur le temps de lancer le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Applique un rattachement à un enregistrement (champs vides retirés). */
function withLink(file: StoredFile, link: DocumentLink): StoredFile {
  const next: StoredFile = { ...file }
  delete next.dayId
  delete next.linkedTo
  delete next.activityId
  if (link.dayId) {
    next.dayId = link.dayId
    if (link.linkedTo) next.linkedTo = link.linkedTo
    if (link.linkedTo === 'activity' && link.activityId) {
      next.activityId = link.activityId
    }
  }
  return next
}

/**
 * Documents du voyage consulté. Les documents sans voyage (antérieurs aux
 * voyages multiples) restent visibles partout ; les nouveaux sont rangés dans
 * le voyage ouvert au moment de l'ajout.
 */
export function useDocuments() {
  const { activeTripId, isDemo } = useTrip()
  const [allFiles, setAllFiles] = useState<StoredFile[]>([])
  const [loading, setLoading] = useState(true)

  const loadFiles = useCallback(async () => {
    try {
      const db = await openDB()
      const records = await readAll(db)
      setAllFiles(records.sort((a, b) => b.addedAt - a.addedAt))
    } catch {
      // Base indisponible (navigation privée stricte) : liste vide.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFiles()
    const listener = () => void loadFiles()
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [loadFiles])

  const files = useMemo(
    () =>
      allFiles.filter((file) => isDocumentInTrip(file, activeTripId, isDemo)),
    [allFiles, activeTripId, isDemo],
  )

  const addFiles = useCallback(
    async (newFiles: File[], link: DocumentLink = {}) => {
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const now = Date.now()
      const stored: StoredFile[] = newFiles.map((file, index) =>
        withLink(
          {
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
            // Un lot garde son ordre de sélection dans le tri « récent d'abord ».
            addedAt: now - index,
            blob: file,
            ...(activeTripId ? { tripId: activeTripId } : {}),
          },
          link,
        ),
      )
      for (const record of stored) store.put(record)
      await waitFor(tx)
      notifyDocumentsChanged()
      return stored
    },
    [activeTripId],
  )

  /** Change ce que justifie un document : une journée, un trajet, un hôtel, ou tout le voyage. */
  const updateDocumentLink = useCallback(
    async (id: string, link: DocumentLink) => {
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(id)
      request.onsuccess = () => {
        const current = request.result as StoredFile | undefined
        if (current) store.put(withLink(current, link))
      }
      await waitFor(tx)
      notifyDocumentsChanged()
    },
    [],
  )

  const deleteFile = useCallback(async (id: string) => {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    await waitFor(tx)
    notifyDocumentsChanged()
  }, [])

  const downloadFile = useCallback(async (file: StoredFile) => {
    downloadStoredFile(file)
  }, [])

  /** Exporte les documents du voyage consulté, avec leurs rattachements. */
  const exportAll = useCallback(
    async (onProgress?: (p: ExportProgress) => void) => {
      await exportDocumentsAsZip(files, onProgress)
    },
    [files],
  )

  const importZip = useCallback(
    async (
      zipFile: File,
      onProgress?: (p: ImportProgress) => void,
    ): Promise<{ imported: number; failed: number }> => {
      const { documents } = await parseDocumentsZip(zipFile)

      const existingNames = new Set(files.map((f) => f.name))
      const total = documents.length
      let imported = 0
      let failed = 0

      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

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

          // L'archive est restaurée dans le voyage consulté ; les journées
          // gardent leur rattachement quand leurs identifiants correspondent
          // (même voyage partagé), sinon le document vaut pour tout le voyage.
          store.put(
            withLink(
              {
                id: crypto.randomUUID(),
                name: safeName,
                size: doc.blob.size,
                type: doc.type || 'application/octet-stream',
                lastModified: Date.now(),
                addedAt: Date.now() - i,
                blob: doc.blob,
                ...(activeTripId ? { tripId: activeTripId } : {}),
              },
              doc,
            ),
          )
          imported++
        } catch {
          failed++
        }
      }

      await waitFor(tx)
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
    },
    [files, activeTripId],
  )

  return {
    files,
    loading,
    addFiles,
    updateDocumentLink,
    deleteFile,
    downloadFile,
    exportAll,
    importZip,
  }
}
