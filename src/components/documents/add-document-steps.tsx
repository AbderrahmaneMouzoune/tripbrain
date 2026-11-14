'use client'

import { useId, useState, type ComponentType, type SVGProps } from 'react'
import {
  BedDouble,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  IdCard,
  Image as ImageIcon,
  Landmark,
  Link2,
  Loader2,
  Lock,
  Plane,
  Sparkles,
  X,
} from 'lucide-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import type { AddKind, Classification } from '@/lib/document-classify'
import type { DocumentCategory } from '@/lib/documents-db'
import {
  formatFileSize,
  normalizeLink,
  sameLink,
  type DocumentLink,
} from '@/lib/document-organize'
import { SOURCE_CATEGORIES, type Source } from '@/lib/document-sources'
import { IconBadge, type BadgeTone } from '@/components/mobile/icon-badge'
import { Chip } from '@/components/mobile/chip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PickerKind } from './document-pickers'
import {
  findLinkOption,
  formatDayDate,
  linkOptions,
  LinkPicker,
} from './link-picker'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

// ---------------------------------------------------------------------------
// Textes par type
// ---------------------------------------------------------------------------

export const KIND_TILES: {
  kind: Exclude<AddKind, 'unknown'>
  label: string
  hint: string
  icon: Icon
  tone: BadgeTone
}[] = [
  {
    kind: 'ticket',
    label: 'Billet',
    hint: 'Avion, train, bus, ferry',
    icon: Plane,
    tone: 'primary',
  },
  {
    kind: 'hotel',
    label: 'Logement',
    hint: 'Hôtel, Airbnb, Booking…',
    icon: BedDouble,
    tone: 'secondary',
  },
  {
    kind: 'identity',
    label: 'Passeport, visa',
    hint: 'Et assurance voyage',
    icon: IdCard,
    tone: 'success',
  },
  {
    kind: 'activity',
    label: 'Activité',
    hint: 'Musée, excursion, spectacle',
    icon: Landmark,
    tone: 'accent',
  },
]

const SOURCE_TITLES: Record<AddKind, string> = {
  ticket: 'Ajouter un billet',
  hotel: 'Ajouter un logement',
  identity: 'Ajouter un passeport ou un visa',
  activity: 'Ajouter une réservation',
  unknown: 'Ajouter un document',
}

/** Apps où l'on trouve ce type de confirmation. */
const PARTNERS: Record<AddKind, string[]> = {
  ticket: ['Trip.com', 'Gmail'],
  hotel: ['Booking.com', 'Airbnb', 'Trip.com', 'Gmail'],
  identity: [],
  activity: ['Gmail'],
  unknown: ['Trip.com', 'Booking.com', 'Airbnb', 'Gmail'],
}

const CATEGORY_EYEBROWS: Record<DocumentCategory, string> = {
  ticket: 'Billet',
  hotel: 'Logement',
  identity: 'Passeport, visa',
  other: 'Document',
}

function doneTitle(category: DocumentCategory, count: number): string {
  if (count > 1) return `${count} documents ajoutés et rangés`
  switch (category) {
    case 'ticket':
      return 'Billet ajouté et rangé'
    case 'hotel':
      return 'Réservation ajoutée et rangée'
    case 'identity':
      return 'Document ajouté et rangé'
    default:
      return 'Document ajouté et rangé'
  }
}

function anotherLabel(kind: AddKind): string {
  switch (kind) {
    case 'ticket':
      return 'Ajouter un autre billet'
    case 'hotel':
      return 'Ajouter un autre logement'
    case 'activity':
      return 'Ajouter une autre réservation'
    default:
      return 'Ajouter un autre document'
  }
}

function questionFor(choices: DocumentLink[]): string {
  switch (choices[0]?.linkedTo) {
    case 'transport':
      return 'À quel trajet correspond ce billet ?'
    case 'accommodation':
      return 'À quel logement correspond cette réservation ?'
    case 'activity':
      return 'À quelle activité correspond ce billet ?'
    default:
      return 'Où ranger ce document ?'
  }
}

function notThisLabel(category: DocumentCategory): string {
  switch (category) {
    case 'ticket':
      return 'Ce n’est pas un billet ?'
    case 'hotel':
      return 'Ce n’est pas un logement ?'
    default:
      return 'Changer le type'
  }
}

