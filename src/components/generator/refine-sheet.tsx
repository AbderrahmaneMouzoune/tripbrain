'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import {
  IconArrowRight,
  IconArrowsExchange,
  IconCheck,
  IconMinus,
  IconPencil,
  IconPlus,
  IconSend,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { Chip } from '@/components/mobile/chip'
import { trackEvent } from '@/lib/analytics/client'
import {
  GeneratorRequestError,
  isAbortError,
  requestRefinement,
} from '@/lib/generator/api'
import { FAILURE_MESSAGES } from '@/lib/generator/errors'
import { replaceGeneratedItinerary } from '@/lib/generator/generation-store'
import { addDays } from '@/lib/generator/itinerary-quality'
import {
  toDayItineraries,
  type GeneratedItinerary,
} from '@/lib/generator/itinerary-schema'
import { MAX_INSTRUCTION_LENGTH } from '@/lib/generator/requests'
import { groupByCity } from '@/lib/generator/review'
import {
  countChanges,
  summarizeItineraryChanges,
  type ChangeKind,
  type DayChangeSummary,
} from '@/lib/itinerary-diff'
import { cn } from '@/lib/utils'

/** Demandes génériques, valables pour n'importe quel voyage. */
const GENERIC_SUGGESTIONS = [
  'Moins de musées',
  'Plus de street food',
  'Éviter les trajets avant 8 h',
  'Un rythme plus calme',
]

/** Nombre de changements montrés par journée avant « et n autres ». */
const CHANGES_PER_DAY = 3

const KIND_STYLE: Record<
  ChangeKind,
  { label: string; className: string; icon: typeof IconPlus }
> = {
  added: {
    label: 'Ajout',
    className: 'bg-success-soft text-success',
    icon: IconPlus,
  },
  removed: {
    label: 'Suppression',
    className: 'bg-destructive-soft text-destructive',
    icon: IconMinus,
  },
  updated: {
    label: 'Modification',
    className: 'bg-primary-soft text-primary',
    icon: IconPencil,
  },
  moved: {
    label: 'Déplacement',
    className: 'bg-primary-soft text-primary',
    icon: IconArrowsExchange,
  },
}

/**
 * Suggestions du moment : les génériques, plus une journée libre dans la
 * ville où le voyage s'attarde le plus — tirée des vraies données, jamais
 * inventée.
 */
function suggestionsFor(itinerary: GeneratedItinerary): string[] {
  const stops = groupByCity(toDayItineraries(itinerary))
  const longest = [...stops].sort(
    (a, b) => b.dayIndexes.length - a.dayIndexes.length,
  )[0]
  const own =
    longest && longest.dayIndexes.length >= 2
      ? [`Une journée libre à ${longest.city}`]
      : []
  return [...GENERIC_SUGGESTIONS.slice(0, 1), ...own, ...GENERIC_SUGGESTIONS.slice(1)]
}

type Proposal = {
  itinerary: GeneratedItinerary
  summaries: DayChangeSummary[]
  count: number
}

/**
 * Feuille « Que voulez-vous changer ? » : une demande en langage naturel, une
 * proposition complète du modèle, et l'écart avant/après — calculé par le
 * même comparateur que la relecture du mode édition — à appliquer ou non.
 */
