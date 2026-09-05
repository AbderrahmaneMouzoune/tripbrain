'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBraces,
  IconCheck,
  IconCloudUpload,
  IconCopy,
  IconDownload,
  IconLink,
  IconPackage,
  IconQrcode,
  IconRefresh,
  IconSearch,
  IconServer,
  IconShare2,
  IconWifiOff,
} from '@tabler/icons-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  SHARE_INLINE_LIMIT,
  canShareNatively,
  compressItinerary,
  createShareCode,
  formatExpiresIn,
  formatShareCode,
  getInlineQrUrl,
  getShareCodeUrl,
  shareNatively,
  type ShareCode,
} from '@/lib/share'
import { useClipboard } from '@/hooks/use-clipboard'
import { trackEvent } from '@/lib/analytics/client'
import { shareFailureReason } from '@/lib/analytics/metrics'
import { saveFile } from '@/lib/save-file'
import { cn } from '@/lib/utils'

// Étapes affichées pendant la compression locale
const LOADING_STEPS = [
  { label: 'Analyse de l’itinéraire…', Icon: IconSearch },
  { label: 'Encodage des données…', Icon: IconBraces },
  { label: 'Compression en cours…', Icon: IconPackage },
]

// Étapes affichées pendant l'envoi vers le bucket
const UPLOADING_STEPS = [
  { label: 'Connexion au serveur…', Icon: IconServer },
  { label: 'Envoi des données…', Icon: IconCloudUpload },
  { label: 'Génération du lien…', Icon: IconLink },
]

/** Ce que la feuille de partage du système annonce — jamais le voyage lui-même. */
const NATIVE_SHARE_TITLE = 'Mon voyage sur TripBrain'
const NATIVE_SHARE_TEXT =
  'Voici mon itinéraire de voyage : ouvre ce lien pour le retrouver dans TripBrain.'

/** Convertit une erreur inconnue en message explicite en français. */
function toFrenchError(err: unknown, context: 'share' | 'compress'): string {
  if (!(err instanceof Error)) {
    return context === 'share'
      ? 'Erreur inconnue lors du partage.'
      : 'Erreur inconnue lors de la compression.'
  }

  const msg = err.message.toLowerCase()
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Erreur réseau : vérifiez votre connexion internet et réessayez.'
  }
  // Les routes /api/share répondent déjà en français : leur message passe tel quel.
  if (context === 'share') return err.message
  return `Erreur de compression : ${err.message}`
}

/** Version lisible d'une URL : sans protocole, c'est le domaine qui rassure. */
function toDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

interface ShareExportDialogProps {
  itinerary: DayItinerary[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Appelé quand l'utilisateur veut revenir à la dialog précédente */
  onNavBack?: () => void
}

type ExportState =
  | { status: 'compressing' }
  | { status: 'ready'; compressed: string }
  | { status: 'error'; message: string }

export function ShareExportDialog({
  itinerary,
  open,
  onOpenChange,
  onNavBack,
}: ShareExportDialogProps) {
  const [state, setState] = useState<ExportState>({ status: 'compressing' })
  const [share, setShare] = useState<ShareCode | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [tab, setTab] = useState<'qr' | 'link'>('qr')
  // Décidé après le montage : `navigator.share` n'existe pas au rendu serveur.
  const [hasNativeShare, setHasNativeShare] = useState(false)

  const codeClipboard = useClipboard()
  const linkClipboard = useClipboard()

  const isBusy = state.status === 'compressing' || isSharing

  useEffect(() => {
    setHasNativeShare(canShareNatively())
  }, [])

  // Anime les étapes de chargement / envoi — progression linéaire sans boucle :
  // étape 1 visible dès le départ, étape 2 à 250 ms, étape 3 à 450 ms.
  useEffect(() => {
    if (!isBusy) return
    setStepIndex(0)
    const t1 = setTimeout(() => setStepIndex(1), 250)
    const t2 = setTimeout(() => setStepIndex(2), 450)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [isBusy])

  // À l'ouverture, l'itinéraire est compressé localement : c'est sa taille qui
  // décide si un QR code autonome suffit ou s'il faut passer par le serveur.
  useEffect(() => {
    if (!open) return

    setState({ status: 'compressing' })
    setShare(null)
    setShareError(null)

    compressItinerary(itinerary)
      .then((compressed) => {
        setState({ status: 'ready', compressed })

        // Sous la limite, le QR code embarque tout le voyage : le partage est
        // déjà fait, sans le moindre passage par le réseau.
        if (compressed.length <= SHARE_INLINE_LIMIT) {
          trackEvent('share_created', {
            method: 'qr_inline',
            days_count: itinerary.length,
          })
        }
      })
      .catch((err) => {
        setState({ status: 'error', message: toFrenchError(err, 'compress') })
        trackEvent('share_failed', {
          method: 'qr_inline',
          reason: shareFailureReason(err),
        })
      })
  }, [open, itinerary, revision])

  const handleCreateCode = useCallback(async () => {
    if (state.status !== 'ready') return

    setShareError(null)
    setIsSharing(true)
    try {
      setShare(await createShareCode(state.compressed))
      trackEvent('share_created', {
        method: 'server_code',
        days_count: itinerary.length,
      })
    } catch (err) {
      setShareError(toFrenchError(err, 'share'))
      trackEvent('share_failed', {
        method: 'server_code',
        reason: shareFailureReason(err),
      })
    } finally {
      setIsSharing(false)
    }
  }, [state, itinerary.length])

  const handleDownload = useCallback(() => {
    const canvas = document.querySelector(
      '#qr-export-canvas',
    ) as HTMLCanvasElement | null
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (blob) saveFile(blob, 'tripbrain-qrcode.png')
    }, 'image/png')
  }, [])