/** Titre et sous-titre d'un rattachement, activités comprises. */
export function linkSummary(
  link: DocumentLink,
  itinerary: DayItinerary[],
): { title: string; subtitle: string; icon: Icon; tone: BadgeTone } {
  const normalized = normalizeLink(link, itinerary)
  if (normalized.linkedTo === 'activity') {
    const index = itinerary.findIndex((day) => day.id === normalized.dayId)
    const day = itinerary[index]
    const activity = day?.activities.find(
      (item) => item.id === normalized.activityId,
    )
    if (day && activity) {
      return {
        title: `Jour ${index + 1} · ${activity.name}`,
        subtitle: [day.date ? formatDayDate(day.date) : '', day.city]
          .filter(Boolean)
          .join(' · '),
        icon: Landmark,
        tone: 'accent',
      }
    }
  }
  const option = findLinkOption(linkOptions(itinerary), normalized, itinerary)
  return {
    title: option.title,
    subtitle: option.subtitle,
    icon: option.icon,
    tone: option.tone,
  }
}

// ---------------------------------------------------------------------------
// Éléments communs
// ---------------------------------------------------------------------------

function SheetHeader({
  title,
  subtitle,
  onBack,
  onClose,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  onClose?: () => void
}) {
  return (
    <div className="flex items-start gap-3 pt-1">
      {onBack && (
        <Button
          variant="outline"
          size="icon-round"
          onClick={onBack}
          aria-label="Retour"
          className="border-border bg-card shrink-0 shadow-none"
        >
          <ChevronLeft />
        </Button>
      )}
      <div className={cn('min-w-0 flex-1', onBack && 'self-center')}>
        <h2 className="font-display text-[23px] leading-tight">{title}</h2>
        {subtitle && (
          <p className="text-muted-foreground mt-1 text-sm font-bold">
            {subtitle}
          </p>
        )}
      </div>
      {onClose && (
        <Button
          variant="outline"
          size="icon-round"
          onClick={onClose}
          aria-label="Fermer"
          className="border-border bg-card shrink-0 shadow-none"
        >
          <X />
        </Button>
      )}
    </div>
  )
}

export function StatusLine({
  busy,
  error,
}: {
  busy: string | null
  error: string | null
}) {
  if (!busy && !error) return null
  return (
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
  )
}

const tileClass =
  'pressable bg-card border-border focus-visible:ring-ring/50 border outline-none focus-visible:ring-[3px] disabled:opacity-50'

// ---------------------------------------------------------------------------
// 1. Le type
// ---------------------------------------------------------------------------

