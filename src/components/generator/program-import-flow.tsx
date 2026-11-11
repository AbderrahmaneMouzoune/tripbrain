'use client'

import { useRef, useState } from 'react'
import {
  IconCalendar,
  IconFileText,
  IconInfoCircle,
  IconUpload,
  IconX,
} from '@tabler/icons-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { useTrip } from '@/components/app/trip-provider'
import { GenerationResult } from '@/components/generator/generation-result'
import { LiveGeneration } from '@/components/generator/live-generation'
import { useGeneration } from '@/components/generator/use-generator-store'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { SegmentedControl } from '@/components/mobile/segmented-control'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics/client'
import {
  getGenerationState,
  resetGeneration,
  startGeneration,
  stopGeneration,
} from '@/lib/generator/generation-store'
import { toDayItineraries } from '@/lib/generator/itinerary-schema'
import {
  PROGRAM_FILE_ACCEPT,
  ProgramFileError,
  readProgramFile,
} from '@/lib/generator/program-file'
import {
  MAX_PROGRAM_TEXT_LENGTH,
  MIN_PROGRAM_TEXT_LENGTH,
  type ImportRequest,
  type ProgramSource,
} from '@/lib/generator/program-import'
import { triggerHaptic } from '@/lib/native-app'
import { recordHappyMoment } from '@/lib/review-prompt'
import { cn } from '@/lib/utils'

type Tab = 'text' | 'file'

const TABS = [
  { value: 'text', label: 'Coller le texte' },
  { value: 'file', label: 'Choisir un fichier' },
] as const

const PLACEHOLDER = [
  'Jour 1 – 12 mai – Lisbonne',
  'Arrivée 10h40, vol TP441. Hôtel Lisboa Plaza.',
  '14h Alfama à pied, château São Jorge',
  '',
  'Jour 2 – Sintra',
  'Train 9h12 depuis Rossio…',
].join('\n')

/** L'import en cours dans le magasin, s'il y en a un. */
function currentImport(): ImportRequest | null {
  const { request, status } = getGenerationState()
  return status !== 'idle' && request?.mode === 'import' ? request : null
}

/**
 * « J'ai déjà un programme » : le voyageur colle son programme ou choisit un
 * fichier, l'app le fait recopier fidèlement, puis montre ce qui a été repris
 * et ce qui manquait avant d'enregistrer.
 *
 * La lecture en direct, la relecture et la correction sont celles du
 * générateur, avec d'autres mots : l'état vit dans le même magasin, et
 * rouvrir cet écran retrouve un import en cours.
 */
export function ProgramImportScreen({
  onClose,
}: ScreenProps<'import-program'>) {
  const state = useGeneration()
  const { importSharedItinerary } = useTrip()
  const { replace } = useAppNav()
  const [view, setView] = useState<'form' | 'run'>(() =>
    currentImport() ? 'run' : 'form',
  )
  const [showPartial, setShowPartial] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const request = state.request?.mode === 'import' ? state.request : null

  const launch = (next: ImportRequest) => {
    setShowPartial(false)
    setView('run')
    void startGeneration(next)
  }

  const retry = () => {
    if (request) launch(request)
  }

  const save = async () => {
    const itinerary = state.itinerary
    if (!itinerary) return
    const days = toDayItineraries(itinerary, 'import')
    setSaving(true)
    setSaveError(null)
    try {
      await importSharedItinerary(days, {
        source: 'program',
        title: itinerary.tripTitle,
      })
      trackEvent('trip_imported', {
        source: 'program',
        days_count: days.length,
        activities_count: days.reduce(
          (sum, day) => sum + day.activities.length,
          0,
        ),
      })
      triggerHaptic('success')
      recordHappyMoment()
      resetGeneration()
      replace({ kind: 'trip-ready' })
    } catch {
      triggerHaptic('error')
      setSaveError('L’enregistrement a échoué. Réessayez.')
      setSaving(false)
    }
  }

  if (view === 'run' && request && state.status !== 'idle') {
    const showResult =
      state.itinerary &&
      (state.status === 'done' || (state.status === 'stopped' && showPartial))
    if (showResult && state.itinerary) {
      return (
        <GenerationResult
          state={state}
          itinerary={state.itinerary}
          onBack={
            state.status === 'stopped'
              ? () => setShowPartial(false)
              : () => setView('form')
          }
          onRegenerate={retry}
          onSave={save}
          saving={saving}
          saveError={saveError}
        />
      )
    }
    return (
      <LiveGeneration
        state={state}
        onClose={onClose}
        onStop={stopGeneration}
        onSeeResult={() => setShowPartial(true)}
        onRetry={retry}
        onEdit={() => setView('form')}
      />
    )
  }

  return (
    <ProgramImportForm
      initial={request}
      onBack={onClose}
      onSubmit={launch}
      onTripbrainFile={() => replace({ kind: 'import-file' })}
    />
  )
}