  /**
   * Ouvre la feuille de partage du système avec le lien du voyage.
   *
   * Appelée directement depuis le clic — les navigateurs refusent un partage
   * natif qui n'est pas déclenché par un geste. Si la feuille n'aboutit pas,
   * le lien part au moins dans le presse-papier.
   */
  const handleNativeShare = useCallback(async () => {
    if (!share) return
    const url = getShareCodeUrl(share.code)

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
  }, [share, linkClipboard])

  const handleNavBack = useCallback(() => {
    onOpenChange(false)
    onNavBack?.()
  }, [onOpenChange, onNavBack])

  const activeSteps = isSharing ? UPLOADING_STEPS : LOADING_STEPS

  // Un itinéraire compact tient entièrement dans le QR code : rien n'est envoyé
  // sur le réseau, et le code scanné fonctionne indéfiniment.
  const canInline =
    state.status === 'ready' && state.compressed.length <= SHARE_INLINE_LIMIT

  const shareUrl = share ? getShareCodeUrl(share.code) : null

  const qrValue =
    state.status !== 'ready'
      ? null
      : canInline
        ? getInlineQrUrl(state.compressed)
        : shareUrl

  const sizeKb =
    state.status === 'ready'
      ? (state.compressed.length / 1024).toFixed(1)
      : null

  const expiresIn = formatExpiresIn(share?.expiresAt ?? null)

  const description = isBusy
    ? 'Préparation du partage…'
    : state.status === 'error'
      ? 'Le partage n’a pas pu être préparé.'
      : canInline && tab === 'qr'
        ? 'Tout le voyage tient dans ce QR code, sans passer par le réseau.'
        : share
          ? 'Votre voyage est prêt à être envoyé.'
          : 'Choisissez comment envoyer votre voyage sur l’autre appareil.'

  /** Explication + erreur communes aux deux onglets quand le serveur est requis. */
  const remoteCta = (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="bg-primary/10 rounded-full p-4">
        <IconCloudUpload className="text-primary h-8 w-8" />
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
        {tab === 'qr' && canInline === false && sizeKb
          ? `Cet itinéraire (${sizeKb} Ko) est trop volumineux pour tenir dans un QR code. `
          : ''}
        Vos données seront déposées sur un serveur, accessibles uniquement avec
        le lien généré, puis{' '}
        <strong className="text-foreground">
          supprimées après 1&nbsp;heure
        </strong>
        .
      </p>
      {shareError && (
        <p className="text-destructive text-sm leading-relaxed">{shareError}</p>
      )}
    </div>
  )

  /** Feuille de partage du système — proposée dans les deux onglets. */
  const nativeShareButton = shareUrl && hasNativeShare && (
    <Button onClick={handleNativeShare} className="w-full gap-2">
      <IconShare2 className="h-4 w-4" />
      Partager le lien
    </Button>
  )

