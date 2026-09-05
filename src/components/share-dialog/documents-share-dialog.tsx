'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconCloudUpload,
  IconCopy,
  IconFile,
  IconFileTypePdf,
  IconFiles,
  IconLink,
  IconPackage,
  IconPhoto,
  IconRefresh,
  IconServer,
  IconShare2,
} from '@tabler/icons-react'
import { useDocuments, type StoredFile } from '@/hooks/use-documents'
import {
  DOCUMENTS_SHARE_MAX_BYTES,
  documentsTotalSize,
  packDocuments,
} from '@/lib/document-share'
import {
  canShareNatively,
  createShareCode,
  formatExpiresIn,
  formatShareCode,
  getShareCodeUrl,
  shareNatively,
  type ShareCode,
} from '@/lib/share'
import { useClipboard } from '@/hooks/use-clipboard'
import { trackEvent } from '@/lib/analytics/client'
import { shareFailureReason } from '@/lib/analytics/metrics'
import { cn, formatFileSize } from '@/lib/utils'

/** Étapes affichées pendant la préparation puis l'envoi. */
const SENDING_STEPS = [
  { label: 'Préparation des documents…', Icon: IconPackage },
  { label: 'Connexion au serveur…', Icon: IconServer },
  { label: 'Envoi des documents…', Icon: IconCloudUpload },
]

/** Ce que la feuille de partage du système annonce — jamais les documents. */
const NATIVE_SHARE_TITLE = 'Mes documents de voyage sur TripBrain'
const NATIVE_SHARE_TEXT =
  'Voici mes documents de voyage : ouvre ce lien pour les récupérer dans TripBrain.'

type ShareState =
  | { status: 'select' }
  | { status: 'sending' }
  | { status: 'ready'; share: ShareCode; count: number }
  | { status: 'error'; message: string }

function toFrenchError(err: unknown): string {
  if (!(err instanceof Error)) return 'Erreur inconnue lors du partage.'
  const message = err.message.toLowerCase()
  if (message.includes('network') || message.includes('failed to fetch')) {
    return 'Erreur réseau : vérifiez votre connexion internet et réessayez.'
  }
  // /api/share et `packDocuments` répondent déjà en français.
  return err.message
}

/** Version lisible d'une URL : sans protocole, c'est le domaine qui rassure. */
function toDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

function DocumentIcon({ type }: { type: string }) {
  if (type === 'application/pdf') {
    return <IconFileTypePdf className="h-4 w-4 shrink-0 text-red-500" />
  }
  if (type.startsWith('image/')) {
    return <IconPhoto className="h-4 w-4 shrink-0 text-blue-500" />
  }
  return <IconFile className="text-muted-foreground h-4 w-4 shrink-0" />
}

interface DocumentsShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Appelé quand l'utilisateur veut revenir à la dialog précédente. */
  onNavBack?: () => void
}

/**
 * Partage d'une sélection de documents par code.
 *
 * Rien ne part sans un choix explicite : la dialog s'ouvre sur la liste des
 * documents de l'appareil, et c'est ce qui est coché — et seulement cela — qui
 * est déposé sur le serveur, le temps du transfert.
 *
 * Le panneau n'est monté que dialog ouverte : les documents, blobs compris, ne
 * sont donc lus que lorsqu'il y a une sélection à faire.
 */
export function DocumentsShareDialog({
  open,
  onOpenChange,
  onNavBack,
}: DocumentsShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* En-tête fixe, corps défilant : la dialog tient sur tous les écrans. */}
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
        <DocumentsSharePanel
          onNavBack={
            onNavBack
              ? () => {
                  onOpenChange(false)
                  onNavBack()
                }
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  )
}

