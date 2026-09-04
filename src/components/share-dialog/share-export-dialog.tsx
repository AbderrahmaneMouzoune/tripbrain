'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
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
  IconKey,
  IconLink,
  IconPackage,
  IconQrcode,
  IconRefresh,
  IconSearch,
  IconServer,
  IconWifiOff,
} from '@tabler/icons-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  SHARE_INLINE_LIMIT,
  compressItinerary,
  createShareCode,
  formatExpiresIn,
  formatShareCode,
  getInlineQrUrl,
  getShareCodeUrl,
  type ShareCode,
} from '@/lib/share'
import { useClipboard } from '@/hooks/use-clipboard'
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
  { label: 'Génération du code…', Icon: IconKey },
]

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
  const [tab, setTab] = useState<'qr' | 'code'>('qr')

  const codeClipboard = useClipboard()
  const linkClipboard = useClipboard()

  const isBusy = state.status === 'compressing' || isSharing

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
      .then((compressed) => setState({ status: 'ready', compressed }))
      .catch((err) =>
        setState({ status: 'error', message: toFrenchError(err, 'compress') }),
      )
  }, [open, itinerary, revision])

  const handleCreateCode = useCallback(async () => {
    if (state.status !== 'ready') return

    setShareError(null)
    setIsSharing(true)
    try {
      setShare(await createShareCode(state.compressed))
    } catch (err) {
      setShareError(toFrenchError(err, 'share'))
    } finally {
      setIsSharing(false)
    }
  }, [state])

  const handleDownload = useCallback(() => {
    const canvas = document.querySelector(
      '#qr-export-canvas',
    ) as HTMLCanvasElement | null
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'tripbrain-qrcode.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [])

  const handleNavBack = useCallback(() => {
    onOpenChange(false)
    onNavBack?.()
  }, [onOpenChange, onNavBack])

  const activeSteps = isSharing ? UPLOADING_STEPS : LOADING_STEPS

  // Un itinéraire compact tient entièrement dans le QR code : rien n'est envoyé
  // sur le réseau, et le code scanné fonctionne indéfiniment.
  const canInline =
    state.status === 'ready' && state.compressed.length <= SHARE_INLINE_LIMIT

  const qrValue =
    state.status !== 'ready'
      ? null
      : canInline
        ? getInlineQrUrl(state.compressed)
        : share
          ? getShareCodeUrl(share.code)
          : null

  const sizeKb =
    state.status === 'ready'
      ? (state.compressed.length / 1024).toFixed(1)
      : null

  const expiresIn = formatExpiresIn(share?.expiresAt ?? null)

  /** Explication + bouton communs aux deux onglets quand le serveur est requis. */
  const remoteCta = (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="bg-primary/10 rounded-full p-4">
        <IconCloudUpload className="text-primary h-8 w-8" />
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {tab === 'qr' && canInline === false && sizeKb
          ? `Cet itinéraire (${sizeKb} Ko) est trop volumineux pour tenir dans un QR code. `
          : ''}
        Vos données seront déposées sur un serveur, accessibles uniquement avec
        le code généré, puis{' '}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {/* Bouton retour — ferme cette dialog et ré-ouvre la précédente */}
        {onNavBack && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Retour"
            onClick={handleNavBack}
            className="absolute top-4 left-4 h-7 w-7 opacity-70 hover:opacity-100"
          >
            <IconArrowLeft className="h-4 w-4" />
            <span className="sr-only">Retour</span>
          </Button>
        )}

        <DialogHeader className={onNavBack ? 'pl-6' : undefined}>
          <DialogTitle className="flex items-center gap-2">
            <IconQrcode className="h-5 w-5" />
            Partager l’itinéraire
          </DialogTitle>
        </DialogHeader>

        {/* Conteneur stable — min-h évite le layout shift entre les états */}
        <div className="flex min-h-[24rem] flex-col py-2">
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
              onValueChange={(value) => setTab(value as 'qr' | 'code')}
              className="flex flex-1 flex-col"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="qr" className="gap-1.5 text-xs">
                  <IconQrcode className="h-3.5 w-3.5" />
                  QR Code
                </TabsTrigger>
                <TabsTrigger value="code" className="gap-1.5 text-xs">
                  <IconKey className="h-3.5 w-3.5" />
                  Code
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
                        />
                      </div>
                      {canInline ? (
                        <p className="text-muted-foreground flex items-center gap-1.5 text-center text-xs">
                          <IconWifiOff className="h-3.5 w-3.5 shrink-0" />
                          Tout l’itinéraire tient dans ce code : il fonctionne
                          sans connexion et n’expire pas.
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-center text-xs">
                          Scannez ce code, ou saisissez{' '}
                          <span className="text-foreground font-mono font-medium">
                            {formatShareCode(share?.code ?? '')}
                          </span>{' '}
                          sur l’autre appareil.
                        </p>
                      )}
                    </div>

                    <div className="flex w-full gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setRevision((r) => r + 1)}
                        className="flex-1 gap-2"
                      >
                        <IconRefresh className="h-4 w-4" />
                        Régénérer
                      </Button>
                      <Button onClick={handleDownload} className="flex-1 gap-2">
                        <IconDownload className="h-4 w-4" />
                        Télécharger
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 items-center justify-center">
                      {remoteCta}
                    </div>
                    <Button onClick={handleCreateCode} className="w-full gap-2">
                      <IconCloudUpload className="h-4 w-4" />
                      Générer le QR Code
                    </Button>
                  </>
                )}
              </TabsContent>

              {/* ── Code à recopier ── */}
              <TabsContent
                value="code"
                className="mt-4 flex flex-1 flex-col justify-between gap-4"
              >
                {share ? (
                  <>
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-muted-foreground text-center text-sm">
                        Saisissez ce code sur l’autre appareil pour y retrouver
                        le voyage.
                      </p>
                      <p className="bg-muted/60 border-border text-foreground rounded-lg border px-4 py-3 font-mono text-2xl font-semibold tracking-[0.2em] tabular-nums">
                        {formatShareCode(share.code)}
                      </p>
                      {expiresIn && (
                        <p className="text-muted-foreground text-center text-xs">
                          Valable encore {expiresIn}.
                        </p>
                      )}
                    </div>

                    <div className="flex w-full gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          linkClipboard.copy(getShareCodeUrl(share.code))
                        }
                        className="flex-1 gap-2"
                      >
                        {linkClipboard.copied ? (
                          <IconCheck className="h-4 w-4" />
                        ) : (
                          <IconLink className="h-4 w-4" />
                        )}
                        {linkClipboard.copied ? 'Copié' : 'Le lien'}
                      </Button>
                      <Button
                        onClick={() => codeClipboard.copy(share.code)}
                        className="flex-1 gap-2"
                      >
                        {codeClipboard.copied ? (
                          <IconCheck className="h-4 w-4" />
                        ) : (
                          <IconCopy className="h-4 w-4" />
                        )}
                        {codeClipboard.copied ? 'Copié' : 'Le code'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 items-center justify-center">
                      {remoteCta}
                    </div>
                    <Button onClick={handleCreateCode} className="w-full gap-2">
                      <IconCloudUpload className="h-4 w-4" />
                      Générer un code
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
