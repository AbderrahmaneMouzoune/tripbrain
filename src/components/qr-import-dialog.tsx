'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  IconAlertTriangle,
  IconCheck,
  IconQrcode,
  IconX,
} from '@tabler/icons-react'
import type { DayItinerary } from '@/lib/itinerary-data'

interface QrImportDialogProps {
  open: boolean
  itinerary: DayItinerary[]
  /** Appelé quand l'utilisateur confirme l'import — doit persister les données */
  onConfirm: () => Promise<void>
  /** Appelé quand l'utilisateur refuse ou ferme la dialog */
  onDismiss: () => void
}

export function QrImportDialog({
  open,
  itinerary,
  onConfirm,
  onDismiss,
}: QrImportDialogProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = useCallback(async () => {
    setIsImporting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur inconnue lors de l\u2019importation.",
      )
      setIsImporting(false)
    }
  }, [onConfirm])

  // Résumé de l'itinéraire pour informer l'utilisateur
  const dayCount = itinerary.length
  const firstDate = itinerary[0]?.date
  const lastDate = itinerary[dayCount - 1]?.date
  const cities = [
    ...new Set(itinerary.map((d) => d.city).filter(Boolean)),
  ].slice(0, 3)

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isImporting) onDismiss()
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={!isImporting}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconQrcode className="h-5 w-5" />
            Importer un itinéraire
          </DialogTitle>
          <DialogDescription>
            Un itinéraire de&nbsp;
            <strong className="text-foreground">
              {dayCount} jour{dayCount > 1 ? 's' : ''}
            </strong>
            {firstDate && lastDate && (
              <>
                {' '}
                ({firstDate} → {lastDate})
              </>
            )}{' '}
            a été détecté via QR code.
            {cities.length > 0 && (
              <>
                {' '}
                Destinations&nbsp;:{' '}
                <span className="text-foreground">
                  {cities.join(', ')}
                  {itinerary.length > cities.length ? '\u2026' : ''}
                </span>
                .
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm">Voulez-vous importer ces données\u00a0?</p>

        {error && (
          <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md p-3 text-sm">
            <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onDismiss}
            disabled={isImporting}
            className="flex-1 gap-2"
          >
            <IconX className="h-4 w-4" />
            Non
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isImporting}
            className="flex-1 gap-2"
          >
            {isImporting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <IconCheck className="h-4 w-4" />
            )}
            Oui, importer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