export function RefineSheet({
  open,
  onOpenChange,
  itinerary,
  startDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itinerary: GeneratedItinerary
  startDate: string
}) {
  const [input, setInput] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const suggestions = useMemo(() => suggestionsFor(itinerary), [itinerary])

  const reset = () => {
    controller.current?.abort()
    controller.current = null
    setSent(null)
    setPending(false)
    setProposal(null)
    setError(null)
  }

  const close = () => {
    reset()
    onOpenChange(false)
  }

  const send = async (instruction: string) => {
    const text = instruction.trim()
    if (text.length < 3 || pending) return
    controller.current?.abort()
    const own = new AbortController()
    controller.current = own
    setSent(text)
    setInput('')
    setProposal(null)
    setError(null)
    setPending(true)
    try {
      const next = await requestRefinement(
        { itinerary, instruction: text, startDate },
        own.signal,
      )
      if (controller.current !== own) return
      const summaries = summarizeItineraryChanges(
        toDayItineraries(itinerary),
        toDayItineraries(next),
      )
      setProposal({ itinerary: next, summaries, count: countChanges(summaries) })
    } catch (caught) {
      if (controller.current !== own || isAbortError(caught)) return
      const failure =
        caught instanceof GeneratorRequestError
          ? caught
          : new GeneratorRequestError('unknown')
      trackEvent('generator_failed', { step: 'refine', reason: failure.reason })
      setError(failure.message || FAILURE_MESSAGES[failure.reason])
    } finally {
      if (controller.current === own) {
        controller.current = null
        setPending(false)
      }
    }
  }

  const decide = (applied: boolean) => {
    if (!proposal) return
    trackEvent('generator_refined', {
      applied,
      changes_count: proposal.count,
    })
    if (applied) {
      replaceGeneratedItinerary(proposal.itinerary)
      close()
    } else {
      setProposal(null)
      setSent(null)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send(input)
  }

  const before = itinerary.days.length
  const after = proposal?.itinerary.days.length ?? before
  const returnLabel = new Date(
    `${addDays(startDate, Math.max(0, after - 1))}T00:00:00`,
  ).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Que voulez-vous changer ?"
      hideHeader
      className="bg-card"
    >
      <div className="flex items-center gap-3 pt-1">
        <h2 className="font-display flex-1 text-2xl leading-[1.2]">
          Que voulez-vous changer ?
        </h2>
        <Button
          variant="outline"
          size="icon-round"
          aria-label="Fermer"
          onClick={close}
          className="bg-background border-border shadow-none"
        >
          <IconX />
        </Button>
      </div>

      <div
        role="group"
        aria-label="Suggestions"
        className="mt-3 flex flex-wrap gap-2"
      >
        {suggestions.map((suggestion) => (
          <Chip
            key={suggestion}
            className="text-[13px]"
            onClick={() => void send(suggestion)}
          >
            {suggestion}
          </Chip>
        ))}
      </div>

      {sent && (
        <div className="mt-3.5 flex justify-end">
          <p className="bg-primary text-primary-foreground animate-pop max-w-[80%] rounded-[18px_18px_4px_18px] px-3.5 py-2.5 text-sm leading-[1.4] font-bold">
            {sent}
          </p>
        </div>
      )}

      <div aria-live="polite">
        {pending && (
          <div className="bg-background border-border mt-2.5 flex items-center gap-2.5 rounded-[20px] border p-3.5">
            <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-[10px]">
              <IconSparkles className="size-[18px] animate-pulse" aria-hidden />
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <p className="text-sm font-extrabold">On prépare les changements…</p>
              <span className="animate-shimmer-soft bg-muted h-3 w-3/4 rounded-md" />
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="bg-destructive-soft text-destructive mt-2.5 rounded-2xl p-3.5 text-sm font-bold"
          >
            {error}
          </p>
        )}

        {proposal && (
          <div className="bg-background border-border animate-rise mt-2.5 flex flex-col gap-2.5 rounded-[20px] border p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-[10px]">
                <IconSparkles className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-black">
                  {proposal.count === 0
                    ? 'Aucun changement proposé'
                    : `${proposal.count} changement${proposal.count > 1 ? 's' : ''} proposé${proposal.count > 1 ? 's' : ''}`}
                </p>
                <p className="text-muted-foreground text-xs">
                  {after === before
                    ? `Toujours ${after} jour${after > 1 ? 's' : ''}, retour le ${returnLabel}`
                    : `${after} jours au lieu de ${before}, retour le ${returnLabel}`}
                </p>
              </div>
            </div>

            {proposal.summaries.length > 0 && (
              <ul className="bg-card border-border/60 max-h-[38dvh] overflow-y-auto rounded-[14px] border px-3 py-1">
                {proposal.summaries.map((summary) => (
                  <li
                    key={summary.dayId}
                    className="border-border/60 py-2 [&:not(:first-child)]:border-t"
                  >
                    <p className="text-sm font-extrabold">{summary.title}</p>
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {summary.changes
                        .slice(0, CHANGES_PER_DAY)
                        .map((change) => {
                          const style = KIND_STYLE[change.kind]
                          const Icon = style.icon
                          return (
                            <li
                              key={`${change.kind}-${change.id}`}
                              className="flex items-center gap-2.5"
                            >
                              <span
                                role="img"
                                aria-label={style.label}
                                className={cn(
                                  'flex size-[26px] shrink-0 items-center justify-center rounded-full',
                                  style.className,
                                )}
                              >
                                <Icon className="size-3.5" aria-hidden />
                              </span>
                              <span
                                className={cn(
                                  'min-w-0 flex-1 text-[13px] leading-snug',
                                  change.kind === 'removed' &&
                                    'text-muted-foreground line-through',
                                )}
                              >
                                <span className="font-extrabold">
                                  {change.scope}
                                  {change.name ? ` « ${change.name} »` : ''}
                                </span>
                                {change.fields.length > 0 && (
                                  <span className="text-muted-foreground">
                                    {' '}
                                    ·{' '}
                                    {change.fields
                                      .map((field) => field.label)
                                      .join(', ')}
                                  </span>
                                )}
                              </span>
                            </li>
                          )
                        })}
                      {summary.changes.length > CHANGES_PER_DAY && (
                        <li className="text-muted-foreground pl-9 text-xs">
                          et {summary.changes.length - CHANGES_PER_DAY} autre
                          {summary.changes.length - CHANGES_PER_DAY > 1
                            ? 's'
                            : ''}
                        </li>
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg2"
                className="flex-1 border-[1.5px] font-extrabold"
                onClick={() => decide(false)}
              >
                Annuler
              </Button>
              <Button
                size="lg2"
                className="flex-1 font-extrabold"
                disabled={proposal.count === 0}
                onClick={() => decide(true)}
              >
                <IconCheck aria-hidden />
                Appliquer
              </Button>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-primary ring-ring/30 bg-card focus-within:ring-ring/40 mt-3.5 flex items-center gap-2 rounded-[18px] border-[1.5px] py-1 pr-1 pl-3.5 ring-4"
      >
        <label htmlFor="generator-refine-input" className="sr-only">
          Votre demande
        </label>
        <input
          id="generator-refine-input"
          value={input}
          maxLength={MAX_INSTRUCTION_LENGTH}
          placeholder={sent ? 'Autre chose à changer ?' : 'Ex. ajoute une nuit à la mer'}
          onChange={(event) => setInput(event.target.value)}
          className="text-foreground placeholder:text-muted-foreground/70 h-11 min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none"
        />
        <Button
          type="submit"
          size="icon-round"
          aria-label="Envoyer"
          disabled={pending || input.trim().length < 3}
          className="rounded-[14px]"
        >
          {pending ? <IconArrowRight className="animate-pulse" /> : <IconSend />}
        </Button>
      </form>
    </BottomSheet>
  )
}
