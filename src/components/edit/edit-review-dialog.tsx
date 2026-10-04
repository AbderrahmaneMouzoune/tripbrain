'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type {
  ChangeKind,
  DayChangeSummary,
  EntityChange,
  FieldChange,
} from '@/lib/itinerary-diff'
import { useEditSession } from '@/components/app/edit-session'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  Minus,
  PencilLine,
  Plus,
  Smartphone,
  Undo2,
} from 'lucide-react'

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
  added: 'bg-success-soft text-success',
  removed: 'bg-destructive-soft text-destructive',
  updated: 'bg-primary-soft text-primary-strong',
  moved: 'bg-accent-soft text-accent',
}

/**
 * Récapitulatif du mode édition, en feuille du bas : modifications groupées
 * par journée, avant → après, puis enregistrer, continuer ou tout annuler.
 * Branché sur la session d'édition ; `EditChrome` le monte une fois.
 */
export function EditReviewSheet() {
  const {
    reviewOpen,
    reviewIntent,
    setReviewOpen,
    changeSummaries,
    pendingChanges,
    saveEdits,
    discardEdits,
  } = useEditSession()
  const [discarding, setDiscarding] = useState(false)

  const saving = reviewIntent === 'save'
  const plural = pendingChanges > 1 ? 's' : ''
  const title = saving
    ? 'Enregistrer les modifications ?'
    : 'Tout annuler et repartir de zéro ?'
  const description =
    pendingChanges === 0
      ? 'Aucune modification depuis l’ouverture du mode édition.'
      : saving
        ? `${pendingChanges} modification${plural} depuis l’ouverture du mode édition.`
        : `${pendingChanges} modification${plural} ${pendingChanges > 1 ? 'seront perdues' : 'sera perdue'} : le voyage reviendra à son état d’avant le mode édition.`

  const discard = async () => {
    setDiscarding(true)
    try {
      await discardEdits()
    } finally {
      setDiscarding(false)
    }
  }

  const saveButton = (primary: boolean) => (
    <Button
      type="button"
      size={primary ? 'xl' : 'lg2'}
      variant={primary ? 'default' : 'outline'}
      className="w-full"
      onClick={saveEdits}
    >
      {primary && <Check aria-hidden strokeWidth={2.5} />}
      {primary ? 'Enregistrer' : 'Garder mes modifications'}
    </Button>
  )

  return (
    <BottomSheet
      open={reviewOpen}
      onOpenChange={setReviewOpen}
      title={title}
      description={description}
      hideHeader
      footer={
        <div className="flex flex-col gap-2.5">
          {saving ? (
            saveButton(true)
          ) : (
            <Button
              type="button"
              size="xl"
              variant="destructive"
              className="w-full"
              disabled={discarding}
              onClick={discard}
            >
              <Undo2 aria-hidden strokeWidth={2.25} />
              Tout annuler
            </Button>
          )}
          <Button
            type="button"
            size="lg2"
            variant="outline"
            className="w-full"
            onClick={() => setReviewOpen(false)}
          >
            Continuer à modifier
          </Button>
          {saving ? (
            <button
              type="button"
              disabled={discarding}
              onClick={discard}
              className="text-destructive focus-visible:ring-destructive/40 flex min-h-11 items-center gap-1.5 self-center rounded-xl px-3.5 text-[15px] font-extrabold outline-none focus-visible:ring-[3px] disabled:opacity-50"
            >
              <Undo2 aria-hidden className="size-[18px]" strokeWidth={2.25} />
              Tout annuler
            </button>
          ) : (
            <button
              type="button"
              onClick={saveEdits}
              className="text-primary-strong focus-visible:ring-ring/50 min-h-11 self-center rounded-xl px-3.5 text-[15px] font-extrabold outline-none focus-visible:ring-[3px]"
            >
              Garder mes modifications
            </button>
          )}
        </div>
      }
    >
      {/* Le titre et la description ci-dessus sont déjà lus via la feuille. */}
      <div aria-hidden className="flex items-start gap-3 pt-2">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-[14px]',
            saving
              ? 'bg-primary-soft text-primary'
              : 'bg-destructive-soft text-destructive',
          )}
        >
          {saving ? (
            <Check className="size-5" strokeWidth={2.5} />
          ) : (
            <Undo2 className="size-5" strokeWidth={2.25} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl leading-tight">{title}</p>
          <p className="text-muted-foreground mt-1 text-sm leading-snug">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {changeSummaries.map((summary) => (
          <DaySummary key={summary.dayId} summary={summary} />
        ))}
      </div>

      {saving && (
        <p className="bg-background text-muted-foreground mt-3 flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-xs leading-snug font-bold">
          <Smartphone aria-hidden className="size-[18px] shrink-0" />
          Enregistré sur cet appareil. Pour vos compagnons, repartagez le
          voyage.
        </p>
      )}
    </BottomSheet>
  )
}

/** Modifications d'une journée, sous son en-tête « Jour 5 · Pékin ». */
function DaySummary({ summary }: { summary: DayChangeSummary }) {
  const headingId = `review-${summary.dayId}`

  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="text-secondary-strong mb-2 text-[11px] font-black tracking-[0.1em] uppercase"
      >
        {summary.title}
      </h3>
      <ul className="border-border divide-border/70 overflow-hidden rounded-[20px] border">
        {summary.changes.map((change) => (
          <ChangeItem key={change.id} change={change} />
        ))}
      </ul>
    </section>
  )
}

/** Une entité touchée : sa nature, son nom, et le détail avant → après. */
function ChangeItem({ change }: { change: EntityChange }) {
  const Icon = KIND_ICONS[change.kind]
  const name = change.name ?? change.scope

  return (
    <li className="border-border/70 flex flex-col gap-2 border-t p-3.5 first:border-t-0">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-6 shrink-0 items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-black',
            KIND_CLASSES[change.kind],
          )}
        >
          <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
          {KIND_LABELS[change.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-black">
          {name}
        </span>
      </div>

      {change.name && change.fields.length === 0 && (
        <p className="text-muted-foreground text-[13px] font-bold">
          {change.scope}
        </p>
      )}

      {change.fields.length > 0 && (
        <dl className="flex flex-col gap-1.5">
          {change.fields.map((field) => (
            <FieldRow key={field.label} field={field} />
          ))}
        </dl>
      )}
    </li>
  )
}

/** Un champ modifié : l'ancienne valeur barrée, la nouvelle après la flèche. */
function FieldRow({ field }: { field: FieldChange }) {
  return (
    <div className="flex items-start gap-2 text-[13px] font-extrabold">
      <dt className="text-muted-foreground w-[76px] shrink-0 pt-0.5 break-words">
        {field.label}
      </dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <span className="sr-only">avant :</span>
        <FieldValue value={field.before} tone="before" />
        <ArrowRight
          aria-hidden
          className="text-muted-foreground size-3.5 shrink-0"
          strokeWidth={2.5}
        />
        <span className="sr-only">après :</span>
        <FieldValue value={field.after} tone="after" />
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
      <span className="text-muted-foreground px-1 font-semibold italic">
        {tone === 'before' ? 'non renseigné' : 'vidé'}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'max-w-full rounded-lg px-2 py-0.5 break-words',
        tone === 'before'
          ? 'bg-background text-muted-foreground line-through'
          : 'bg-primary-soft text-primary-strong',
      )}
    >
      {value}
    </span>
  )
}
