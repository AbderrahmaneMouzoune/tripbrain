'use client'

import { useCallback, useRef, useState } from 'react'
import { triggerHaptic } from '@/lib/native-app'

export function useClipboard(resetDelay = 2000) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Copie le texte ; résout `false` si le presse-papiers a refusé. */
  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // Copie refusée (WebView sans permission, page sans geste récent…) :
        // pas de « Copié », l'appelant affiche l'échec s'il le souhaite.
        triggerHaptic('error')
        return false
      }
      triggerHaptic('success')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setCopied(true)
      timeoutRef.current = setTimeout(() => setCopied(false), resetDelay)
      return true
    },
    [resetDelay],
  )

  return { copied, copy }
}
