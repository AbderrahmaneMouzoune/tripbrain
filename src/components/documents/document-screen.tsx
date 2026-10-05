'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import {
  downloadStoredFile,
  useDocuments,
  type StoredFile,
} from '@/hooks/use-documents'
import { trackEvent } from '@/lib/analytics/client'
import { documentKind } from '@/lib/analytics/metrics'
import {
  describeLink,
  documentCategoryLabel,
  fileFormatLabel,
  formatFileSize,
} from '@/lib/document-organize'
import { cn } from '@/lib/utils'
import { DocumentThumb } from './document-thumb'
import {
  DeleteDocumentDialog,
  LinkDocumentSheet,
  downloadDocument,
} from './document-actions'

type PreviewKind = 'image' | 'pdf' | 'text' | 'none'

function previewKind(file: StoredFile): PreviewKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return 'pdf'
  }
  if (file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name)) {
    return 'text'
  }
  return 'none'
}

/**
 * Le navigateur sait-il afficher un PDF dans la page ? Chrome sur Android
 * répond non : il faut alors confier le fichier au lecteur du téléphone.
 */
function canEmbedPdf(): boolean {
  if (typeof navigator === 'undefined') return false
  const flag = (navigator as Navigator & { pdfViewerEnabled?: boolean })
    .pdfViewerEnabled
  return flag === true
}

/**
 * Partage le fichier vers une autre app (messagerie, e-mail, fichiers) quand
 * le navigateur sait partager des fichiers ; sinon, le télécharge.
 */
async function shareDocument(file: StoredFile): Promise<void> {
  const kind = documentKind(file.type)
  const shared = new File([file.blob], file.name, {
    type: file.type || 'application/octet-stream',
  })
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [shared] })
  if (canShareFiles) {
    try {
      await navigator.share({ files: [shared], title: file.name })
      trackEvent('document_shared', { kind, method: 'share' })
    } catch {
      // Partage annulé : rien à faire.
    }
    return
  }
  downloadStoredFile(file)
  trackEvent('document_shared', { kind, method: 'download' })
}