/** Le dépôt : texte collé ou fichier, et une date de départ facultative. */
function ProgramImportForm({
  initial,
  onBack,
  onSubmit,
  onTripbrainFile,
}: {
  /** L'import précédent, quand on revient le reprendre. */
  initial: ImportRequest | null
  onBack: () => void
  onSubmit: (request: ImportRequest) => void
  /** Vers l'import d'un fichier déjà au format de l'app (JSON, Excel, CSV). */
  onTripbrainFile: () => void
}) {
  const [tab, setTab] = useState<Tab>(initial?.fileName ? 'file' : 'text')
  const [text, setText] = useState(
    initial && !initial.fileName && initial.source.kind === 'text'
      ? initial.source.text
      : '',
  )
  const [file, setFile] = useState<{
    name: string
    source: ProgramSource
  } | null>(
    initial?.fileName
      ? { name: initial.fileName, source: initial.source }
      : null,
  )
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = text.trim()
  const ready =
    tab === 'text' ? trimmed.length >= MIN_PROGRAM_TEXT_LENGTH : Boolean(file)

  const pickFile = async (picked: File | undefined) => {
    if (!picked) return
    setError(null)
    setReading(true)
    try {
      const source = await readProgramFile(picked)
      setFile({ name: picked.name, source })
      triggerHaptic('selection')
    } catch (caught) {
      setFile(null)
      setError(
        caught instanceof ProgramFileError
          ? caught.message
          : 'Ce fichier n’a pas pu être lu. Réessayez, ou collez le texte du programme.',
      )
      triggerHaptic('error')
    } finally {
      setReading(false)
    }
  }

  const submit = () => {
    if (!ready) return
    const date = startDate || undefined
    if (tab === 'file' && file) {
      onSubmit({
        mode: 'import',
        source: file.source,
        startDate: date,
        fileName: file.name,
      })
    } else {
      onSubmit({
        mode: 'import',
        source: { kind: 'text', text: trimmed },
        startDate: date,
      })
    }
  }

  return (
    <MobileScreen
      onBack={onBack}
      progress={{ step: 2, total: 4 }}
      title="Apportez votre programme"
      description="Tel qu’il est : on le recopie sans rien inventer."
      footer={
        <>
          <Button
            size="xl"
            className="w-full"
            disabled={!ready}
            onClick={submit}
          >
            Importer mon programme
          </Button>
          <Button
            variant="link"
            className="text-muted-foreground min-h-11 text-[13px] font-bold"
            onClick={onTripbrainFile}
          >
            Fichier déjà au format TripBrain ?
          </Button>
        </>
      }
    >
      <SegmentedControl
        label="Façon d’apporter le programme"
        options={TABS}
        value={tab}
        onChange={(next) => {
          setTab(next)
          setError(null)
        }}
      />

      {tab === 'text' ? (
        <div className="mt-3.5 flex flex-col gap-1.5">
          <label htmlFor="program-text" className="sr-only">
            Texte du programme
          </label>
          <textarea
            id="program-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={PLACEHOLDER}
            maxLength={MAX_PROGRAM_TEXT_LENGTH}
            className="border-border-strong focus:border-primary h-[196px] w-full resize-none rounded-2xl border-2 bg-white px-4 py-3.5 text-[15px] leading-[1.45] font-semibold outline-none placeholder:font-medium placeholder:text-[#5b6b8c] focus:shadow-[0_0_0_4px_#e6eefd]"
          />
          <p className="text-muted-foreground flex justify-between text-xs font-bold">
            <span>
              {trimmed.length > 0 && trimmed.length < MIN_PROGRAM_TEXT_LENGTH
                ? 'Encore quelques lignes…'
                : 'Mail, notes, réponse de ChatGPT, page web…'}
            </span>
            <span className="font-mono">
              {text.length.toLocaleString('fr-FR')} /{' '}
              {MAX_PROGRAM_TEXT_LENGTH.toLocaleString('fr-FR')}
            </span>
          </p>
        </div>
      ) : (
        <div className="mt-3.5 flex flex-col gap-2">
          {file ? (
            <div className="bg-card border-primary flex items-center gap-3 rounded-2xl border-2 p-3.5">
              <span className="bg-primary-soft text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-[14px]">
                <IconFileText className="size-[22px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold">
                  {file.name}
                </span>
                <span className="text-muted-foreground block text-[13px] font-bold">
                  {file.source.kind === 'pdf'
                    ? 'PDF prêt à être lu'
                    : `${file.source.text.length.toLocaleString('fr-FR')} caractères lus`}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-round"
                aria-label="Retirer ce fichier"
                onClick={() => setFile(null)}
              >
                <IconX />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              disabled={reading}
              onClick={() => {
                setError(null)
                inputRef.current?.click()
              }}
              className={cn(
                'pressable border-primary bg-primary-soft text-primary-strong flex min-h-[148px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center outline-none',
                'focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-60',
              )}
            >
              <IconUpload className="size-7" aria-hidden />
              <span className="text-base font-extrabold">
                {reading ? 'Lecture du fichier…' : 'Choisir un fichier'}
              </span>
              <span className="text-muted-foreground text-[13px] font-bold">
                PDF, Word, Excel, CSV ou texte · 3 Mo max
              </span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={PROGRAM_FILE_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              void pickFile(event.target.files?.[0])
              // Le même fichier reste sélectionnable après une erreur.
              event.target.value = ''
            }}
          />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive mt-3 rounded-2xl px-3.5 py-3 text-sm leading-snug font-bold"
        >
          {error}
        </p>
      )}

      <div className="bg-card border-border mt-3.5 flex flex-col gap-2.5 rounded-2xl border px-3.5 py-3">
        <label htmlFor="program-start-date" className="flex items-center gap-3">
          <span className="bg-primary-soft text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-xl">
            <IconCalendar className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold">
              Date de départ · facultatif
            </span>
            <span className="text-muted-foreground block text-xs leading-snug">
              À remplir si le programme n’a pas de dates
            </span>
          </span>
        </label>
        <input
          id="program-start-date"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="border-border-strong focus:border-primary h-12 w-full rounded-xl border-2 bg-white px-3 font-mono text-[15px] font-semibold outline-none focus:shadow-[0_0_0_4px_#e6eefd]"
        />
      </div>

      <p className="bg-primary-soft text-primary-strong mt-3 flex items-start gap-2.5 rounded-[14px] px-3 py-2.5 text-[13px] leading-[1.4] font-bold">
        <IconInfoCircle
          className="text-primary mt-px size-5 shrink-0"
          aria-hidden
        />
        Votre programme est lu par une IA pour être mis en forme. TripBrain n’en
        garde aucune copie sur ses serveurs.
      </p>
    </MobileScreen>
  )
}
