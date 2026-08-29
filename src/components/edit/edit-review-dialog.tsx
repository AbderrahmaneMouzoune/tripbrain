'use client'

import { cn } from '@/lib/utils'
import { countChanges, type DayChangeSummary } from '@/lib/itinerary-diff'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, Undo2 } from 'lucide-react'

/** Action mise en avant à l'ouverture ; l'autre reste accessible. */
export type EditReviewIntent = 'save' | 'discard'

interface EditReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  intent: EditReviewIntent
  summaries: readonly DayChangeSummary[]
  /** Conserve les modifications et referme la session d'édition */
  onSave: () => void
  /** Revient à l'itinéraire d'avant l'ouverture du mode édition */
  onDiscard: () => void
}

/**
 * Double validation du mode édition : récapitulatif des modifications, puis
 * choix entre les conserver et tout remettre en place.
 */
export function EditReviewDialog({
  open,
  onOpenChange,
  intent,
  summaries,
  onSave,
  onDiscard,
}: EditReviewDialogProps) {
  const total = countChanges(summaries)
  const plural = total > 1 ? 's' : ''
  const saving = intent === 'save'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-border/60 border-b p-4 pr-12 text-left">
          <DialogTitle>
            {saving
              ? 'Enregistrer les modifications ?'
              : 'Annuler les modifications ?'}
          </DialogTitle>
          <DialogDescription>
            {saving
              ? `${total} modification${plural} depuis l'ouverture du mode édition.`
              : `${total} modification${plural} ${total > 1 ? 'seront perdues' : 'sera perdue'} : l'itinéraire revient à son état d'avant l'ouverture du mode édition.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <ul className="divide-border/50 flex flex-col divide-y">
            {summaries.map((summary) => (
              <li key={summary.dayId} className="py-2.5 first:pt-0 last:pb-0">
                <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
                  {summary.title}
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {summary.changes.map((change, index) => (
                    <li
                      key={index}
                      className="text-foreground/85 flex items-start gap-2 text-sm leading-snug"
                    >
                      <span className="bg-secondary/40 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                      {change}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="border-border/60 shrink-0 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="sm:mr-auto"
          >
            Continuer l&apos;édition
          </Button>

          <Button
            type="button"
            variant={saving ? 'outline' : 'destructive'}
            size="sm"
            onClick={onDiscard}
            className={cn('gap-1.5', saving && 'text-destructive')}
          >
            <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Tout annuler
          </Button>

          <Button
            type="button"
            variant={saving ? 'default' : 'outline'}
            size="sm"
            onClick={onSave}
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