/** Aperçu plein écran d'un document, sur fond de nuit. */
export function DocumentScreen({ screen, onClose }: ScreenProps<'document'>) {
  const { itinerary } = useTrip()
  const { files, loading } = useDocuments()
  const file = files.find((item) => item.id === screen.documentId) ?? null
  const [linkOpen, setLinkOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sharing, setSharing] = useState(false)

  // Document supprimé entre-temps (ou introuvable) : l'écran se referme.
  // Une seule fermeture : après une suppression, la liste relue ne contient
  // plus le document, et un second `onClose` fermerait l'écran du dessous.
  const closed = useRef(false)
  const close = useCallback(() => {
    if (closed.current) return
    closed.current = true
    onClose()
  }, [onClose])
  useEffect(() => {
    if (!loading && !file) close()
  }, [loading, file, close])

  const link = useMemo(
    () => (file ? describeLink(file, itinerary) : null),
    [file, itinerary],
  )

  if (!file || !link) {
    return (
      <div className="bg-ink text-ink-foreground flex min-h-dvh items-center justify-center">
        <Loader2 aria-label="Chargement" className="size-6 animate-spin" />
      </div>
    )
  }

  const kind = previewKind(file)

  return (
    <div className="bg-ink text-ink-foreground flex h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button
          type="button"
          onClick={close}
          aria-label="Fermer l’aperçu"
          className="pressable focus-visible:ring-ring/60 flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 outline-none focus-visible:ring-[3px]"
        >
          <X aria-hidden className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[15px] font-extrabold">{file.name}</h1>
          <p className="text-ink-foreground/70 mt-px text-xs font-bold">
            {fileFormatLabel(file)} · {formatFileSize(file.size)}
          </p>
        </div>
        {/* Équilibre visuel avec le bouton de fermeture. */}
        <span aria-hidden className="size-11 shrink-0" />
      </header>

      <div className="animate-fade relative flex min-h-0 flex-1 items-center justify-center px-4 py-4">
        <Preview file={file} kind={kind} />
      </div>

      <nav
        aria-label="Actions sur le document"
        className="flex rounded-t-3xl bg-white/5 px-2 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+14px)]"
      >
        <ActionButton
          icon={sharing ? Loader2 : Share2}
          label="Partager"
          spinning={sharing}
          onClick={async () => {
            setSharing(true)
            await shareDocument(file)
            setSharing(false)
          }}
        />
        <ActionButton
          icon={Download}
          label="Télécharger"
          onClick={() => downloadDocument(file)}
        />
        <ActionButton
          icon={Link2}
          highlight
          ariaLabel={`${documentCategoryLabel(file)}, lié à : ${link.long} — modifier le type et l’association`}
          label={
            <span className="leading-[1.15]">
              {documentCategoryLabel(file)} ·{' '}
              {link.dayIndex >= 0 ? link.short : 'Tout le voyage'}
              <span className="text-ink-foreground/70 block text-[11px] font-bold underline">
                modifier
              </span>
            </span>
          }
          onClick={() => setLinkOpen(true)}
        />
        <ActionButton
          icon={Trash2}
          label="Supprimer"
          destructive
          onClick={() => setDeleteOpen(true)}
        />
      </nav>

      {linkOpen && (
        <LinkDocumentSheet file={file} open onOpenChange={setLinkOpen} />
      )}
      <DeleteDocumentDialog
        file={file}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={close}
      />
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  ariaLabel,
  onClick,
  highlight,
  destructive,
  spinning,
}: {
  icon: typeof Share2
  label: ReactNode
  ariaLabel?: string
  onClick: () => void
  highlight?: boolean
  destructive?: boolean
  spinning?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="pressable focus-visible:ring-ring/60 flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-extrabold outline-none focus-visible:ring-[3px]"
    >
      <span
        className={cn(
          'flex h-9 w-11 items-center justify-center rounded-full',
          highlight
            ? 'bg-primary text-primary-foreground'
            : destructive
              ? 'bg-destructive text-white'
              : 'bg-white/10',
        )}
      >
        <Icon
          aria-hidden
          className={cn('size-5', spinning && 'animate-spin')}
        />
      </span>
      {label}
    </button>
  )
}

function Preview({ file, kind }: { file: StoredFile; kind: PreviewKind }) {
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [embedPdf, setEmbedPdf] = useState(false)

  useEffect(() => {
    setEmbedPdf(canEmbedPdf())
    const objectUrl = URL.createObjectURL(file.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  useEffect(() => {
    if (kind !== 'text') return
    let cancelled = false
    void file.blob.text().then((content) => {
      if (!cancelled) setText(content)
    })
    return () => {
      cancelled = true
    }
  }, [file, kind])

  if (!url) return null

  if (kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`Aperçu de ${file.name}`}
        className="max-h-full max-w-full touch-pinch-zoom rounded-md bg-white object-contain shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
      />
    )
  }

  if (kind === 'pdf' && embedPdf) {
    return (
      <iframe
        src={url}
        title={`Aperçu de ${file.name}`}
        className="h-full w-full rounded-md bg-white shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
      />
    )
  }

  if (kind === 'text') {
    return (
      <pre className="text-foreground h-full w-full overflow-auto rounded-md bg-white p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
        {text ?? ''}
      </pre>
    )
  }

  // PDF que le navigateur n'affiche pas dans la page, ou format inconnu :
  // on le confie au lecteur du téléphone.
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="h-48 w-36">
        <DocumentThumb file={file} size="lg" />
      </div>
      <p className="text-ink-foreground/80 max-w-64 text-sm">
        {kind === 'pdf'
          ? 'Ce navigateur n’affiche pas les PDF dans la page.'
          : 'Pas d’aperçu pour ce format.'}
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener"
        onClick={() =>
          trackEvent('document_opened', { kind: documentKind(file.type) })
        }
        className="bg-primary text-primary-foreground pressable focus-visible:ring-ring/60 flex min-h-12 items-center gap-2 rounded-2xl px-5 text-[15px] font-extrabold outline-none focus-visible:ring-[3px]"
      >
        <ExternalLink aria-hidden className="size-4" />
        Ouvrir avec le téléphone
      </a>
    </div>
  )
}
