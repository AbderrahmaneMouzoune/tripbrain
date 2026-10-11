'use client'

import { useEffect, useState } from 'react'
import type { StoredFile } from '@/lib/documents-db'

/**
 * Adresses `blob:` des documents image, pour leurs vignettes. Elles sont
 * libérées dès que la liste change ou que l'écran se ferme.
 */
export function useImagePreviews(files: StoredFile[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        next[file.id] = URL.createObjectURL(file.blob)
      }
    }
    setUrls(next)
    return () => {
      for (const url of Object.values(next)) URL.revokeObjectURL(url)
    }
  }, [files])

  return urls
}
