'use client'

import { PencilLine } from 'lucide-react'
import { useEditSession } from '@/components/app/edit-session'
import { EditReviewSheet } from '@/components/edit/edit-review-dialog'
import { Button } from '@/components/ui/button'

/**
 * Barre collée en bas pendant le mode édition, et récapitulatif des
 * modifications. Rendue par le roadbook (écran Journée), là où l'on édite.
 *
 * La barre est fixe ; elle laisse dans le flux une cale de sa hauteur pour
 * que le bas de l'écran reste atteignable au défilement : la placer en fin de
 * contenu.
 */
export function EditChrome() {
  const { isEditing, pendingChanges, openReview, stopEditing } =
    useEditSession()
  const plural = pendingChanges > 1 ? 's' : ''

  return (
    <>
      {isEditing && (
        <>
          <div
            aria-hidden
            className="h-[calc(env(safe-area-inset-bottom)+88px)] shrink-0"
          />
          <div
            role="region"
            aria-label="Mode édition"
            className="bg-card border-border animate-sheet fixed inset-x-0 bottom-0 z-30 border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-[0_-8px_24px_rgba(14,26,58,0.08)]"
          >
            <div className="mx-auto flex max-w-xl items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {pendingChanges > 0 ? (
                  <span
                    aria-hidden
                    className="bg-secondary text-secondary-foreground animate-pop flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-sm font-black tabular-nums"
                    key={pendingChanges}
                  >
                    {pendingChanges}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="bg-primary-soft text-primary-strong flex size-7 shrink-0 items-center justify-center rounded-full"
                  >
                    <PencilLine className="size-3.5" strokeWidth={2.5} />
                  </span>
                )}
                <p className="min-w-0 text-sm leading-tight font-black">
                  Mode édition
                  <span
                    aria-live="polite"
                    className="text-muted-foreground block text-xs font-bold"
                  >
                    {pendingChanges > 0
                      ? `${pendingChanges} modification${plural} à enregistrer`
                      : 'Aucune modification'}
                  </span>
                </p>
              </div>

              {pendingChanges > 0 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg2"
                    className="px-4"
                    onClick={() => openReview('discard')}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    size="lg2"
                    className="px-4"
                    onClick={() => openReview('save')}
                  >
                    Enregistrer
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ink"
                  size="lg2"
                  onClick={stopEditing}
                >
                  Terminer
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <EditReviewSheet />
    </>
  )
}