function DocumentsSharePanel({ onNavBack }: { onNavBack?: () => void }) {
  const { files, loading } = useDocuments()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [state, setState] = useState<ShareState>({ status: 'select' })
  const [stepIndex, setStepIndex] = useState(0)
  // Décidé après le montage : `navigator.share` n'existe pas au rendu serveur.
  const [hasNativeShare, setHasNativeShare] = useState(false)

  const codeClipboard = useClipboard()
  const linkClipboard = useClipboard()

  useEffect(() => {
    setHasNativeShare(canShareNatively())
  }, [])

  const isSending = state.status === 'sending'

  // Anime les étapes d'envoi — progression linéaire, sans boucle.
  useEffect(() => {
    if (!isSending) return
    setStepIndex(0)
    const timers = [
      setTimeout(() => setStepIndex(1), 300),
      setTimeout(() => setStepIndex(2), 600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [isSending])

  const totalSize = useMemo(() => documentsTotalSize(files), [files])

  // Une seule fois, dès que les documents sont connus : tout est proposé, sauf
  // si l'ensemble dépasse déjà ce qu'un partage peut porter — mieux vaut une
  // liste à cocher qu'un avertissement d'entrée de jeu.
  const initializedRef = useRef(false)
  useEffect(() => {
    if (loading || initializedRef.current) return
    initializedRef.current = true
    if (totalSize <= DOCUMENTS_SHARE_MAX_BYTES) {
      setSelectedIds(new Set(files.map((file) => file.id)))
    }
  }, [loading, files, totalSize])

  const selected = useMemo(
    () => files.filter((file) => selectedIds.has(file.id)),
    [files, selectedIds],
  )
  const selectedSize = documentsTotalSize(selected)
  const isOverLimit = selectedSize > DOCUMENTS_SHARE_MAX_BYTES

  const toggle = (file: StoredFile) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (!next.delete(file.id)) next.add(file.id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds((previous) =>
      previous.size === files.length
        ? new Set()
        : new Set(files.map((file) => file.id)),
    )
  }

  const handleShare = useCallback(async () => {
    if (selected.length === 0) return

    setState({ status: 'sending' })
    try {
      const payload = await packDocuments(selected)
      const share = await createShareCode(payload, 'documents')

      setState({ status: 'ready', share, count: selected.length })
      trackEvent('documents_shared', { count: selected.length })
    } catch (err) {
      setState({ status: 'error', message: toFrenchError(err) })
      trackEvent('documents_share_failed', { reason: shareFailureReason(err) })
    }
  }, [selected])

  /**
   * Ouvre la feuille de partage du système avec le lien.
   *
   * Appelée directement depuis le clic — les navigateurs refusent un partage
   * natif qui n'est pas déclenché par un geste.
   */
  const handleNativeShare = useCallback(async () => {
    if (state.status !== 'ready') return
    const url = getShareCodeUrl(state.share.code, 'documents')

    const outcome = await shareNatively({
      title: NATIVE_SHARE_TITLE,
      text: NATIVE_SHARE_TEXT,
      url,
    })

    trackEvent('share_link_sent', { outcome })
    if (outcome === 'unavailable') {
      setHasNativeShare(false)
      linkClipboard.copy(url)
    }
  }, [state, linkClipboard])

  const shareUrl =
    state.status === 'ready'
      ? getShareCodeUrl(state.share.code, 'documents')
      : null
  const expiresIn =
    state.status === 'ready' ? formatExpiresIn(state.share.expiresAt) : null

  const description =
    state.status === 'sending'
      ? 'Envoi des documents…'
      : state.status === 'ready'
        ? 'Vos documents sont prêts à être récupérés sur l’autre appareil.'
        : state.status === 'error'
          ? 'Le partage n’a pas pu être préparé.'
          : 'Choisissez les documents à envoyer, puis générez un code.'

  return (
    <>
      <DialogHeader className="px-4 pt-5 pb-3 text-left sm:px-6 sm:pt-6">
        <div className="flex items-center gap-2 pr-8">
          {/* Retour — ferme cette dialog et ré-ouvre la précédente */}
          {onNavBack && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Retour"
              onClick={onNavBack}
              className="-ml-2 shrink-0 opacity-70 hover:opacity-100"
            >
              <IconArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <IconFiles className="h-5 w-5 shrink-0" />
            Partager des documents
          </DialogTitle>
        </div>
        <DialogDescription className="text-pretty">
          {description}
        </DialogDescription>
      </DialogHeader>

      {/* Conteneur stable — min-h évite le layout shift entre les états */}
      <div className="flex min-h-[20rem] flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-6 sm:pb-6">
        {state.status === 'sending' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
            <div className="flex flex-col items-start gap-2">
              {SENDING_STEPS.map(({ label, Icon }, i) => (
                <div
                  key={label}
                  className={cn(
                    'flex items-center gap-2 text-sm transition-all duration-300',
                    i < stepIndex
                      ? 'text-muted-foreground opacity-50'
                      : i === stepIndex
                        ? 'text-foreground font-medium opacity-100'
                        : 'text-muted-foreground opacity-25',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="bg-destructive/10 rounded-full p-4">
              <IconAlertTriangle className="text-destructive h-8 w-8" />
            </div>
            <p className="text-destructive text-sm leading-relaxed">
              {state.message}
            </p>
            <Button
              variant="outline"
              onClick={() => setState({ status: 'select' })}
              className="w-full gap-2"
            >
              <IconRefresh className="h-4 w-4" />
              Revenir à la sélection
            </Button>
          </div>
        )}

        {state.status === 'ready' && shareUrl && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <QRCodeCanvas
                  value={shareUrl}
                  size={160}
                  level="M"
                  marginSize={1}
                  className="h-auto w-full max-w-[160px]"
                />
              </div>
              <p className="text-muted-foreground text-center text-sm text-pretty">
                {state.count} document{state.count > 1 ? 's' : ''} envoyé
                {state.count > 1 ? 's' : ''} : scannez le QR code, envoyez le
                lien, ou dictez le code.
              </p>
              <p className="bg-muted/60 border-border text-foreground rounded-lg border px-4 py-3 font-mono text-2xl font-semibold tracking-[0.2em] tabular-nums">
                {formatShareCode(state.share.code)}
              </p>
              <p className="text-muted-foreground w-full truncate text-center font-mono text-xs">
                {toDisplayUrl(shareUrl)}
              </p>
              {expiresIn && (
                <p className="text-muted-foreground text-center text-xs">
                  Valable encore {expiresIn}.
                </p>
              )}
            </div>

            <div className="mt-auto flex w-full flex-col gap-2">
              {hasNativeShare && (
                <Button onClick={handleNativeShare} className="w-full gap-2">
                  <IconShare2 className="h-4 w-4" />
                  Partager le lien
                </Button>
              )}
              <div className="flex w-full gap-2">
                <Button
                  variant={hasNativeShare ? 'outline' : 'default'}
                  onClick={() => linkClipboard.copy(shareUrl)}
                  className="flex-1 gap-2 text-xs sm:text-sm"
                >
                  {linkClipboard.copied ? (
                    <IconCheck className="h-4 w-4" />
                  ) : (
                    <IconLink className="h-4 w-4" />
                  )}
                  {linkClipboard.copied ? 'Lien copié' : 'Copier le lien'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => codeClipboard.copy(state.share.code)}
                  className="flex-1 gap-2 text-xs sm:text-sm"
                >
                  {codeClipboard.copied ? (
                    <IconCheck className="h-4 w-4" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                  {codeClipboard.copied ? 'Code copié' : 'Copier le code'}
                </Button>
              </div>
            </div>
          </>
        )}

        {state.status === 'select' &&
          (loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
              <p className="text-muted-foreground text-sm">Chargement…</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="bg-muted rounded-full p-4">
                <IconFiles className="text-muted-foreground h-8 w-8" />
              </div>
              <p className="text-muted-foreground text-sm text-pretty">
                Aucun document sur cet appareil. Ajoutez vos billets et
                réservations dans l’onglet « Docs », puis revenez ici.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  <span className="text-foreground font-semibold">
                    {selected.length}
                  </span>{' '}
                  / {files.length} sélectionné
                  {selected.length > 1 ? 's' : ''} ·{' '}
                  {formatFileSize(selectedSize)}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  className="h-7 px-2 text-xs"
                >
                  {selectedIds.size === files.length
                    ? 'Tout décocher'
                    : 'Tout cocher'}
                </Button>
              </div>

              <ul className="border-border/70 divide-border/60 divide-y rounded-lg border">
                {files.map((file) => (
                  <li key={file.id}>
                    <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors">
                      <Checkbox
                        checked={selectedIds.has(file.id)}
                        onCheckedChange={() => toggle(file)}
                        aria-label={`Partager ${file.name}`}
                      />
                      <DocumentIcon type={file.type} />
                      <span className="min-w-0 flex-1">
                        <span
                          className="text-foreground block truncate text-sm"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {formatFileSize(file.size)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              {isOverLimit ? (
                <p className="bg-warning/10 text-foreground flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed">
                  <IconAlertTriangle className="text-warning mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Sélection trop lourde pour un partage (
                  {formatFileSize(DOCUMENTS_SHARE_MAX_BYTES)} maximum). Décochez
                  quelques documents, ou passez par l’export ZIP.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Les documents cochés sont déposés sur un serveur, accessibles
                  uniquement avec le code, puis{' '}
                  <strong className="text-foreground">
                    supprimés après 1&nbsp;heure
                  </strong>
                  .
                </p>
              )}

              <Button
                onClick={handleShare}
                disabled={selected.length === 0 || isOverLimit}
                className="w-full gap-2"
              >
                <IconCloudUpload className="h-4 w-4" />
                Générer le code
              </Button>
            </>
          ))}
      </div>
    </>
  )
}