  /** Repli universel : copier, pour coller où l'on veut. */
  const copyActions = shareUrl && (
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
        onClick={() => codeClipboard.copy(share?.code ?? '')}
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
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* En-tête fixe, corps défilant : la dialog tient sur tous les écrans. */}
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
        <DialogHeader className="px-4 pt-5 pb-3 text-left sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2 pr-8">
            {/* Retour — ferme cette dialog et ré-ouvre la précédente */}
            {onNavBack && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Retour"
                onClick={handleNavBack}
                className="-ml-2 shrink-0 opacity-70 hover:opacity-100"
              >
                <IconArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle className="flex min-w-0 items-center gap-2">
              <IconQrcode className="h-5 w-5 shrink-0" />
              Partager l’itinéraire
            </DialogTitle>
          </div>
          <DialogDescription className="text-pretty">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Conteneur stable — min-h évite le layout shift entre les états */}
        <div className="flex min-h-[20rem] flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-5 sm:min-h-[22rem] sm:px-6 sm:pb-6">
          {isBusy && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
              <div className="flex flex-col items-start gap-2">
                {activeSteps.map(({ label, Icon }, i) => (
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

          {!isBusy && state.status === 'error' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="bg-destructive/10 rounded-full p-4">
                <IconAlertTriangle className="text-destructive h-8 w-8" />
              </div>
              <p className="text-destructive text-sm leading-relaxed">
                {state.message}
              </p>
              <Button
                variant="outline"
                onClick={() => setRevision((r) => r + 1)}
                className="w-full gap-2"
              >
                <IconRefresh className="h-4 w-4" />
                Réessayer
              </Button>
            </div>
          )}

          {!isBusy && state.status === 'ready' && (
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as 'qr' | 'link')}
              className="flex flex-1 flex-col"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="qr" className="gap-1.5 text-xs">
                  <IconQrcode className="h-3.5 w-3.5" />
                  QR code
                </TabsTrigger>
                <TabsTrigger value="link" className="gap-1.5 text-xs">
                  <IconLink className="h-3.5 w-3.5" />
                  Lien &amp; code
                </TabsTrigger>
              </TabsList>

              {/* ── QR code ── */}
              <TabsContent
                value="qr"
                className="mt-4 flex flex-1 flex-col justify-between gap-4"
              >
                {qrValue ? (
                  <>
                    <div className="flex flex-col items-center gap-3">
                      <div className="rounded-lg bg-white p-3 shadow-sm">
                        <QRCodeCanvas
                          id="qr-export-canvas"
                          value={qrValue}
                          size={200}
                          level="M"
                          marginSize={1}
                          className="h-auto w-full max-w-[200px]"
                        />
                      </div>
                      {canInline ? (
                        <p className="text-muted-foreground flex items-start gap-1.5 text-center text-xs text-pretty">
                          <IconWifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Tout l’itinéraire tient dans ce code : il fonctionne
                            sans connexion et n’expire pas.
                          </span>
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-center text-xs text-pretty">
                          Scannez ce code, ou saisissez{' '}
                          <span className="text-foreground font-mono font-medium whitespace-nowrap">
                            {formatShareCode(share?.code ?? '')}
                          </span>{' '}
                          sur l’autre appareil.
                        </p>
                      )}
                    </div>

                    <div className="flex w-full flex-col gap-2">
                      {nativeShareButton}
                      <div className="flex w-full gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setRevision((r) => r + 1)}
                          className="flex-1 gap-2 text-xs sm:text-sm"
                        >
                          <IconRefresh className="h-4 w-4" />
                          Régénérer
                        </Button>
                        <Button
                          variant={nativeShareButton ? 'outline' : 'default'}
                          onClick={handleDownload}
                          className="flex-1 gap-2 text-xs sm:text-sm"
                        >
                          <IconDownload className="h-4 w-4" />
                          Télécharger
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 items-center justify-center py-4">
                      {remoteCta}
                    </div>
                    <Button onClick={handleCreateCode} className="w-full gap-2">
                      <IconCloudUpload className="h-4 w-4" />
                      Générer le QR code
                    </Button>
                  </>
                )}
              </TabsContent>

              {/* ── Lien à envoyer, code à recopier ── */}
              <TabsContent
                value="link"
                className="mt-4 flex flex-1 flex-col justify-between gap-4"
              >
                {share && shareUrl ? (
                  <>
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-muted-foreground text-center text-sm text-pretty">
                        Envoyez le lien, ou dictez le code : les deux ouvrent le
                        même voyage.
                      </p>
                      <p className="bg-muted/60 border-border text-foreground rounded-lg border px-4 py-3 font-mono text-2xl font-semibold tracking-[0.2em] tabular-nums">
                        {formatShareCode(share.code)}
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

                    <div className="flex w-full flex-col gap-2">
                      {nativeShareButton}
                      {copyActions}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 items-center justify-center py-4">
                      {remoteCta}
                    </div>
                    <Button onClick={handleCreateCode} className="w-full gap-2">
                      <IconCloudUpload className="h-4 w-4" />
                      Générer un lien
                    </Button>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
