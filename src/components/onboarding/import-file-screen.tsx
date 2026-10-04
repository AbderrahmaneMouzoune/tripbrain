'use client'

import { useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  Braces,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Table,
  Upload,
  XCircle,
} from 'lucide-react'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { IconBadge, type BadgeTone } from '@/components/mobile/icon-badge'
import { SectionTitle } from '@/components/mobile/section-title'
import { Button } from '@/components/ui/button'
import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { trackEvent } from '@/lib/analytics/client'
import { importFailureReason } from '@/lib/analytics/metrics'
import { cn } from '@/lib/utils'
import { TripPreviewStep } from '@/components/receive/trip-preview-step'
import type { ReceivedTrip } from '@/components/receive/received-trip'
import {
  ITINERARY_FILE_ACCEPT,
  classifyFiles,
  readItineraryFiles,
  type CsvChecklistItem,
  type FileFormat,
} from '@/components/onboarding/import-files'

const FORMATS: {
  format: FileFormat
  icon: typeof Braces
  tone: BadgeTone
  name: string
  extension: string
  description: string
}[] = [
  {
    format: 'json',
    icon: Braces,
    tone: 'primary',
    name: 'JSON',
    extension: '.json',
    description: 'Export TripBrain ou générateur',
  },
  {
    format: 'xlsx',
    icon: FileSpreadsheet,
    tone: 'success',
    name: 'Excel',
    extension: '.xlsx',
    description: '3 onglets : jours, activités, trajets',
  },
  {
    format: 'csv',
    icon: Table,
    tone: 'accent',
    name: 'CSV',
    extension: '3 × .csv',
    description:
      'days.csv, activities.csv et transports.csv, sélectionnés ensemble',
  },
]

interface ImportError {
  message: string
  csvChecklist?: CsvChecklistItem[]
  format?: FileFormat
}

/**
 * Choix et lecture d'un fichier d'itinéraire. Rien n'est enregistré ici : le
 * voyage lu part vers l'aperçu (`onParsed`), qui décide.
 */
