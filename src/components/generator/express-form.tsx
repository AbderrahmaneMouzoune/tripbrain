'use client'

import { useId } from 'react'
import { IconListDetails, IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/mobile/chip'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { OptionCard } from '@/components/mobile/option-card'
import {
  DurationStepper,
  FieldLabel,
  StartDateField,
} from '@/components/generator/generator-controls'
import { useGeneratorDraft } from '@/components/generator/use-generator-store'
import { updateGeneratorDraft } from '@/lib/generator/generation-store'
import {
  isPastDate,
  isValidIsoDate,
} from '@/lib/generator/itinerary-quality'
import {
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
} from '@/lib/generator/requests'
import { returnDate } from '@/lib/generator/trip-brief'
import {
  TRIP_DESCRIPTION_PLACEHOLDER,
  TRIP_EXAMPLES,
} from '@/lib/generator/trip-examples'

/** La date choisie est-elle exploitable : lisible, et pas dans le passé ? */
export function isUsableStartDate(value: string): boolean {
  return isValidIsoDate(value) && !isPastDate(value)
}

/**
 * Premier écran du générateur : une phrase, une date, une durée. Le
 * questionnaire reste à portée, mais facultatif.
 */
export function ExpressForm({
  onBack,
  onRefineWithQuestions,
  onGenerate,
}: {
  onBack: () => void
  onRefineWithQuestions: () => void
  onGenerate: () => void
}) {
  const draft = useGeneratorDraft()
  const helpId = useId()
  const descriptionId = useId()
  const counterId = useId()

  const description = draft.description
  const dateOk = isUsableStartDate(draft.startDate)
  const descriptionOk = description.trim().length >= MIN_DESCRIPTION_LENGTH
  const back = dateOk ? returnDate(draft.startDate, draft.durationDays) : null

  let hint: string
  if (draft.startDate && !dateOk) {
    hint = 'Cette date est déjà passée : choisissez un jour à venir.'
  } else if (back) {
    hint = `Retour le ${back.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}. Avec une date précise, aucun jour n’est inventé.`
  } else {
    hint =
      'Choisissez le premier jour du voyage : chaque journée est datée à partir de là.'
  }

  return (
    <MobileScreen
      onBack={onBack}
      progress={{ step: 1, total: 4 }}
      eyebrow="Créer un itinéraire"
      title="Décrivez votre voyage"
      description="Une phrase suffit. On s’occupe des villes, des trajets et des horaires."
      footer={
        <>
          <Button
            size="xl"
            className="w-full"
            disabled={!descriptionOk || !dateOk}
            onClick={onGenerate}
          >
            <IconSparkles aria-hidden />
            Générer mon itinéraire
          </Button>
          <p className="text-muted-foreground text-center text-xs leading-normal">
            {descriptionOk
              ? 'Environ 1 minute. Tout reste modifiable ensuite.'
              : 'Décrivez votre envie en quelques mots pour commencer.'}
          </p>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={descriptionId}>
          Votre envie, en quelques mots
        </FieldLabel>
        <div className="relative">
          <textarea
            id={descriptionId}
            rows={4}
            value={description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            placeholder={TRIP_DESCRIPTION_PLACEHOLDER}
            aria-describedby={counterId}
            onChange={(event) =>
              updateGeneratorDraft({ description: event.target.value })
            }
            className="border-border-strong bg-card text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-ring/40 h-[118px] w-full resize-none rounded-[18px] border-[1.5px] px-4 pt-3.5 pb-7 text-base leading-[1.45] font-bold outline-none focus:ring-4"
          />
          <span
            id={counterId}
            className="text-muted-foreground pointer-events-none absolute right-3.5 bottom-2.5 text-[11px] font-extrabold tabular-nums"
          >
            {description.length} / {MAX_DESCRIPTION_LENGTH}
          </span>
        </div>
        <div
          role="group"
          aria-label="Exemples de voyages"
          className="mt-0.5 flex flex-wrap gap-2"
        >
          {TRIP_EXAMPLES.map((example) => (
            <Chip
              key={example.label}
              className="text-[13px]"
              onClick={() =>
                updateGeneratorDraft({ description: example.prompt })
              }
            >
              {example.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-2.5">
        <StartDateField
          value={draft.startDate}
          describedBy={helpId}
          onChange={(startDate) => updateGeneratorDraft({ startDate })}
        />
        <DurationStepper
          value={draft.durationDays}
          onChange={(durationDays) => updateGeneratorDraft({ durationDays })}
        />
      </div>
      <p
        id={helpId}
        aria-live="polite"
        className={
          draft.startDate && !dateOk
            ? 'text-destructive mt-2 text-xs leading-[1.45] font-bold'
            : 'text-muted-foreground mt-2 text-xs leading-[1.45]'
        }
      >
        {hint}
      </p>

      <OptionCard
        className="mt-4 py-3.5"
        icon={IconListDetails}
        tone="accent"
        title="Affiner avec quelques questions"
        description="Facultatif · 2 min · rythme, budget, régimes"
        onClick={onRefineWithQuestions}
      />
    </MobileScreen>
  )
}
