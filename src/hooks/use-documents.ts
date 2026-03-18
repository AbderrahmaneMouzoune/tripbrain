'use client'

import { useState, useEffect, useCallback } from 'react'

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

  return {
    files,
    loading,
    addFiles,
    deleteFile,
    downloadFile,
  }
}
