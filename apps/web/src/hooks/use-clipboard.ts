'use client'

import { useCallback, useRef, useState } from 'react'

export function useClipboard(resetDelay = 2000) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setCopied(true)
        timeoutRef.current = setTimeout(() => setCopied(false), resetDelay)
      } catch {
        // clipboard write failed – do not show feedback
      }
    },
    [resetDelay],
  )

  return { copied, copy }
}
