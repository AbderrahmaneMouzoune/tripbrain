'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { decompressItinerary } from '@/lib/qr-import'
import type { DayItinerary } from '@/lib/itinerary-data'

interface UseQrImportOptions {
  /** Indique si le chargement initial des données est terminé */
  isLoading: boolean
  /** Persiste les données importées dans IndexedDB */
  importItineraryData: (data: DayItinerary[]) => Promise<void>
}

interface UseQrImportReturn {
  /** Données en attente d'import (null si aucune) */
  pendingImportData: DayItinerary[] | null
  /** Confirme l'import et nettoie le paramètre URL */
  handleQrImportConfirm: () => Promise<void>
  /** Refuse l'import et nettoie le paramètre URL */
  handleQrImportDismiss: () => void
}

/** Détecte le paramètre ?import= dans l'URL (QR code scanné) et expose
 *  les données en attente ainsi que les handlers de confirmation / refus. */
export function useQrImport({
  isLoading,
  importItineraryData,
}: UseQrImportOptions): UseQrImportReturn {
  const searchParams = useSearchParams()
  const [pendingImportData, setPendingImportData] =
    useState<DayItinerary[] | null>(null)
  const importHandledRef = useRef(false)

  useEffect(() => {
    if (isLoading || importHandledRef.current) return
    importHandledRef.current = true

    const importParam = searchParams.get('import')
    if (!importParam) return

    try {
      const decoded = decompressItinerary(importParam)
      if (decoded.length > 0) {
        setPendingImportData(decoded)
      } else {
        window.history.replaceState(null, '', window.location.pathname)
      }
    } catch (error) {
      console.error('[useQrImport] Échec du décodage du paramètre import :', error)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [isLoading, searchParams])

  const handleQrImportConfirm = useCallback(async () => {
    if (!pendingImportData) return
    await importItineraryData(pendingImportData)
    setPendingImportData(null)
    window.history.replaceState(null, '', window.location.pathname)
  }, [pendingImportData, importItineraryData])

  const handleQrImportDismiss = useCallback(() => {
    setPendingImportData(null)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  return { pendingImportData, handleQrImportConfirm, handleQrImportDismiss }
}