export function ImportFilePanel({
  onBack,
  progress,
  onParsed,
}: {
  onBack: () => void
  progress?: { step: number; total: number }
  onParsed: (received: ReceivedTrip) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<ImportError | null>(null)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [templateState, setTemplateState] = useState<
    'idle' | 'loading' | 'error'
  >('idle')

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return
    setError(null)
    const verdict = classifyFiles(files.map((file) => file.name))
    if (!verdict.ok) {
      setError({
        message: verdict.message,
        csvChecklist: verdict.csvChecklist,
        format: verdict.csvChecklist ? 'csv' : undefined,
      })
      return
    }
    setReading(true)
    try {
      const parsed = await readItineraryFiles(files, verdict.format)
      onParsed({
        days: parsed.itinerary,
        title: parsed.title,
        source: parsed.source,
        via: 'file',
        analytics: { kind: 'file', source: parsed.source },
        fileName: verdict.format === 'csv' ? undefined : files[0].name,
      })
    } catch (err) {
      // Seule la nature de l'échec est mesurée : ni le fichier, ni son nom.
      trackEvent('trip_import_failed', {
        source: verdict.format,
        reason: importFailureReason(err),
      })
      setError({
        message:
          err instanceof SyntaxError
            ? 'Ce fichier JSON est illisible : vérifiez qu’il est complet.'
            : err instanceof Error
              ? err.message
              : 'Erreur lors de l’import.',
        format: verdict.format,
      })
    } finally {
      setReading(false)
    }
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    void handleFiles(Array.from(event.dataTransfer.files))
  }

  const handleTemplate = async () => {
    setTemplateState('loading')
    try {
      const { downloadXlsxTemplate } =
        await import('@/components/import-format-guide')
      await downloadXlsxTemplate()
      setTemplateState('idle')
    } catch {
      setTemplateState('error')
    }
  }

  return (
    <MobileScreen
      onBack={onBack}
      progress={progress}
      title="Importer un fichier"
      description="Trois formats sont acceptés."
      footer={
        <>
          <Button
            size="xl"
            className="w-full"
            disabled={reading}
            onClick={() => {
              setError(null)
              inputRef.current?.click()
            }}
          >
            <Upload aria-hidden />
            {reading ? 'Lecture du fichier…' : 'Choisir un fichier'}
          </Button>
          <Button
            variant="outline"
            size="lg2"
            className="w-full"
            disabled={templateState === 'loading'}
            onClick={handleTemplate}
          >
            <Download aria-hidden />
            {templateState === 'loading'
              ? 'Préparation du modèle…'
              : 'Télécharger un modèle Excel'}
          </Button>
          {templateState === 'error' && (
            <p role="alert" className="text-destructive text-center text-xs">
              Le modèle n’a pas pu être généré. Réessayez.
            </p>
          )}
        </>
      }
    >
      {error && (
        <div
          role="alert"
          className="bg-destructive-soft border-destructive/30 mb-3 flex flex-col gap-2.5 rounded-[18px] border p-3.5"
        >
          <div className="flex items-start gap-2.5">
            <span className="bg-card text-destructive flex size-8 shrink-0 items-center justify-center rounded-[10px]">
              <AlertCircle className="size-[18px]" aria-hidden />
            </span>
            <p className="text-destructive flex-1 text-sm leading-snug font-extrabold">
              {error.message}
            </p>
          </div>
          {error.csvChecklist && (
            <ul
              aria-label="Fichiers reconnus"
              className="bg-card flex flex-col gap-0.5 rounded-xl px-2.5 py-2"
            >
              {error.csvChecklist.map((item) => (
                <li key={item.name} className="flex min-h-6 items-center gap-2">
                  {item.found ? (
                    <CheckCircle2
                      className="text-success size-4 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <XCircle
                      className="text-destructive size-4 shrink-0"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      'flex-1 font-mono text-[13px] font-medium',
                      !item.found && 'text-muted-foreground',
                    )}
                  >
                    {item.name}
                  </span>
                  {item.found ? (
                    <span className="text-success text-xs font-extrabold">
                      Reconnu
                    </span>
                  ) : (
                    <span className="bg-destructive-soft text-destructive rounded-full px-2 py-0.5 text-xs font-extrabold">
                      Manquant
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <SectionTitle
        className="mb-1 px-0"
        action={
          <Link
            href="/guide"
            className="text-primary inline-flex min-h-11 items-center gap-1 text-sm font-extrabold"
          >
            Guide d’import complet
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        <span className="text-secondary-strong">Formats acceptés</span>
      </SectionTitle>

      <ul
        onDrop={handleDrop}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        className={cn(
          'flex flex-col gap-2 rounded-[22px] transition-shadow',
          dragging && 'ring-primary/40 ring-4',
        )}
      >
        {FORMATS.map((item) => (
          <li
            key={item.format}
            className={cn(
              'bg-card flex items-center gap-3 rounded-[20px] px-3.5 py-3',
              error?.format === item.format
                ? 'border-destructive/40 border-2'
                : 'border-border border',
            )}
          >
            <IconBadge
              icon={item.icon}
              tone={item.tone}
              className="size-11 rounded-[14px]"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="text-base font-extrabold">{item.name}</span>
                <span className="text-muted-foreground font-mono text-xs font-medium">
                  {item.extension}
                </span>
              </span>
              <span className="text-muted-foreground text-[13px] leading-snug">
                {item.description}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept={ITINERARY_FILE_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          void handleFiles(Array.from(event.target.files ?? []))
          // Le même fichier reste sélectionnable après une erreur.
          event.target.value = ''
        }}
      />
    </MobileScreen>
  )
}

/**
 * Import d'un fichier depuis le menu (voyage déjà ouvert) : choix du fichier,
 * aperçu avec ajouter / remplacer, puis l'écran « voyage prêt ».
 */
export function ImportFileScreen({ onClose }: ScreenProps<'import-file'>) {
  const { replace } = useAppNav()
  const [received, setReceived] = useState<ReceivedTrip | null>(null)

  if (received) {
    return (
      <TripPreviewStep
        received={received}
        onBack={() => setReceived(null)}
        onSaved={() => replace({ kind: 'trip-ready' })}
      />
    )
  }
  return <ImportFilePanel onBack={onClose} onParsed={setReceived} />
}
