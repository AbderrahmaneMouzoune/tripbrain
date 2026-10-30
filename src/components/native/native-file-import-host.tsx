'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check } from 'lucide-react'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { TripPreviewStep } from '@/components/receive/trip-preview-step'
import type { ReceivedTrip } from '@/components/receive/received-trip'
import {
  classifyFiles,
  readItineraryFiles,
} from '@/components/onboarding/import-files'
import { useDocuments } from '@/hooks/use-documents'
import { trackEvent } from '@/lib/analytics/client'
import { documentKindOf, importFailureReason } from '@/lib/analytics/metrics'
import { onNativeFileImport, triggerHaptic } from '@/lib/native-app'
import { itineraryFileName, routeNativeImport } from '@/lib/native-file-import'
import { cn } from '@/lib/utils'

interface Notice {
  tone: 'success' | 'error'
  message: string
}

/** Durée d'affichage d'une pastille : le temps de la lire. */
const NOTICE_MS = 3200

/**
 * Fichier ouvert « avec TripBrain » depuis une autre app (Mail, Fichiers,
 * AirDrop), remis par le natif :
 * - itinéraire (.json, .xlsx, .csv) : l'aperçu s'ouvre au-dessus de tout,
 *   avec ou sans voyage, comme un partage reçu par lien ;
 * - archive de documents (.zip) : restaurée dans le voyage consulté ;
 * - PDF ou image : rangé dans les documents du voyage, puis ouvert.
 *
 * Sans effet hors de l'app : seul le natif émet `file/import`.
 */
export function NativeFileImportHost() {
  const { hasData } = useTrip()
  const { push, setTab } = useAppNav()
  const { addFiles, importZip } = useDocuments()
  const [received, setReceived] = useState<ReceivedTrip | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Message affiché : plusieurs fichiers partagés d'un coup (trois CSV) ne
  // répètent pas la même pastille ni la même vibration.
  const shownMessage = useRef<string | null>(null)

  const notify = useCallback((next: Notice) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    const repeated = shownMessage.current === next.message
    shownMessage.current = next.message
    setNotice(next)
    noticeTimer.current = setTimeout(() => {
      shownMessage.current = null
      setNotice(null)
    }, NOTICE_MS)
    if (!repeated) triggerHaptic(next.tone === 'success' ? 'success' : 'error')
  }, [])

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    },
    [],
  )

  const importItinerary = useCallback(
    async (file: File) => {
      const named =
        itineraryFileName(file.name, file.type) === file.name
          ? file
          : new File([file], itineraryFileName(file.name, file.type), {
              type: file.type,
            })
      const verdict = classifyFiles([named.name])
      if (!verdict.ok) {
        // Un CSV seul : il en faut trois, choisis ensemble. Le natif remet un
        // fichier par événement, l'import groupé passe donc par l'app.
        notify({
          tone: 'error',
          message: named.name.toLowerCase().endsWith('.csv')
            ? 'Les fichiers CSV s’importent ensemble depuis « Importer un fichier » : ouvrez plutôt le modèle Excel ou JSON.'
            : verdict.message,
        })
        return
      }
      try {
        const parsed = await readItineraryFiles([named], verdict.format)
        setReceived({
          days: parsed.itinerary,
          title: parsed.title,
          source: parsed.source,
          via: 'file',
          analytics: { kind: 'file', source: parsed.source },
          fileName: named.name,
        })
      } catch (error) {
        trackEvent('trip_import_failed', {
          source: verdict.format,
          reason: importFailureReason(error),
        })
        notify({
          tone: 'error',
          message:
            error instanceof SyntaxError
              ? 'Ce fichier JSON est illisible : vérifiez qu’il est complet.'
              : error instanceof Error
                ? error.message
                : 'Ce fichier n’a pas pu être lu.',
        })
      }
    },
    [notify],
  )

  const importDocument = useCallback(
    async (file: File) => {
      try {
        const [stored] = await addFiles([file])
        trackEvent('document_added', {
          count: 1,
          kind: documentKindOf([file.type]),
        })
        triggerHaptic('success')
        if (stored) push({ kind: 'document', documentId: stored.id })
      } catch {
        notify({
          tone: 'error',
          message: 'Le document n’a pas pu être enregistré sur ce téléphone.',
        })
      }
    },
    [addFiles, push, notify],
  )

  const importDocumentsZip = useCallback(
    async (file: File) => {
      try {
        const { imported } = await importZip(file)
        if (imported === 0) {
          notify({
            tone: 'error',
            message: 'Cette archive ne contient aucun document.',
          })
          return
        }
        trackEvent('document_added', { count: imported, kind: 'mixed' })
        setTab('documents')
        notify({
          tone: 'success',
          message:
            imported > 1
              ? `${imported} documents ajoutés`
              : '1 document ajouté',
        })
      } catch (error) {
        notify({
          tone: 'error',
          message:
            error instanceof Error && error.message
              ? `Archive illisible : ${error.message.toLowerCase()}.`
              : 'Archive illisible.',
        })
      }
    },
    [importZip, setTab, notify],
  )

  // Le dernier aiguillage, sans se réabonner au natif à chaque rendu.
  const handleFile = useCallback(
    (file: File) => {
      const route = routeNativeImport(file)
      switch (route.kind) {
        case 'itinerary':
          void importItinerary(file)
          return
        case 'documents-zip':
        case 'document':
          if (!hasData) {
            notify({
              tone: 'error',
              message:
                'Créez ou importez d’abord un voyage pour y ranger ce document.',
            })
            return
          }
          if (route.kind === 'document') void importDocument(file)
          else void importDocumentsZip(file)
          return
        case 'too-large':
          notify({
            tone: 'error',
            message: 'Fichier trop volumineux (15 Mo au maximum).',
          })
          return
        case 'unsupported':
          notify({ tone: 'error', message: 'Format non pris en charge.' })
          return
      }
    },
    [hasData, importItinerary, importDocument, importDocumentsZip, notify],
  )
  const handleFileRef = useRef(handleFile)
  useEffect(() => {
    handleFileRef.current = handleFile
  }, [handleFile])

  // Les fichiers arrivés pendant le démarrage sont rejoués à l'abonnement.
  useEffect(() => onNativeFileImport((file) => handleFileRef.current(file)), [])

  // La page dessous ne défile pas pendant l'aperçu.
  useEffect(() => {
    if (!received) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [received])

  return (
    <>
      {received && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Importer un fichier"
          className="bg-background animate-screen fixed inset-0 z-50 overflow-y-auto overscroll-contain"
        >
          <TripPreviewStep
            received={received}
            eyebrow="Fichier reçu"
            backIcon="close"
            onBack={() => setReceived(null)}
            onSaved={() => {
              // Retour haptique et invitation à noter : faits par l'aperçu.
              setReceived(null)
              push({ kind: 'trip-ready' })
            }}
          />
        </div>
      )}
      {notice &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom)+104px)] z-[70] flex justify-center px-4"
          >
            <span
              className={cn(
                'animate-pop flex max-w-sm items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold shadow-lg',
                notice.tone === 'success'
                  ? 'bg-ink text-ink-foreground'
                  : 'bg-destructive text-white',
              )}
            >
              {notice.tone === 'success' ? (
                <Check className="size-4 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="size-4 shrink-0" aria-hidden />
              )}
              {notice.message}
            </span>
          </div>,
          document.body,
        )}
    </>
  )
}
