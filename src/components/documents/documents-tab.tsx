'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpDown,
  BedDouble,
  Camera,
  CircleCheck,
  Download,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  MoreHorizontal,
  PackageOpen,
  Plus,
  Search,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { Chip } from '@/components/mobile/chip'
import { IconBadge } from '@/components/mobile/icon-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDocuments, type StoredFile } from '@/hooks/use-documents'
import { trackEvent } from '@/lib/analytics/client'
import { documentKind, documentKindOf } from '@/lib/analytics/metrics'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SORTS,
  describeLink,
  documentCategoryLabel,
  filterDocuments,
  fileFormatLabel,
  formatFileSize,
  groupDocumentsByDay,
  missingDocuments,
  sortDocuments,
  type DocumentCategory,
  type DocumentGroup,
  type DocumentSort,
} from '@/lib/document-organize'
import { parseDayDate } from '@/lib/trips'
import { cn } from '@/lib/utils'
import { DocumentThumb } from './document-thumb'
import { useDocumentPickers } from './document-pickers'
import { useImagePreviews } from './use-previews'
import { formatDayDate } from './link-picker'
import {
  DeleteDocumentDialog,
  LinkDocumentSheet,
  downloadDocument,
} from './document-actions'

type ViewMode = 'grid' | 'list'
const VIEW_MODE_STORAGE_KEY = 'tripbrain:documents-view-mode'

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'grid'
      ? 'grid'
      : 'list'
  } catch {
    return 'list'
  }
}

const addedDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
})

function isToday(iso: string): boolean {
  const day = parseDayDate(iso)
  const now = new Date()
  return (
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate()
  )
}

