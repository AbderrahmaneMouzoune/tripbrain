'use client'

import { useCallback, useRef, type ChangeEvent } from 'react'

export type PickerKind = 'photos' | 'files' | 'scan' | 'zip'

/**
 * Sélecteurs de fichiers cachés derrière les boutons Photos / Fichiers /
 * Scanner / Archive ZIP. Le scanner n'est qu'un `capture="environment"` : le
 * téléphone ouvre directement l'appareil photo arrière, sans traitement de
 * l'image (pas de recadrage automatique).
 */
export function useDocumentPickers({
  onFiles,
  onZip,
}: {
  onFiles: (files: File[]) => void
  onZip?: (file: File) => void
}) {
  const photos = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  const scan = useRef<HTMLInputElement>(null)
  const zip = useRef<HTMLInputElement>(null)

  const open = useCallback((kind: PickerKind) => {
    const target = { photos, files, scan, zip }[kind].current
    target?.click()
  }, [])

  const handle = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    // Remise à zéro : choisir deux fois le même fichier doit marcher.
    event.target.value = ''
    if (selected.length > 0) onFiles(selected)
  }

  const handleZip = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onZip?.(file)
  }

  const inputs = (
    <>
      <input
        ref={photos}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handle}
      />
      <input
        ref={files}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handle}
      />
      <input
        ref={scan}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handle}
      />
      {onZip && (
        <input
          ref={zip}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={handleZip}
        />
      )}
    </>
  )

  return { open, inputs }
}
