'use client'

import { useId, useState, type ReactNode } from 'react'
import {
  IconArrowLeft,
  IconArrowRight,
  IconBus,
  IconInfoCircle,
  IconPencil,
  IconSparkles,
  IconToolsKitchen2,
  IconWalk,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/mobile/segmented-control'
import {
  ChipGroup,
  CountStepper,
  DurationStepper,
  FieldLabel,
  RadioCards,
  StartDateField,
  TextAreaField,
} from '@/components/generator/generator-controls'
import { isUsableStartDate } from '@/components/generator/express-form'
import { useGeneratorDraft } from '@/components/generator/use-generator-store'
import { updateGeneratorDraft } from '@/lib/generator/generation-store'
import { formatTripRange } from '@/lib/generator/review'
import {
  BUDGETS,
  DAY_STARTS,
  DIETS,
  FAMILIARITY_LEVELS,
  INTERESTS,
  labelOf,
  labelsOf,
  MOBILITIES,
  OCCASIONS,
  PACES,
  SPLURGES,
  TRANSPORTS,
  TRAVEL_TIMES,
  TRAVELER_GROUPS,
  TRIP_SHAPES,
  estimatedBudget,
  partySize,
  withGroup,
  withMobility,
  withOccasion,
  withParty,
  type TripBrief,
} from '@/lib/generator/trip-brief'
import { cn } from '@/lib/utils'

/**
 * Le questionnaire, une question par écran.
 *
 * Il couvre tout `trip-brief.ts`, regroupé en douze étapes pour que chacune
 * tienne sur un écran de téléphone sans défiler, puis un récapitulatif avant
 * de lancer. Seules la destination et la date sont obligatoires : tout le
 * reste peut être passé, et ce qui est passé n'apparaît pas dans le prompt.
 */

interface StepContext {
  brief: TripBrief
  setBrief: (brief: TripBrief) => void
  startDate: string
  durationDays: number
  titleId: string
}

interface Step {
  eyebrow: string
  title: string
  description?: string
  /** Étape obligatoire : ni « Passer », ni « Suivant » tant qu'elle est vide. */
  isComplete?: (context: StepContext) => boolean
  render: (context: StepContext) => ReactNode
}

/** Symboles du budget, du plus serré au plus large ; le libellé reste lu. */
const BUDGET_SYMBOLS = ['€', '€€', '€€€', '€€€€']

const euros = (amount: number) => `${amount.toLocaleString('fr-FR')} €`

const STEPS: Step[] = [
  {
    eyebrow: 'Destination',
    title: 'Où partez-vous ?',
    description: 'Un pays, une région, quelques villes : comme vous le diriez.',
    isComplete: ({ brief }) => brief.destination.trim().length >= 2,
    render: ({ brief, setBrief }) => (
      <div className="flex flex-col gap-4">
        <TextAreaField
          label="Destination"
          rows={3}
          value={brief.destination}
          placeholder="Japon — Tokyo, Kyoto et un détour par Nara"
          onChange={(destination) => setBrief({ ...brief, destination })}
        />
        <TextAreaField
          label="Ville de départ (facultatif)"
          rows={1}
          value={brief.origin}
          placeholder="Paris"
          onChange={(origin) => setBrief({ ...brief, origin })}
        />
      </div>
    ),
  },
  {
    eyebrow: 'Dates',
    title: 'Quand, et pour combien de temps ?',
    description: 'Chaque journée sera datée à partir du départ.',
    isComplete: ({ startDate }) => isUsableStartDate(startDate),
    render: ({ startDate, durationDays }) => (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-2.5">
          <StartDateField
            value={startDate}
            onChange={(value) => updateGeneratorDraft({ startDate: value })}
          />
          <DurationStepper
            value={durationDays}
            onChange={(value) => updateGeneratorDraft({ durationDays: value })}
          />
        </div>
        {isUsableStartDate(startDate) && (
          <p className="text-muted-foreground text-sm font-bold">
            {formatTripRange(startDate, durationDays)}
          </p>
        )}
      </div>
    ),
  },
  {
    eyebrow: 'Le voyage',
    title: 'Comment découper le séjour ?',
    render: ({ brief, setBrief, titleId }) => (
      <RadioCards
        labelledBy={titleId}
        options={TRIP_SHAPES}
        value={brief.shape}
        onChange={(shape) => setBrief({ ...brief, shape })}
      />
    ),
  },
  {
    eyebrow: 'Les voyageurs',
    title: 'Qui part ?',
    render: ({ brief, setBrief, titleId }) => (
      <div className="flex flex-col gap-4">
        <RadioCards
          labelledBy={titleId}
          options={TRAVELER_GROUPS}
          value={brief.group}
          onChange={(group) => setBrief(withGroup(brief, group))}
        />
        <div className="flex flex-col gap-2">
          <CountStepper
            label="Adultes"
            value={brief.adults}
            min={0}
            max={30}
            onChange={(adults) => setBrief(withParty(brief, { adults }))}
          />
          <CountStepper
            label="Enfants"
            value={brief.children}
            min={0}
            max={30}
            onChange={(children) => setBrief(withParty(brief, { children }))}
          />
        </div>
        {brief.children > 0 && (
          <TextAreaField
            label="Âge des enfants"
            rows={1}
            value={brief.childrenAges}
            placeholder="4 et 9 ans"
            onChange={(childrenAges) => setBrief({ ...brief, childrenAges })}
          />
        )}
      </div>
    ),
  },
  {
    eyebrow: 'Les voyageurs',
    title: 'Vous connaissez déjà ?',
    render: ({ brief, setBrief, titleId }) => (
      <RadioCards
        labelledBy={titleId}
        options={FAMILIARITY_LEVELS}
        value={brief.familiarity}
        onChange={(familiarity) => setBrief({ ...brief, familiarity })}
      />
    ),
  },
  {
    eyebrow: 'Rythme',
    title: 'Quel rythme vous ressemble ?',
    render: (context) => <PaceAndBudget {...context} />,
  },
  {
    eyebrow: 'Horaires',
    title: 'À quoi ressemble une journée ?',
    render: ({ brief, setBrief }) => (
      <div className="flex flex-col gap-5">
        <SegmentedField
          label="Début de journée"
          options={DAY_STARTS}
          value={brief.dayStart}
          onChange={(dayStart) => setBrief({ ...brief, dayStart })}
        />
        <SegmentedField
          label="Trajets par jour, au maximum"
          options={TRAVEL_TIMES}
          value={brief.maxTravelTime}
          onChange={(maxTravelTime) => setBrief({ ...brief, maxTravelTime })}
        />
      </div>
    ),
  },
  {
    eyebrow: 'Budget',
    title: 'Où vous faire plaisir ?',
    description: 'Les postes où dépenser un peu plus, si ça en vaut la peine.',
    render: ({ brief, setBrief }) => (
      <ChipGroup
        label="Vos petites folies"
        options={SPLURGES}
        values={brief.splurges}
        onChange={(splurges) => setBrief({ ...brief, splurges })}
      />
    ),
  },
  {
    eyebrow: 'Envies',
    title: 'Qu’est-ce qui vous fait voyager ?',
    description:
      'Dans l’ordre où vous les touchez : la première compte le plus.',
    render: ({ brief, setBrief }) => (
      <ChipGroup
        label="Centres d’intérêt"
        options={INTERESTS}
        values={brief.interests}
        onChange={(interests) => setBrief({ ...brief, interests })}
      />
    ),
  },
  {
    eyebrow: 'Envies',
    title: 'Des incontournables, des choses à éviter ?',
    render: ({ brief, setBrief }) => (
      <div className="flex flex-col gap-4">
        <TextAreaField
          label="À inclure absolument"
          value={brief.mustSee}
          placeholder="Le marché Nishiki, une nuit dans un ryokan"
          onChange={(mustSee) => setBrief({ ...brief, mustSee })}
        />
        <TextAreaField
          label="À éviter"
          value={brief.avoid}
          placeholder="Les files d’attente de plus d’une heure"
          onChange={(avoid) => setBrief({ ...brief, avoid })}
        />
        <ChipGroup
          label="Une occasion à fêter ?"
          single
          options={OCCASIONS}
          values={brief.occasion ? [brief.occasion] : []}
          onChange={([occasion = '']) =>
            setBrief(withOccasion(brief, occasion))
          }
        />
      </div>
    ),
  },
  {
    eyebrow: 'Réservations',
    title: 'Quelque chose est déjà réservé ?',
    description:
      'Vols, nuits, billets : l’itinéraire se construit autour, horaires compris.',
    render: ({ brief, setBrief }) => (
      <TextAreaField
        label="Déjà réservé"
        rows={4}
        value={brief.booked}
        placeholder="Vol Paris–Tokyo, arrivée le premier jour à 14 h 05"
        onChange={(booked) => setBrief({ ...brief, booked })}
      />
    ),
  },
  {
    eyebrow: 'Contraintes',
    title: 'Des contraintes à prendre en compte ?',
    description:
      'Choisissez tout ce qui s’applique, même pour une seule personne.',
    render: ({ brief, setBrief }) => (
      <div className="flex flex-col gap-4">
        <ChipGroup
          label="Alimentation"
          icon={IconToolsKitchen2}
          options={DIETS}
          values={brief.diets}
          onChange={(diets) => setBrief({ ...brief, diets })}
        />
        <ChipGroup
          label="Mobilité"
          icon={IconWalk}
          options={MOBILITIES}
          values={brief.mobility}
          onChange={(mobility) => setBrief(withMobility(brief, mobility))}
        />
        <ChipGroup
          label="Transports préférés"
          icon={IconBus}
          options={TRANSPORTS}
          values={brief.transports}
          onChange={(transports) => setBrief({ ...brief, transports })}
        />
        <TextAreaField
          label="Autre chose ?"
          value={brief.extra}
          placeholder="On fête un anniversaire le 18 avril"
          onChange={(extra) => setBrief({ ...brief, extra })}
        />
      </div>
    ),
  },
]

export const QUESTION_COUNT = STEPS.length

function PaceAndBudget({ brief, setBrief, titleId }: StepContext) {
  const budgetTitleId = useId()
  const estimate = estimatedBudget(brief)
  const budget = BUDGETS.find((option) => option.id === brief.budget)
  return (
    <div className="flex flex-col">
      <RadioCards
        labelledBy={titleId}
        options={PACES}
        value={brief.pace}
        badges={{ balanced: 'Conseillé' }}
        onChange={(pace) => setBrief({ ...brief, pace })}
      />
      <div className="bg-border my-6 h-px" />
      <div className="flex flex-col gap-2.5">
        <h2 id={budgetTitleId} className="text-[17px] font-black">
          Budget par jour et par personne
        </h2>
        <div
          role="radiogroup"
          aria-labelledby={budgetTitleId}
          className="bg-muted grid grid-cols-4 gap-1 rounded-[14px] p-1"
        >
          {BUDGETS.map((option, index) => {
            const active = option.id === brief.budget
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${option.label}, ${option.hint ?? ''}`}
                onClick={() =>
                  setBrief({ ...brief, budget: active ? '' : option.id })
                }
                className={cn(
                  'pressable focus-visible:ring-ring/50 h-11 rounded-[10px] text-base font-black tracking-[0.04em] outline-none focus-visible:ring-[3px]',
                  active
                    ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(14,26,58,0.15)]'
                    : 'text-muted-foreground',
                )}
              >
                {BUDGET_SYMBOLS[index]}
              </button>
            )
          })}
        </div>
        <div className="bg-card border-border flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3">
          <IconInfoCircle
            className="text-primary size-5 shrink-0"
            aria-hidden
          />
          <p className="text-muted-foreground flex-1 text-[13px] leading-[1.45]">
            {budget && estimate !== null ? (
              <>
                <span className="text-foreground font-black">
                  ~{euros(estimate)}
                </span>{' '}
                hors vols et hébergement · {budget.label.toLowerCase()},{' '}
                {euros(budget.perDay)} × {partySize(brief)} voyageur
                {partySize(brief) > 1 ? 's' : ''} × {brief.durationDays} jours
              </>
            ) : (
              'Choisissez une enveloppe : l’IA calibre les visites et les tables en conséquence.'
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

function SegmentedField({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: typeof DAY_STARTS
  value: string
  onChange: (value: string) => void
}) {
  const selected = options.find((option) => option.id === value)
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>{label}</FieldLabel>
      <SegmentedControl
        label={label}
        options={options.map((option) => ({
          value: option.id,
          label: option.label,
        }))}
        value={value || null}
        onChange={onChange}
      />
      {selected?.hint && (
        <p className="text-muted-foreground px-1 text-[13px]">
          {selected.hint}
        </p>
      )}
    </div>
  )
}

/** Une ligne du récapitulatif, quand la question a une réponse. */
function summarize(
  brief: TripBrief,
): { label: string; value: string; step: number }[] {
  const rows: { label: string; value: string; step: number }[] = []
  const push = (label: string, value: string, step: number) => {
    if (value.trim()) rows.push({ label, value, step })
  }
  push('Destination', brief.destination, 0)
  push('Départ de', brief.origin, 0)
  push('Découpage', labelOf(TRIP_SHAPES, brief.shape), 2)
  const party = [
    brief.adults > 0
      ? `${brief.adults} adulte${brief.adults > 1 ? 's' : ''}`
      : '',
    brief.children > 0
      ? `${brief.children} enfant${brief.children > 1 ? 's' : ''}`
      : '',
  ]
    .filter(Boolean)
    .join(', ')
  push(
    'Voyageurs',
    [labelOf(TRAVELER_GROUPS, brief.group), party].filter(Boolean).join(' · '),
    3,
  )
  push('Connaissance', labelOf(FAMILIARITY_LEVELS, brief.familiarity), 4)
  push(
    'Rythme et budget',
    [labelOf(PACES, brief.pace), labelOf(BUDGETS, brief.budget)]
      .filter(Boolean)
      .join(' · '),
    5,
  )
  push(
    'Journées',
    [
      labelOf(DAY_STARTS, brief.dayStart),
      labelOf(TRAVEL_TIMES, brief.maxTravelTime),
    ]
      .filter(Boolean)
      .join(' · '),
    6,
  )
  push('Petites folies', labelsOf(SPLURGES, brief.splurges), 7)
  push('Envies', labelsOf(INTERESTS, brief.interests), 8)
  push('Incontournables', brief.mustSee, 9)
  push('À éviter', brief.avoid, 9)
  push('Occasion', labelOf(OCCASIONS, brief.occasion), 9)
  push('Déjà réservé', brief.booked, 10)
  push(
    'Contraintes',
    [
      labelsOf(DIETS, brief.diets),
      labelsOf(MOBILITIES, brief.mobility),
      labelsOf(TRANSPORTS, brief.transports),
    ]
      .filter(Boolean)
      .join(' · '),
    11,
  )
  push('À savoir', brief.extra, 11)
  return rows
}

export function BriefQuestionnaire({
  onBack,
  onGenerate,
}: {
  /** Retour au formulaire express, depuis la première question. */
  onBack: () => void
  onGenerate: () => void
}) {
  const draft = useGeneratorDraft()
  const [index, setIndex] = useState(0)
  const titleId = useId()

  const brief: TripBrief = { ...draft.brief, durationDays: draft.durationDays }
  const context: StepContext = {
    brief,
    setBrief: (next) => updateGeneratorDraft({ brief: next }),
    startDate: draft.startDate,
    durationDays: draft.durationDays,
    titleId,
  }

  const isRecap = index >= STEPS.length
  const step = STEPS[index]
  const complete = step?.isComplete ? step.isComplete(context) : true
  const required = Boolean(step?.isComplete)
  const canGenerate = STEPS.every(
    (item) => !item.isComplete || item.isComplete(context),
  )

  const goBack = () => (index === 0 ? onBack() : setIndex(index - 1))
  const goNext = () => setIndex(Math.min(STEPS.length, index + 1))

  const shown = Math.min(index + 1, STEPS.length)

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <div className="flex items-center gap-3.5 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
          <Button
            variant="outline"
            size="icon-round"
            onClick={goBack}
            aria-label={
              index === 0 ? 'Retour à la description' : 'Question précédente'
            }
            className="border-border bg-card shrink-0 shadow-none"
          >
            <IconArrowLeft />
          </Button>
          <div className="flex flex-1 flex-col gap-[7px]">
            <span className="text-muted-foreground text-[13px] font-extrabold">
              {isRecap
                ? 'Récapitulatif'
                : `Question ${shown} sur ${STEPS.length}`}
            </span>
            <span
              role="progressbar"
              aria-label="Avancement du questionnaire"
              aria-valuemin={0}
              aria-valuemax={STEPS.length}
              aria-valuenow={shown}
              className="bg-border block h-1 overflow-hidden rounded-full"
            >
              <span
                className="bg-primary block h-1 rounded-full transition-[width] duration-500"
                style={{ width: `${(shown / STEPS.length) * 100}%` }}
              />
            </span>
          </div>
          {!isRecap && !required ? (
            <button
              type="button"
              onClick={() => setIndex(STEPS.length)}
              className="text-muted-foreground flex min-h-11 min-w-11 items-center justify-end text-[13px] font-extrabold"
            >
              Tout passer
            </button>
          ) : (
            <span className="w-11 shrink-0" aria-hidden />
          )}
        </div>

        <div
          key={index}
          className="animate-screen flex flex-1 flex-col px-5 pt-6 pb-6"
        >
          {isRecap ? (
            <Recap
              brief={brief}
              startDate={draft.startDate}
              durationDays={draft.durationDays}
              missing={STEPS.flatMap((item, stepIndex) =>
                item.isComplete && !item.isComplete(context)
                  ? [{ label: item.eyebrow, step: stepIndex }]
                  : [],
              )}
              onEdit={setIndex}
            />
          ) : (
            <>
              <header className="mb-4 flex flex-col gap-1.5">
                <p className="text-secondary-strong text-xs font-black tracking-[0.08em] uppercase">
                  {step.eyebrow}
                </p>
                <h1
                  id={titleId}
                  className="font-display text-[28px] leading-[1.15]"
                >
                  {step.title}
                </h1>
                {step.description && (
                  <p className="text-muted-foreground text-sm leading-normal">
                    {step.description}
                  </p>
                )}
              </header>
              <div className="stagger flex flex-col">
                {step.render(context)}
              </div>
            </>
          )}
        </div>

        <div className="bg-background/95 sticky bottom-0 z-10 flex items-center gap-3 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] backdrop-blur">
          {isRecap ? (
            <Button
              size="xl"
              className="w-full"
              disabled={!canGenerate}
              onClick={onGenerate}
            >
              <IconSparkles aria-hidden />
              Générer mon itinéraire
            </Button>
          ) : (
            <>
              {!required && (
                <button
                  type="button"
                  onClick={goNext}
                  className="text-muted-foreground flex min-h-11 items-center px-4 text-[15px] font-extrabold"
                >
                  Passer
                </button>
              )}
              <Button
                size="xl"
                className="flex-1"
                disabled={!complete}
                onClick={goNext}
              >
                {index === STEPS.length - 1
                  ? 'Voir le récapitulatif'
                  : 'Suivant'}
                <IconArrowRight aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Recap({
  brief,
  startDate,
  durationDays,
  missing,
  onEdit,
}: {
  brief: TripBrief
  startDate: string
  durationDays: number
  /** Questions obligatoires sans réponse : rien ne part sans elles. */
  missing: { label: string; step: number }[]
  onEdit: (step: number) => void
}) {
  const rows = summarize(brief)
  return (
    <>
      <header className="mb-4 flex flex-col gap-1.5">
        <p className="text-secondary-strong text-xs font-black tracking-[0.08em] uppercase">
          Avant de générer
        </p>
        <h1 className="font-display text-[28px] leading-[1.15]">
          Votre voyage en bref
        </h1>
        <p className="text-muted-foreground text-sm leading-normal">
          {isUsableStartDate(startDate)
            ? `${formatTripRange(startDate, durationDays)} · ${durationDays} jour${durationDays > 1 ? 's' : ''}`
            : 'Date de départ à choisir'}
        </p>
      </header>
      {missing.length > 0 && (
        <div className="bg-destructive-soft mb-3 flex flex-col gap-2 rounded-[16px] p-3.5">
          <p className="text-destructive text-sm font-extrabold">
            Il manque une réponse obligatoire pour générer.
          </p>
          <div className="flex flex-wrap gap-2">
            {missing.map((item) => (
              <Button
                key={item.step}
                variant="outline"
                size="lg2"
                onClick={() => onEdit(item.step)}
              >
                Compléter : {item.label.toLowerCase()}
              </Button>
            ))}
          </div>
        </div>
      )}
      <dl className="bg-card border-border divide-border/70 flex flex-col divide-y rounded-[20px] border px-4">
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.step}`}
            className="flex items-start gap-3 py-2.5"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <dt className="text-muted-foreground text-xs font-extrabold">
                {row.label}
              </dt>
              <dd className="line-clamp-2 text-[15px] leading-snug font-bold">
                {row.value}
              </dd>
            </div>
            <button
              type="button"
              onClick={() => onEdit(row.step)}
              aria-label={`Modifier : ${row.label}`}
              className="text-primary-strong pressable focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
            >
              <IconPencil className="size-[18px]" aria-hidden />
            </button>
          </div>
        ))}
      </dl>
      {rows.length <= 2 && (
        <p className="text-muted-foreground mt-3 text-sm">
          Les questions passées ne figurent pas dans la demande : l’IA choisit
          pour vous.
        </p>
      )}
    </>
  )
}
