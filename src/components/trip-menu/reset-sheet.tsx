'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, Loader2, Share2, Trash2 } from 'lucide-react'
import { useAppNav } from '@/components/app/navigation'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { plural } from '@/components/trip-menu/trip-format'
import { countTripDocuments, deleteTripDocuments } from '@/lib/documents-db'
import { trackEvent } from '@/lib/analytics/client'

/** `trip` : le voyage affiché. `all` puis `all-confirm` : tout l'appareil, confirmé deux fois. */
type Stage = 'trip' | 'all' | 'all-confirm'

/**
 * Supprimer le voyage affiché, avec ses documents. L'option « Tout effacer »
 * reste en retrait et demande deux confirmations : elle emporte tous les
 * voyages. Sans voyage restant, l'application revient d'elle-même à l'accueil.
 */
export function ResetSheet({ onClose }: ScreenProps<'reset'>) {
  const { activeTrip, activeTripId, trips, deleteTrip, clearAllData } =
    useTrip()
  const { replace, closeAll } = useAppNav()
  const [stage, setStage] = useState<Stage>('trip')
  /** `null` tant que le compte n'est pas connu (ou s'il a échoué). */
  const [documentCount, setDocumentCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeTripId) return
    let cancelled = false
    countTripDocuments(activeTripId)
      .then((count) => {
        if (!cancelled) setDocumentCount(count)
      })
      .catch(() => {
        if (!cancelled) setDocumentCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeTripId])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      closeAll()
    } catch {
      setError('La suppression n’a pas abouti. Réessayez.')
      setBusy(false)
    }
  }

  const deleteActiveTrip = () =>
    run(async () => {
      if (!activeTripId) return
      trackEvent('data_cleared', { surface: 'share_dialog' })
      try {
        await deleteTripDocuments(activeTripId)
      } catch {
        // Les documents ne doivent pas empêcher de supprimer le voyage.
      }
      await deleteTrip(activeTripId)
    })

  const deleteEverything = () =>
    run(async () => {
      trackEvent('data_cleared', { surface: 'share_dialog' })
      // `clearAllData` ne touche qu'aux voyages : leurs documents partent d'abord.
      for (const trip of trips) {
        try {
          await deleteTripDocuments(trip.id)
        } catch {
          // Idem : on efface au moins les voyages.
        }
      }
      await clearAllData()
    })

  const title = activeTrip?.title ?? 'ce voyage'

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent className="bg-card flex max-w-[calc(100%-48px)] flex-col items-center gap-0 rounded-[28px] border-0 px-5 pt-6 pb-5 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:max-w-sm">
        <span
          aria-hidden
          className="bg-destructive-soft text-destructive animate-pop flex size-16 items-center justify-center rounded-full"
        >
          <Trash2 className="size-7" />
        </span>

        {stage === 'trip' && (
          <>
            <AlertDialogTitle className="font-display mt-4 text-2xl leading-tight font-normal">
              Supprimer ce voyage ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground mt-2.5 text-[15px] leading-normal">
              Le voyage{' '}
              <strong className="text-foreground font-black">{title}</strong>{' '}
              {documentCount === null
                ? 'et ses documents seront supprimés'
                : documentCount === 0
                  ? 'sera supprimé'
                  : documentCount === 1
                    ? 'et son document seront supprimés'
                    : `et ses ${documentCount} documents seront supprimés`}{' '}
              de ce téléphone. Cette action est définitive.
            </AlertDialogDescription>

            <button
              type="button"
              onClick={() => replace({ kind: 'share' })}
              className="pressable bg-primary-soft text-primary-strong focus-visible:ring-ring/50 mt-4 flex min-h-[52px] w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left outline-none focus-visible:ring-[3px]"
            >
              <Share2 className="size-5 shrink-0" aria-hidden />
              <span className="flex-1 text-sm leading-snug font-extrabold">
                Partagez-le d’abord pour en garder une copie
              </span>
              <ChevronRight className="size-[18px] shrink-0" aria-hidden />
            </button>
          </>
        )}

        {stage === 'all' && (
          <>
            <AlertDialogTitle className="font-display mt-4 text-2xl leading-tight font-normal">
              Tout effacer de cet appareil ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground mt-2.5 text-[15px] leading-normal">
              {trips.length > 1
                ? `Les ${plural(trips.length, 'voyage')} enregistrés`
                : 'Le voyage enregistré'}{' '}
              et leurs documents seront supprimés de ce téléphone. Vous
              reviendrez à l’écran d’accueil.
            </AlertDialogDescription>
          </>
        )}

        {stage === 'all-confirm' && (
          <>
            <AlertDialogTitle className="font-display mt-4 text-2xl leading-tight font-normal">
              Vraiment tout effacer ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground mt-2.5 text-[15px] leading-normal">
              Dernière confirmation : rien ne pourra être récupéré, sauf ce que
              vous avez partagé ou exporté.
            </AlertDialogDescription>
          </>
        )}

        {error && (
          <p role="alert" className="text-destructive mt-3 text-sm font-bold">
            {error}
          </p>
        )}

        <div className="mt-[18px] grid w-full grid-cols-2 gap-2.5">
          <AlertDialogCancel
            disabled={busy}
            className="border-border-strong bg-card h-[52px] rounded-2xl border-[1.5px] text-base font-extrabold"
          >
            Annuler
          </AlertDialogCancel>
          {/* Pas d'`AlertDialogAction` : il fermerait la fenêtre avant la fin de la suppression. */}
          <Button
            variant="destructive"
            disabled={busy}
            className="h-[52px] rounded-2xl text-base font-extrabold"
            onClick={() => {
              if (stage === 'trip') void deleteActiveTrip()
              else if (stage === 'all') setStage('all-confirm')
              else void deleteEverything()
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {stage === 'trip'
              ? 'Supprimer'
              : stage === 'all'
                ? 'Continuer'
                : 'Tout effacer'}
          </Button>
        </div>

        {stage === 'trip' && (
          <button
            type="button"
            onClick={() => setStage('all')}
            disabled={busy}
            className="text-muted-foreground focus-visible:ring-ring/50 mt-2 min-h-11 rounded-xl px-3 text-sm font-extrabold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
          >
            Tout effacer de cet appareil
          </button>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
