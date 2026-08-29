'use client'

import { cn } from '@/lib/utils'
import {
  countChanges,
  type ChangeKind,
  type DayChangeSummary,
  type EntityChange,
  type FieldChange,
} from '@/lib/itinerary-diff'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  Minus,
  PencilLine,
  Plus,
  Undo2,
} from 'lucide-react'

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

const KIND_ICONS: Record<ChangeKind, typeof Plus> = {
  added: Plus,
  removed: Minus,
  updated: PencilLine,
  moved: ArrowUpDown,
}

const KIND_LABELS: Record<ChangeKind, string> = {
  added: 'Ajout',
  removed: 'Suppression',
  updated: 'Modification',
  moved: 'Déplacement',
}

/** Pastille de la nature du changement : ajout, retrait, retouche, ordre. */
const KIND_CLASSES: Record<ChangeKind, string> = {
  added:
    'bg-green-500/10 text-green-700 border-green-500/25 dark:text-green-400',
  removed: 'bg-red-500/10 text-red-600 border-red-500/25 dark:text-red-400',
  updated: 'bg-primary/10 text-primary border-primary/25',
  moved: 'bg-muted text-muted-foreground border-border/60',
}

/**
 * Double validation du mode édition : récapitulatif détaillé des
 * modifications, puis choix entre les conserver et tout remettre en place.
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
      <DialogContent
        className="flex max-h-[86svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogHeader className="border-border/60 border-b px-4 py-3.5 text-left">
          <DialogTitle className="text-base">
            {saving
              ? 'Enregistrer les modifications ?'
              : 'Tout annuler et repartir de zéro ?'}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {saving
              ? `${total} modification${plural} depuis l'ouverture du mode édition.`
              : `${total} modification${plural} ${total > 1 ? 'seront perdues' : 'sera perdue'} : l'itinéraire reviendra à son état d'avant l'ouverture du mode édition.`}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/25 min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-4">
            {summaries.map((summary) => (
              <section key={summary.dayId} className="flex flex-col gap-1.5">
                <h3 className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
                  {summary.title}
                </h3>
                <div className="flex flex-col gap-1.5">
                  {summary.changes.map((change) => (
                    <ChangeCard key={change.id} change={change} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <DialogFooter className="border-border/60 shrink-0 gap-2 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground sm:mr-auto"
          >
            Continuer l&apos;édition
          </Button>

          {saving ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDiscard}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
              >
                <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Tout annuler
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                className="gap-1.5"
              >
                <Check className="h-4 w-4" strokeWidth={2.25} />
                Enregistrer
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSave}
                className="gap-1.5"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Garder mes modifications
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onDiscard}
                className="gap-1.5"
              >
                <Undo2 className="h-4 w-4" strokeWidth={2} />
                Tout annuler
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Une entité touchée : sa nature, son nom, et le détail avant / après. */
function ChangeCard({ change }: { change: EntityChange }) {
  const Icon = KIND_ICONS[change.kind]

  return (
    <article className="border-border/60 bg-card rounded-lg border px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
            KIND_CLASSES[change.kind],
          )}
          title={KIND_LABELS[change.kind]}
        >
          <Icon className="h-3 w-3" strokeWidth={2.25} />
        </span>

        <div className="min-w-0 flex-1">
          {change.name ? (
            <>
              <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                {change.scope}
              </p>
              <p className="text-foreground text-[13px] leading-snug font-semibold break-words">
                {change.name}
              </p>
            </>
          ) : (
            <p className="text-foreground text-[13px] leading-snug font-semibold">
              {change.scope}
            </p>
          )}
        </div>
      </div>

      {change.fields.length > 0 && (
        <dl className="divide-border/40 mt-2 flex flex-col divide-y">
          {change.fields.map((field) => (
            <FieldRow key={field.label} field={field} />
          ))}
        </dl>
      )}
    </article>
  )
}

/**
 * Un champ modifié : l'ancienne valeur barrée, la nouvelle en dessous derrière
 * une flèche. Les deux lignes sont empilées pour qu'une valeur longue reste
 * lisible — en ligne, le retour à la ligne brouillait le sens de la flèche.
 */
function FieldRow({ field }: { field: FieldChange }) {
  return (
    <div className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground/70 text-[10px] font-medium tracking-wider uppercase">
        {field.label}
      </dt>
      <dd className="flex flex-col gap-0.5 text-xs">
        <span className="flex items-start gap-1.5">
          <Minus
            aria-hidden
            className="text-muted-foreground/40 mt-[3px] h-3 w-3 shrink-0"
            strokeWidth={2.5}
          />
          <FieldValue value={field.before} tone="before" />
        </span>
        <span className="flex items-start gap-1.5">
          <ArrowRight
            aria-hidden
            className="text-primary/70 mt-[3px] h-3 w-3 shrink-0"
            strokeWidth={2.5}
          />
          <FieldValue value={field.after} tone="after" />
        </span>
      </dd>
    </div>
  )
}

function FieldValue({
  value,
  tone,
}: {
  value: string
  tone: 'before' | 'after'
}) {
  if (!value) {
    return (
      <span className="text-muted-foreground/50 italic">
        {tone === 'before' ? 'non renseigné' : 'vidé'}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'min-w-0 break-words',
        tone === 'before'
          ? 'text-muted-foreground/70 line-through decoration-1'
          : 'text-foreground font-medium',
      )}
    >
      {value}
    </span>
  )
}
