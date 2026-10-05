'use client'

import { useMemo, useState, type ComponentType, type SVGProps } from 'react'
import {
  Camera,
  FileArchive,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Lock,
  X,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { Chip } from '@/components/mobile/chip'
import { IconBadge, type BadgeTone } from '@/components/mobile/icon-badge'
import { Button } from '@/components/ui/button'
import { useDocuments } from '@/hooks/use-documents'
import { trackEvent } from '@/lib/analytics/client'
import { documentKindOf } from '@/lib/analytics/metrics'
import { SOURCE_CATEGORIES } from '@/lib/document-sources'
import {
  sameLink,
  suggestedCategory,
  type DocumentLink,
} from '@/lib/document-organize'
import type { DocumentCategory } from '@/lib/documents-db'
import { CategoryPicker } from './category-picker'
import { useDocumentPickers, type PickerKind } from './document-pickers'
import { LinkPicker } from './link-picker'

/** Couleurs des pastilles des apps, prises dans la charte plutôt que les marques. */
const SOURCE_TONES: BadgeTone[] = [
  'accent',
  'primary',
  'secondary',
  'destructive',
]

const PICKERS: {
  kind: Exclude<PickerKind, 'zip'>
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  tone: BadgeTone
}[] = [
  { kind: 'photos', label: 'Photos', icon: ImageIcon, tone: 'primary' },
  { kind: 'files', label: 'Fichiers', icon: FolderOpen, tone: 'accent' },
  {
    kind: 'scan',
    label: 'Scanner un document',
    icon: Camera,
    tone: 'secondary',
  },
]

/** Rattachement proposé d'office : le trajet de la journée, sinon la journée. */
function defaultLink(
  itinerary: ReturnType<typeof useTrip>['itinerary'],
  dayIndex: number | undefined,
): DocumentLink {
  if (dayIndex === undefined) return {}
  const day = itinerary[dayIndex]
  if (!day) return {}
  if (day.transport) return { dayId: day.id, linkedTo: 'transport' }
  return { dayId: day.id }
}

/** Ajouter un document : d'où il vient, et à quoi il se rattache. */
export function AddDocumentSheet({
  screen,
  onClose,
}: ScreenProps<'add-document'>) {
  const { itinerary } = useTrip()
  const { selectedDay } = useAppNav()
  const { addFiles, importZip } = useDocuments()
  const [link, setLink] = useState<DocumentLink>(() =>
    defaultLink(itinerary, screen.dayIndex),
  )
  // Le type suit le rattachement tant que l'utilisateur ne l'a pas choisi.
  const [chosenCategory, setChosenCategory] = useState<
    DocumentCategory | null | undefined
  >(undefined)
  const category =
    chosenCategory === undefined ? suggestedCategory(link) : chosenCategory
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Les raccourcis portent sur la journée d'où l'on vient, ou celle consultée.
  const focusDay = itinerary[screen.dayIndex ?? selectedDay] ?? null
  const shortcuts = useMemo(() => {
    const list: { label: string; link: DocumentLink }[] = []
    if (focusDay?.transport) {
      list.push({
        label: 'Ce trajet',
        link: { dayId: focusDay.id, linkedTo: 'transport' },
      })
    }
    if (focusDay?.accommodation) {
      list.push({
        label: 'Cet hébergement',
        link: { dayId: focusDay.id, linkedTo: 'accommodation' },
      })
    }
    if (focusDay) list.push({ label: 'Ce jour', link: { dayId: focusDay.id } })
    list.push({ label: 'Tout le voyage', link: {} })
    return list
  }, [focusDay])

  const handleFiles = async (files: File[]) => {
    setError(null)
    setBusy('Enregistrement…')
    try {
      await addFiles(files, link, category)
      // Seuls le nombre et la famille de fichiers sont mesurés.
      trackEvent('document_added', {
        count: files.length,
        kind: documentKindOf(files.map((file) => file.type)),
      })
      onClose()
    } catch {
      setError('Le document n’a pas pu être enregistré sur ce téléphone.')
      setBusy(null)
    }
  }

  const handleZip = async (file: File) => {
    setError(null)
    setBusy('Restauration de l’archive…')
    try {
      const { imported } = await importZip(file, (progress) =>
        setBusy(progress.message),
      )
      if (imported > 0) {
        trackEvent('document_added', { count: imported, kind: 'mixed' })
      }
      onClose()
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Archive illisible : ${err.message.toLowerCase()}.`
          : 'Archive illisible.',
      )
      setBusy(null)
    }
  }

  const { open, inputs } = useDocumentPickers({
    onFiles: (files) => void handleFiles(files),
    onZip: (file) => void handleZip(file),
  })

  const sources = SOURCE_CATEGORIES.flatMap((category) => category.items)

  return (
    <BottomSheet
      open
      onOpenChange={(next) => !next && onClose()}
      title="Ajouter un document"
      description="Importez un billet, une réservation ou une pièce d’identité."
      hideHeader
      className="bg-background"
    >
      {inputs}
      <div className="flex items-center gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <p className="text-secondary-strong text-[11px] font-black tracking-[0.1em] uppercase">
            Ajouter un document
          </p>
          <h2 className="font-display mt-0.5 text-[23px] leading-tight">
            Importez depuis vos apps
          </h2>
        </div>
        <Button
          variant="outline"
          size="icon-round"
          onClick={onClose}
          aria-label="Fermer"
          className="border-border bg-card shrink-0 shadow-none"
        >
          <X />
        </Button>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2">
        {PICKERS.map(({ kind, label, icon, tone }) => (
          <button
            key={kind}
            type="button"
            disabled={busy !== null}
            onClick={() => open(kind)}
            className="pressable bg-card border-border focus-visible:ring-ring/50 flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[18px] border px-1 py-2 text-center text-[13px] leading-tight font-extrabold outline-none focus-visible:ring-[3px] disabled:opacity-50"
          >
            <IconBadge icon={icon} tone={tone} />
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => open('zip')}
        className="pressable bg-card border-border focus-visible:ring-ring/50 mt-2 flex min-h-16 w-full items-center gap-2.5 rounded-[18px] border px-3 py-2.5 text-left outline-none focus-visible:ring-[3px] disabled:opacity-50"
      >
        <IconBadge icon={FileArchive} tone="muted" />
        <span className="min-w-0">
          <span className="block text-sm font-extrabold">Archive ZIP</span>
          <span className="text-muted-foreground block text-xs leading-tight font-bold">
            Restaurer des documents exportés depuis TripBrain
          </span>
        </span>
      </button>

      {(busy || error) && (
        <p
          role="status"
          className={
            error
              ? 'text-destructive mt-3 text-sm font-bold'
              : 'text-muted-foreground mt-3 flex items-center gap-2 text-sm font-bold'
          }
        >
          {!error && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {error ?? busy}
        </p>
      )}

      <h3 className="text-muted-foreground mt-4 mb-2 text-xs font-black tracking-[0.08em] uppercase">
        Récupérer une confirmation dans
      </h3>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {sources.map((source, index) => (
          <a
            key={source.name}
            href={source.fallback}
            target="_blank"
            rel="noopener noreferrer"
            className="pressable bg-card border-border focus-visible:ring-ring/50 flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm font-extrabold outline-none focus-visible:ring-[3px]"
          >
            <IconBadgeLetter
              letter={source.letter}
              tone={SOURCE_TONES[index % SOURCE_TONES.length]}
            />
            {source.name}
            <span className="sr-only"> (ouvre un nouvel onglet)</span>
          </a>
        ))}
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">
        Téléchargez la confirmation dans l’app, puis revenez l’ajouter ici.
      </p>

      <h3 className="text-muted-foreground mt-4 mb-2 text-xs font-black tracking-[0.08em] uppercase">
        Type de document
      </h3>
      <CategoryPicker value={category} onChange={setChosenCategory} />

      <h3 className="text-muted-foreground mt-4 mb-2 text-xs font-black tracking-[0.08em] uppercase">
        Associer à
      </h3>
      <LinkPicker itinerary={itinerary} value={link} onChange={setLink} />
      <div
        role="group"
        aria-label="Suggestions d’association"
        className="mt-2.5 flex flex-wrap gap-2"
      >
        {shortcuts.map((shortcut) => (
          <Chip
            key={shortcut.label}
            pressed={sameLink(shortcut.link, link)}
            onClick={() => setLink(shortcut.link)}
          >
            {shortcut.label}
          </Chip>
        ))}
      </div>

      <p className="text-muted-foreground mt-4 flex items-center justify-center gap-1.5 text-[13px] font-bold">
        <Lock aria-hidden className="size-3.5" />
        Les documents restent sur ce téléphone
      </p>
    </BottomSheet>
  )
}

const LETTER_TONES: Record<BadgeTone, string> = {
  primary: 'bg-primary-soft text-primary-strong',
  secondary: 'bg-secondary-soft text-secondary-strong',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  destructive: 'bg-destructive-soft text-destructive',
  muted: 'bg-muted text-muted-foreground',
  ink: 'bg-ink text-ink-foreground',
}

function IconBadgeLetter({
  letter,
  tone,
}: {
  letter: string
  tone: BadgeTone
}) {
  return (
    <span
      aria-hidden
      className={`flex size-[30px] items-center justify-center rounded-full text-[13px] font-black ${LETTER_TONES[tone]}`}
    >
      {letter}
    </span>
  )
}
