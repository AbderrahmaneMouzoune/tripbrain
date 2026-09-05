'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  exportDocumentsAsZip,
  parseDocumentsZip,
  type ExportProgress,
  type ImportProgress,
} from '@/lib/document-zip'
import {
  DOCUMENTS_STORE as STORE_NAME,
  notifyDocumentsChanged,
  openDocumentsDB as openDB,
  saveDocuments,
  subscribeToDocuments,
  type StoredFile,
} from '@/lib/documents-db'

export type { StoredFile }

export function useDocuments() {
  const [files, setFiles] = useState<StoredFile[]>([])
  const [loading, setLoading] = useState(true)

  const loadFiles = useCallback(async () => {
    try {
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()

      return new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const sorted = (request.result as StoredFile[]).sort(
            (a, b) => b.addedAt - a.addedAt,
          )
          setFiles(sorted)
          setLoading(false)
          resolve()
        }
        request.onerror = () => {
          setLoading(false)
          resolve()
        }
      })
    } catch {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
    // Les documents peuvent aussi arriver par un code de partage, depuis une
    // dialog montée ailleurs : cette liste se remet à jour quelle que soit la
    // porte d'entrée.
    return subscribeToDocuments(() => {
      loadFiles()
    })
  }, [loadFiles])

  const addFiles = useCallback(
    async (newFiles: File[]) => {
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      for (const file of newFiles) {
        const storedFile: StoredFile = {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          addedAt: Date.now(),
          blob: file,
        }
        store.put(storedFile)
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      notifyDocumentsChanged()
      await loadFiles()
    },
    [loadFiles],
  )

  const deleteFile = useCallback(
    async (id: string) => {
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(id)

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      notifyDocumentsChanged()
      await loadFiles()
    },
    [loadFiles],
  )

  const downloadFile = useCallback(async (file: StoredFile) => {
    const url = URL.createObjectURL(file.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }, [])

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
      const result = await saveDocuments(documents, onProgress)

      await loadFiles()

      return result
    },
    [loadFiles],
  )

  return {
    files,
    loading,
    addFiles,
    deleteFile,
    downloadFile,
    exportAll,
    importZip,
  }
}
