'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  exportDocumentsAsZip,
  parseDocumentsZip,
  uniqueFileName,
  type ExportProgress,
  type ImportProgress,
} from '@/lib/document-zip'

const DB_NAME = 'ouzbekistan-documents'
const DB_VERSION = 1
const STORE_NAME = 'files'

export interface StoredFile {
  id: string
  name: string
  size: number
  type: string
  lastModified: number
  addedAt: number
  blob: Blob
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('addedAt', 'addedAt', { unique: false })
        store.createIndex('name', 'name', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

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

      await loadFiles()

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
    [files, loadFiles],
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