export function TypeStep({
  onPick,
  onZip,
  onClose,
  busy,
  error,
}: {
  onPick: (kind: AddKind) => void
  onZip: () => void
  onClose: () => void
  busy: string | null
  error: string | null
}) {
  return (
    <div className="flex flex-col">
      <SheetHeader
        title="Ajouter un document"
        subtitle="Choisissez ce que c’est. TripBrain le lit et le range au bon endroit."
        onClose={onClose}
      />
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {KIND_TILES.map(({ kind, label, hint, icon, tone }) => (
          <button
            key={kind}
            type="button"
            disabled={busy !== null}
            onClick={() => onPick(kind)}
            className={cn(
              tileClass,
              'flex min-h-[132px] flex-col items-start justify-between gap-3 rounded-[20px] p-3.5 text-left',
            )}
          >
            <IconBadge icon={icon} tone={tone} size="lg" />
            <span className="flex flex-col">
              <span className="text-base font-black">{label}</span>
              <span className="text-muted-foreground text-xs leading-tight font-bold">
                {hint}
              </span>
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => onPick('unknown')}
        className="pressable border-border focus-visible:ring-ring/50 mt-2.5 flex min-h-16 w-full items-center gap-3 rounded-[18px] border border-dashed px-3.5 py-2.5 text-left outline-none focus-visible:ring-[3px] disabled:opacity-50"
      >
        <IconBadge icon={Sparkles} tone="muted" />
        <span className="min-w-0">
          <span className="block text-[15px] font-extrabold">
            Je ne sais pas, triez pour moi
          </span>
          <span className="text-muted-foreground block text-xs leading-tight font-bold">
            TripBrain devine le type et l’endroit
          </span>
        </span>
      </button>

      <StatusLine busy={busy} error={error} />

      <div className="mt-5 flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={onZip}
          className="text-primary-strong focus-visible:ring-ring/50 min-h-11 rounded-full px-3 text-sm font-extrabold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] disabled:opacity-50"
        >
          Restaurer une archive ZIP
        </button>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[13px] font-bold">
          <Lock aria-hidden className="size-3.5" />
          Les documents restent sur ce téléphone
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. La source
// ---------------------------------------------------------------------------

function sourceRows(kind: AddKind): {
  picker: Exclude<PickerKind, 'zip'>
  label: string
  hint: string
  icon: Icon
  tone: BadgeTone
}[] {
  return [
    {
      picker: 'files',
      label: 'Fichiers',
      hint: 'Le PDF reçu par e-mail ou téléchargé',
      icon: FolderOpen,
      tone: 'accent',
    },
    {
      picker: 'photos',
      label: 'Photos',
      hint:
        kind === 'ticket'
          ? 'Une capture de la carte d’embarquement'
          : 'Une capture d’écran',
      icon: ImageIcon,
      tone: 'primary',
    },
    {
      picker: 'scan',
      label: 'Scanner',
      hint:
        kind === 'identity'
          ? 'La page photo du passeport'
          : kind === 'ticket'
            ? 'Un billet papier'
            : 'Un document papier',
      icon: Camera,
      tone: 'secondary',
    },
  ]
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
const PARTNER_TONES: BadgeTone[] = [
  'accent',
  'primary',
  'secondary',
  'destructive',
]

function PartnerApps({ kind }: { kind: AddKind }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const names = PARTNERS[kind]
  const partners = SOURCE_CATEGORIES.flatMap((category) => category.items)
    .filter((source) => names.includes(source.name))
    .sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name))
  if (partners.length === 0) return null
  return (
    <section className="bg-muted/60 mt-3 rounded-[18px] px-3.5 py-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="focus-visible:ring-ring/50 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl text-left text-sm font-extrabold outline-none focus-visible:ring-[3px]"
      >
        La confirmation est dans une app ?
        <ChevronDown
          aria-hidden
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div id={panelId} className="animate-fade pb-3">
          <p className="text-muted-foreground text-xs font-bold">
            Téléchargez-la dans l’app, puis revenez l’ajouter ici.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {partners.map((source: Source, index) => (
              <a
                key={source.name}
                href={source.fallback}
                target="_blank"
                rel="noopener noreferrer"
                className="pressable bg-card border-border focus-visible:ring-ring/50 flex min-h-11 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm font-extrabold outline-none focus-visible:ring-[3px]"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-[30px] items-center justify-center rounded-full text-[13px] font-black',
                    LETTER_TONES[PARTNER_TONES[index % PARTNER_TONES.length]],
                  )}
                >
                  {source.letter}
                </span>
                {source.name}
                <span className="sr-only"> (ouvre un nouvel onglet)</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export function SourceStep({
  kind,
  onPick,
  onBack,
  error,
}: {
  kind: AddKind
  onPick: (picker: Exclude<PickerKind, 'zip'>) => void
  onBack: () => void
  error: string | null
}) {
  return (
    <div className="flex flex-col">
      <SheetHeader title={SOURCE_TITLES[kind]} onBack={onBack} />
      <div className="bg-card border-border divide-border/70 mt-4 flex flex-col divide-y overflow-hidden rounded-[20px] border">
        {sourceRows(kind).map(({ picker, label, hint, icon, tone }) => (
          <button
            key={picker}
            type="button"
            onClick={() => onPick(picker)}
            className="focus-visible:ring-ring/50 active:bg-muted/60 flex min-h-[68px] items-center gap-3 px-3.5 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
          >
            <IconBadge icon={icon} tone={tone} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold">{label}</span>
              <span className="text-muted-foreground block text-xs leading-tight font-bold">
                {hint}
              </span>
            </span>
            <ChevronRight
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
          </button>
        ))}
      </div>
      <PartnerApps kind={kind} />
      <StatusLine busy={null} error={error} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. La lecture
// ---------------------------------------------------------------------------

export interface ReadingProgress {
  fileLabel: string
  size: number
  saved: boolean
  read: boolean
}

function ProgressRow({
  done,
  active,
  children,
}: {
  done: boolean
  active: boolean
  children: string
}) {
  return (
    <li className="flex items-center gap-3">
      {done ? (
        <span className="bg-success-soft text-success flex size-[26px] shrink-0 items-center justify-center rounded-full">
          <Check aria-hidden className="size-3.5" strokeWidth={3} />
        </span>
      ) : active ? (
        <Loader2
          aria-hidden
          className="text-primary size-[26px] shrink-0 animate-spin"
        />
      ) : (
        <span className="border-border size-[26px] shrink-0 rounded-full border-2" />
      )}
      <span
        className={cn(
          'text-[15px] font-bold',
          active && 'text-primary-strong',
          !done && !active && 'text-muted-foreground',
        )}
      >
        {children}
      </span>
    </li>
  )
}

export function ReadingStep({
  kind,
  progress,
}: {
  kind: AddKind
  progress: ReadingProgress
}) {
  const target =
    kind === 'ticket'
      ? 'Recherche du trajet correspondant…'
      : kind === 'hotel'
        ? 'Recherche du séjour correspondant…'
        : kind === 'activity'
          ? 'Recherche de l’activité correspondante…'
          : 'Recherche du bon endroit…'
  return (
    <div className="flex flex-col" aria-busy>
      <div className="flex items-center gap-3.5 pt-1">
        <span className="bg-card border-border flex h-[76px] w-[58px] shrink-0 items-center justify-center rounded-[10px] border">
          <FileText aria-hidden className="text-primary size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[22px] leading-tight">
            Lecture du document…
          </h2>
          <p className="text-muted-foreground truncate text-[13px] font-bold">
            {progress.fileLabel} · {formatFileSize(progress.size)}
          </p>
        </div>
      </div>
      <ol
        role="status"
        className="bg-card border-border mt-4 flex flex-col gap-3.5 rounded-[20px] border px-4 py-4"
      >
        <ProgressRow done={progress.saved} active={!progress.saved}>
          Fichier enregistré sur le téléphone
        </ProgressRow>
        <ProgressRow
          done={progress.read}
          active={progress.saved && !progress.read}
        >
          Lecture du contenu
        </ProgressRow>
        <ProgressRow done={false} active={progress.read}>
          {target}
        </ProgressRow>
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4a. Rangé
// ---------------------------------------------------------------------------

export function DoneStep({
  kind,
  category,
  fileLabel,
  count,
  link,
  itinerary,
  onChangeLink,
  onDone,
  onAnother,
  onUndo,
}: {
  kind: AddKind
  category: DocumentCategory
  fileLabel: string
  count: number
  link: DocumentLink
  itinerary: DayItinerary[]
  onChangeLink: (link: DocumentLink) => void
  onDone: () => void
  onAnother: () => void
  onUndo: () => void
}) {
  const [editing, setEditing] = useState(false)
  const summary = linkSummary(link, itinerary)
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="bg-success-soft text-success animate-pop flex size-14 items-center justify-center rounded-full">
          <Check aria-hidden className="size-7" strokeWidth={2.6} />
        </span>
        <h2 className="font-display text-[23px] leading-tight">
          {doneTitle(category, count)}
        </h2>
      </div>

      <div className="bg-card border-border mt-4 overflow-hidden rounded-[20px] border">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <IconBadge icon={summary.icon} tone={summary.tone} size="lg" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-primary-strong text-[11px] font-black tracking-[0.1em] uppercase">
              {CATEGORY_EYEBROWS[category]}
            </span>
            <span className="truncate text-[15px] font-extrabold">
              {fileLabel}
            </span>
          </span>
        </div>
        <div className="border-border/70 bg-muted/40 flex items-center gap-3 border-t px-3.5 py-2.5">
          <Link2
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-muted-foreground text-xs font-bold">
              Rangé dans
            </span>
            <span className="truncate text-[15px] font-extrabold">
              {summary.title}
            </span>
          </span>
          {!editing && (
            <Button
              variant="outline"
              className="border-border bg-card text-primary-strong h-11 shrink-0 rounded-full px-4 font-extrabold shadow-none"
              onClick={() => setEditing(true)}
            >
              Changer
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3">
          <LinkPicker
            itinerary={itinerary}
            value={link}
            defaultOpen
            onChange={(next) => {
              onChangeLink(next)
              setEditing(false)
            }}
          />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        <Button size="xl" className="w-full" onClick={onDone}>
          Terminé
        </Button>
        <Button
          size="xl"
          variant="outline"
          className="border-border bg-card w-full shadow-none"
          onClick={onAnother}
        >
          {anotherLabel(kind)}
        </Button>
        <button
          type="button"
          onClick={onUndo}
          className="text-destructive focus-visible:ring-ring/50 min-h-11 self-center rounded-full px-3 text-sm font-extrabold outline-none focus-visible:ring-[3px]"
        >
          Annuler l’import
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4b. On hésite
// ---------------------------------------------------------------------------

export function ChooseStep({
  classification,
  itinerary,
  onConfirm,
  onRetype,
}: {
  classification: Classification
  itinerary: DayItinerary[]
  onConfirm: (link: DocumentLink) => void
  onRetype: (kind: AddKind) => void
}) {
  const { choices, category } = classification
  const [picked, setPicked] = useState<DocumentLink>(choices[0] ?? {})
  const [other, setOther] = useState(false)
  const [retyping, setRetyping] = useState(false)
  const name = useId()

  return (
    <div className="flex flex-col">
      <p className="text-secondary-strong text-[11px] font-black tracking-[0.1em] uppercase">
        {CATEGORY_EYEBROWS[category]}
      </p>
      <h2 className="font-display mt-0.5 text-[23px] leading-tight">
        {questionFor(choices)}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm font-bold">
        Plusieurs possibilités : choisissez la bonne, l’app retiendra.
      </p>

      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="sr-only">{questionFor(choices)}</legend>
        {choices.map((choice) => {
          const summary =
            choice.dayId === undefined
              ? {
                  title: 'Tout le voyage',
                  subtitle: 'Pass, carte de transport, assurance…',
                }
              : linkSummary(choice, itinerary)
          const checked = !other && sameLink(choice, picked)
          const key = `${choice.dayId ?? 'trip'}-${choice.linkedTo ?? ''}-${choice.activityId ?? ''}`
          return (
            <label
              key={key}
              className={cn(
                'bg-card flex min-h-16 cursor-pointer items-center gap-3 rounded-[18px] border px-3.5 py-2.5',
                checked ? 'border-primary border-2' : 'border-border',
              )}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                onChange={() => {
                  setOther(false)
                  setPicked(choice)
                }}
                className="accent-primary size-5 shrink-0"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-extrabold">
                  {summary.title}
                </span>
                <span className="text-muted-foreground truncate text-xs font-bold">
                  {summary.subtitle}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {other ? (
        <div className="mt-2">
          <LinkPicker
            itinerary={itinerary}
            value={picked}
            defaultOpen
            onChange={setPicked}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOther(true)}
          className="text-primary-strong focus-visible:ring-ring/50 mt-1 min-h-11 self-start rounded-full px-1 text-sm font-extrabold outline-none focus-visible:ring-[3px]"
        >
          Autre endroit…
        </button>
      )}

      <Button
        size="xl"
        className="mt-5 w-full"
        onClick={() => onConfirm(picked)}
      >
        Ranger ici
      </Button>

      {retyping ? (
        <div
          role="group"
          aria-label="Type de document"
          className="mt-3 flex flex-wrap justify-center gap-2"
        >
          {KIND_TILES.map(({ kind, label, icon }) => (
            <Chip key={kind} icon={icon} onClick={() => onRetype(kind)}>
              {label}
            </Chip>
          ))}
          <Chip onClick={() => onRetype('unknown')}>Autre</Chip>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRetyping(true)}
          className="text-primary-strong focus-visible:ring-ring/50 mt-1 min-h-11 self-center rounded-full px-3 text-sm font-extrabold outline-none focus-visible:ring-[3px]"
        >
          {notThisLabel(category)}
        </button>
      )}
    </div>
  )
}