/** « 10 → 29 mai », ou « 28 avr. → 3 mai » d'un mois à l'autre. */
function tripRange(first?: string, last?: string): string {
  if (!first || !last) return ''
  const start = parseDayDate(first)
  const end = parseDayDate(last)
  const endLabel = addedDate.format(end)
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} → ${endLabel}`
  }
  return `${addedDate.format(start)} → ${endLabel}`
}

/** Onglet Documents : premier usage, puis liste rangée par journée. */
export function DocumentsTab(_props: {}) {
  const { itinerary } = useTrip()
  const { push } = useAppNav()
  const { files, loading, addFiles, exportAll } = useDocuments()
  const [status, setStatus] = useState<string | null>(null)

  const handleFiles = useCallback(
    async (selected: File[]) => {
      setStatus('Enregistrement…')
      try {
        await addFiles(selected)
        // Seuls le nombre et la famille sont mesurés, jamais le nom.
        trackEvent('document_added', {
          count: selected.length,
          kind: documentKindOf(selected.map((file) => file.type)),
        })
        setStatus(
          selected.length > 1
            ? `${selected.length} documents ajoutés`
            : 'Document ajouté',
        )
      } catch {
        setStatus('Le document n’a pas pu être enregistré sur ce téléphone.')
      }
    },
    [addFiles],
  )
  const { open, inputs } = useDocumentPickers({
    onFiles: (selected) => void handleFiles(selected),
  })

  useEffect(() => {
    if (!status || status === 'Enregistrement…') return
    const timer = setTimeout(() => setStatus(null), 3000)
    return () => clearTimeout(timer)
  }, [status])

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      await exportAll()
      trackEvent('document_downloaded', { kind: 'archive' })
    } finally {
      setExporting(false)
    }
  }

  const header = (
    <header className="flex items-start gap-3 px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[30px] leading-[1.1]">Documents</h1>
        {files.length > 0 && (
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm font-bold">
            <CircleCheck aria-hidden className="text-success size-4" />
            {files.length} document{files.length > 1 ? 's' : ''} · tous
            disponibles hors ligne
          </p>
        )}
      </div>
      {files.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-round"
              aria-label="Plus d’actions sur les documents"
              className="border-border bg-card shrink-0 shadow-none"
            >
              {exporting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MoreHorizontal />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            <DropdownMenuItem
              className="min-h-11"
              disabled={exporting}
              onSelect={() => void handleExport()}
            >
              <PackageOpen aria-hidden />
              Exporter tous les documents (ZIP)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  )

  return (
    <div className="mx-auto w-full max-w-xl pb-24">
      {inputs}
      {header}
      {status && (
        <p
          role="status"
          className="bg-success-soft text-success animate-fade mx-5 mt-3 rounded-xl px-3 py-2 text-sm font-bold"
        >
          {status}
        </p>
      )}
      {loading ? (
        <div className="mx-5 mt-6 flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="bg-card animate-shimmer-soft h-16 rounded-[20px]"
            />
          ))}
        </div>
      ) : files.length === 0 ? (
        <EmptyDocuments
          onPick={open}
          onSuggest={(dayIndex) =>
            push({
              kind: 'add-document',
              dayIndex: dayIndex >= 0 ? dayIndex : undefined,
            })
          }
          missing={missingDocuments(itinerary, files)}
        />
      ) : (
        <DocumentList files={files} />
      )}

      {/* Bouton flottant, au-dessus de la barre d'onglets. */}
      {!loading && files.length > 0 && (
        <button
          type="button"
          onClick={() => push({ kind: 'add-document' })}
          className="bg-primary text-primary-foreground pressable animate-pop focus-visible:ring-ring/50 fixed right-5 bottom-[calc(100px+env(safe-area-inset-bottom))] z-30 flex h-14 items-center gap-2 rounded-full pr-[22px] pl-[18px] text-base font-extrabold shadow-[0_10px_24px_rgba(29,95,224,0.38)] outline-none focus-visible:ring-[3px]"
        >
          <Plus aria-hidden className="size-5" strokeWidth={2.5} />
          Ajouter
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Premier usage
// ---------------------------------------------------------------------------

function EmptyDocuments({
  onPick,
  onSuggest,
  missing,
}: {
  onPick: (kind: 'photos' | 'files' | 'scan') => void
  onSuggest: (dayIndex: number) => void
  missing: ReturnType<typeof missingDocuments>
}) {
  const { transports, accommodations } = missing
  const hasSuggestions = transports.missing > 0 || accommodations.missing > 0

  return (
    <div className="stagger flex flex-col">
      {/* Illustration : deux billets superposés. */}
      <div aria-hidden className="relative mx-auto mt-6 h-28 w-[200px]">
        <span className="bg-secondary-soft absolute top-3.5 left-[18px] h-[84px] w-[150px] -rotate-[8deg] rounded-[14px]" />
        <span className="bg-card border-border animate-float absolute top-2 left-[34px] flex h-[84px] w-[150px] rotate-[4deg] flex-col gap-2 rounded-[14px] border p-3.5">
          <span className="bg-primary h-[9px] w-[60%] rounded-full" />
          <span className="bg-muted h-[7px] w-[85%] rounded-full" />
          <span className="bg-muted h-[7px] w-[45%] rounded-full" />
          <span className="border-foreground absolute right-3.5 bottom-3 size-[26px] rounded-[4px] border-[3px]" />
        </span>
      </div>

      <div className="px-7 pt-[18px] text-center">
        <h2 className="text-[21px] font-black">
          Vos billets, toujours sous la main
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          Billets, réservations, visas : ils restent lisibles hors ligne, rangés
          à côté du bon jour.
        </p>
      </div>

      <div className="mx-5 mt-[18px] grid grid-cols-3 gap-2">
        {(
          [
            { kind: 'photos', label: 'Photos', icon: ImageIcon },
            { kind: 'files', label: 'Fichiers', icon: FolderOpen },
            { kind: 'scan', label: 'Scanner', icon: Camera },
          ] as const
        ).map(({ kind, label, icon: Icon }, index) => (
          <button
            key={kind}
            type="button"
            onClick={() => onPick(kind)}
            className={cn(
              'pressable focus-visible:ring-ring/50 flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl text-[13px] font-extrabold outline-none focus-visible:ring-[3px]',
              index === 0
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border-border border',
            )}
          >
            <Icon aria-hidden className="size-[22px]" />
            {label}
          </button>
        ))}
      </div>

      {hasSuggestions && (
        <section className="bg-card border-border mx-5 mt-[18px] rounded-[20px] border px-4 py-1.5">
          <h3 className="text-muted-foreground mt-2.5 mb-0.5 text-xs font-black tracking-[0.08em] uppercase">
            À ajouter pour ce voyage
          </h3>
          <div className="divide-border/70 divide-y">
            {transports.missing > 0 && (
              <SuggestionRow
                icon={Ticket}
                tone="primary"
                title="Billets de train et d’avion"
                detail={
                  transports.missing === transports.total
                    ? `${transports.total} trajet${transports.total > 1 ? 's' : ''} dans le programme`
                    : `${transports.missing} trajet${transports.missing > 1 ? 's' : ''} sur ${transports.total} sans billet`
                }
                action="Ajouter un billet"
                onClick={() => onSuggest(transports.firstDayIndex)}
              />
            )}
            {accommodations.missing > 0 && (
              <SuggestionRow
                icon={BedDouble}
                tone="secondary"
                title="Confirmations d’hôtel"
                detail={
                  accommodations.missing === accommodations.total
                    ? `${accommodations.total} hébergement${accommodations.total > 1 ? 's' : ''} dans le programme`
                    : `${accommodations.missing} hébergement${accommodations.missing > 1 ? 's' : ''} sur ${accommodations.total} sans confirmation`
                }
                action="Ajouter une confirmation"
                onClick={() => onSuggest(accommodations.firstDayIndex)}
              />
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function SuggestionRow({
  icon,
  tone,
  title,
  detail,
  action,
  onClick,
}: {
  icon: typeof Ticket
  tone: 'primary' | 'secondary'
  title: string
  detail: string
  action: string
  onClick: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <IconBadge icon={icon} tone={tone} className="size-9 rounded-[10px]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">{title}</span>
        <span className="text-muted-foreground block text-[13px]">
          {detail}
        </span>
      </span>
      <Button
        variant="outline"
        size="icon-round"
        aria-label={action}
        onClick={onClick}
        className="border-border-strong text-primary bg-card shadow-none"
      >
        <Plus />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

function DocumentList({ files }: { files: StoredFile[] }) {
  const { itinerary } = useTrip()
  const { push } = useAppNav()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<DocumentCategory | null>(null)
  const [sort, setSort] = useState<DocumentSort>('day')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  useEffect(() => setViewMode(readViewMode()), [])
  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
    } catch {
      // Confort d'affichage : sans stockage, il vaut pour la visite.
    }
  }

  const [linking, setLinking] = useState<StoredFile | null>(null)
  const [deleting, setDeleting] = useState<StoredFile | null>(null)

  const visible = useMemo(
    () => filterDocuments(files, { query, category }),
    [files, query, category],
  )
  const groups: DocumentGroup<StoredFile>[] = useMemo(
    () =>
      sort === 'day'
        ? groupDocumentsByDay(visible, itinerary)
        : [{ key: 'all', dayIndex: null, files: sortDocuments(visible, sort) }],
    [visible, itinerary, sort],
  )
  const previews = useImagePreviews(files)

  // Une recherche est mesurée par son résultat, jamais par son contenu : le
  // terme saisi peut nommer un hôtel ou un compagnon de voyage.
  const resultCount = visible.length
  useEffect(() => {
    if (!query.trim()) return
    const timer = setTimeout(() => {
      trackEvent('documents_searched', { has_results: resultCount > 0 })
    }, 800)
    return () => clearTimeout(timer)
  }, [query, resultCount])

  const openDocument = (file: StoredFile) => {
    trackEvent('document_opened', { kind: documentKind(file.type) })
    push({ kind: 'document', documentId: file.id })
  }

  const sortLabel = DOCUMENT_SORTS.find((item) => item.id === sort)?.label

  return (
    <div className="flex flex-col">
      <div className="relative mx-5 mt-3.5">
        <label htmlFor="doc-search" className="sr-only">
          Rechercher un document
        </label>
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2"
        />
        <input
          id="doc-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher…"
          className="bg-card border-border-strong focus-visible:border-primary focus-visible:ring-ring/40 h-12 w-full rounded-[14px] border-[1.5px] pr-11 pl-11 text-base font-bold outline-none focus-visible:ring-[3px] [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Effacer la recherche"
            className="text-muted-foreground absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label="Filtrer par type"
        className="mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
      >
        <Chip
          pressed={category === null}
          onClick={() => setCategory(null)}
          className="shrink-0"
        >
          Tous
        </Chip>
        {DOCUMENT_CATEGORIES.map((item) => (
          <Chip
            key={item.id}
            pressed={category === item.id}
            onClick={() =>
              setCategory((current) => (current === item.id ? null : item.id))
            }
            className="shrink-0"
          >
            {item.label}
          </Chip>
        ))}
      </div>

      <div className="mx-5 mt-2 flex items-center justify-between gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="focus-visible:ring-ring/50 -ml-2.5 flex h-11 min-w-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-extrabold outline-none focus-visible:ring-[3px]"
            >
              <ArrowUpDown aria-hidden className="size-4 shrink-0" />
              Trier
              <span className="text-muted-foreground truncate font-bold">
                · {sortLabel}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel>Trier les documents</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as DocumentSort)}
            >
              {DOCUMENT_SORTS.map((item) => (
                <DropdownMenuRadioItem
                  key={item.id}
                  value={item.id}
                  className="min-h-11"
                >
                  {item.label.charAt(0).toUpperCase() + item.label.slice(1)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div
          role="group"
          aria-label="Affichage"
          className="bg-muted flex shrink-0 rounded-[14px] p-0.5"
        >
          {(
            [
              { mode: 'grid', label: 'Afficher en grille', icon: LayoutGrid },
              { mode: 'list', label: 'Afficher en liste', icon: List },
            ] as const
          ).map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              aria-label={label}
              aria-pressed={viewMode === mode}
              onClick={() => changeViewMode(mode)}
              className={cn(
                'focus-visible:ring-ring/50 flex h-10 w-11 items-center justify-center rounded-xl outline-none focus-visible:ring-[3px]',
                viewMode === mode
                  ? 'bg-card text-primary shadow-[0_1px_3px_rgba(14,26,58,0.14)]'
                  : 'text-muted-foreground',
              )}
            >
              <Icon aria-hidden className="size-[18px]" />
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
          <Search aria-hidden className="text-muted-foreground size-8" />
          <p className="text-muted-foreground text-sm">
            Aucun document ne correspond.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setQuery('')
              setCategory(null)
            }}
          >
            Tout afficher
          </Button>
        </div>
      ) : (
        <div className="stagger flex flex-col px-5">
          {groups.map((group) => (
            <section key={group.key} className="mt-2.5">
              {sort === 'day' && (
                <GroupHeader group={group} itinerary={itinerary} />
              )}
              {viewMode === 'list' ? (
                <ul className="bg-card border-border divide-border/70 divide-y rounded-[20px] border pr-1 pl-3">
                  {group.files.map((file) => (
                    <DocumentRow
                      key={file.id}
                      file={file}
                      previewUrl={previews[file.id]}
                      showLink={sort !== 'day'}
                      onOpen={() => openDocument(file)}
                      onLink={() => setLinking(file)}
                      onDelete={() => setDeleting(file)}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="grid grid-cols-2 gap-2.5">
                  {group.files.map((file) => (
                    <DocumentCard
                      key={file.id}
                      file={file}
                      previewUrl={previews[file.id]}
                      onOpen={() => openDocument(file)}
                      onLink={() => setLinking(file)}
                      onDelete={() => setDeleting(file)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {linking && (
        <LinkDocumentSheet
          key={linking.id}
          file={linking}
          open
          onOpenChange={(next) => !next && setLinking(null)}
        />
      )}
      {deleting && (
        <DeleteDocumentDialog
          file={deleting}
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          onDeleted={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function GroupHeader({
  group,
  itinerary,
}: {
  group: DocumentGroup<StoredFile>
  itinerary: ReturnType<typeof useTrip>['itinerary']
}) {
  if (group.dayIndex === null) {
    return (
      <SectionHeading
        title="Tout le voyage"
        detail={tripRange(itinerary[0]?.date, itinerary.at(-1)?.date)}
      />
    )
  }
  const day = itinerary[group.dayIndex]
  const date = day.date ? formatDayDate(day.date) : ''
  return (
    <SectionHeading
      title={`J${group.dayIndex + 1} · ${day.city}`}
      detail={day.date && isToday(day.date) ? `${date} · aujourd’hui` : date}
    />
  )
}

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-1 mb-1.5 flex items-baseline justify-between gap-3">
      <h2 className="text-secondary-strong truncate text-xs font-black tracking-[0.08em] uppercase">
        {title}
      </h2>
      <span className="text-muted-foreground shrink-0 text-xs font-bold">
        {detail}
      </span>
    </div>
  )
}

function documentMeta(file: StoredFile): string {
  return [
    documentCategoryLabel(file),
    fileFormatLabel(file),
    formatFileSize(file.size),
    `ajouté le ${addedDate.format(new Date(file.addedAt))}`,
  ].join(' · ')
}

interface DocumentItemProps {
  file: StoredFile
  previewUrl?: string
  onOpen: () => void
  onLink: () => void
  onDelete: () => void
}

function DocumentMenu({ file, onOpen, onLink, onDelete }: DocumentItemProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Options pour ${file.name}`}
          className="text-muted-foreground focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
        >
          <MoreHorizontal aria-hidden className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem className="min-h-11" onSelect={onOpen}>
          <Eye aria-hidden />
          Aperçu
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11"
          onSelect={() => downloadDocument(file)}
        >
          <Download aria-hidden />
          Télécharger
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" onSelect={onLink}>
          <Link2 aria-hidden />
          Type et association…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="min-h-11"
          onSelect={onDelete}
        >
          <Trash2 aria-hidden />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DocumentRow(props: DocumentItemProps & { showLink: boolean }) {
  const { file, previewUrl, onOpen, showLink } = props
  const { itinerary } = useTrip()
  const link = showLink ? describeLink(file, itinerary).long : null
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onOpen}
        className="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 text-left outline-none focus-visible:ring-[3px]"
      >
        <DocumentThumb file={file} previewUrl={previewUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold">
            {file.name}
          </span>
          <span className="text-muted-foreground block truncate text-[13px]">
            {link ? `${link} · ` : ''}
            {documentMeta(file)}
          </span>
        </span>
      </button>
      <DocumentMenu {...props} />
    </li>
  )
}

function DocumentCard(props: DocumentItemProps) {
  const { file, previewUrl, onOpen } = props
  return (
    <li className="bg-card border-border relative flex flex-col overflow-hidden rounded-[20px] border">
      <button
        type="button"
        onClick={onOpen}
        className="focus-visible:ring-ring/50 flex flex-col text-left outline-none focus-visible:ring-[3px]"
      >
        <span className="bg-muted/50 flex h-28 items-center justify-center p-3">
          <DocumentThumb
            file={file}
            previewUrl={previewUrl}
            size="lg"
            className="aspect-[3/4] h-full w-auto max-w-full"
          />
        </span>
        <span className="min-w-0 px-3 pt-2 pr-11 pb-3">
          <span className="block truncate text-sm font-extrabold">
            {file.name}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {documentCategoryLabel(file)} · {formatFileSize(file.size)}
          </span>
        </span>
      </button>
      <div className="absolute right-0 bottom-0.5">
        <DocumentMenu {...props} />
      </div>
    </li>
  )
}
